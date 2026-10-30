import { X509Certificate } from "crypto";
import * as tls from "tls";
import type { FetchLike } from "../crm/crmSession";

/**
 * TLS errors of a server that sends only its own certificate without the intermediate one.
 * Browsers download the missing intermediate from the certificate's AIA link; Node does not.
 */
export const MISSING_CHAIN_CODES = ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"];

const MAX_CHAIN = 4;
const NETWORK_TIMEOUT_MS = 10000;
const MAX_CERT_BYTES = 64 * 1024;

/** The parts of X509Certificate the chain check uses (fakes in tests). */
export interface ChainCert {
	readonly ca: boolean;
	readonly infoAccess: string | undefined;
	readonly validFrom: string;
	readonly validTo: string;
	checkIssued(other: ChainCert): boolean;
	verify(publicKey: X509Certificate["publicKey"]): boolean;
	readonly publicKey: X509Certificate["publicKey"];
	toString(): string;
}

export interface ChainDeps {
	/** Certificates trusted now (PEM). */
	trusted: () => string[];
	/** Replaces the trusted certificates; absent when Node has no such API. */
	setTrusted?: (pems: string[]) => void;
	/** The server's own certificate, read without verification. */
	peerCertificate: (host: string, port: number) => Promise<ChainCert>;
	/** Downloads a certificate from an AIA "CA Issuers" link; null when it is not a single certificate. */
	download: (url: string) => Promise<ChainCert | null>;
	parse: (pem: string) => ChainCert;
	now?: () => Date;
}

/** Error code from a failed fetch: Node puts the TLS reason into the cause. */
export function fetchErrorCode(e: unknown): string | undefined {
	const code = (e as { cause?: { code?: unknown } } | null | undefined)?.cause?.code;
	return typeof code === "string" ? code : undefined;
}

/** First "CA Issuers" URL of the certificate's AIA extension. */
export function caIssuersUrl(cert: ChainCert): string | undefined {
	const match = /CA Issuers - URI:(\S+)/.exec(cert.infoAccess ?? "");
	return match?.[1];
}

function isValidNow(cert: ChainCert, now: Date): boolean {
	return new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);
}

function signedBy(cert: ChainCert, issuer: ChainCert): boolean {
	try {
		return cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
	} catch {
		return false;
	}
}

/**
 * Downloads the intermediates missing from the server's chain. Returns their PEMs only when
 * the chain ends at an already trusted certificate, otherwise null: a downloaded certificate
 * is never trusted on its own, so a forged AIA link cannot add a new root.
 */
export async function findMissingIntermediates(leaf: ChainCert, deps: ChainDeps): Promise<string[] | null> {
	const now = deps.now?.() ?? new Date();
	const trusted: ChainCert[] = [];
	for (const pem of deps.trusted()) {
		try {
			trusted.push(deps.parse(pem));
		} catch {
			// a certificate Node cannot parse cannot be an issuer either
		}
	}
	const added: string[] = [];
	let cert = leaf;
	for (let depth = 0; depth <= MAX_CHAIN; depth++) {
		if (trusted.some((root) => signedBy(cert, root))) {
			return added.length > 0 ? added : null;
		}
		if (depth === MAX_CHAIN) {
			return null;
		}
		const url = caIssuersUrl(cert);
		if (!url) {
			return null;
		}
		const issuer = await deps.download(url);
		if (!issuer || !issuer.ca || !isValidNow(issuer, now) || !signedBy(cert, issuer)) {
			return null;
		}
		added.push(issuer.toString());
		cert = issuer;
	}
	return null;
}

/** Adds the missing intermediates of the server to the trusted certificates; true when added. */
export async function repairCertificateChain(url: string, deps: ChainDeps = nodeChainDeps()): Promise<boolean> {
	if (!deps.setTrusted) {
		return false;
	}
	const target = new URL(url);
	if (target.protocol !== "https:") {
		return false;
	}
	const leaf = await deps.peerCertificate(target.hostname, Number(target.port) || 443);
	const missing = await findMissingIntermediates(leaf, deps);
	if (!missing) {
		return false;
	}
	deps.setTrusted(Array.from(new Set([...deps.trusted(), ...missing])));
	return true;
}

const repairs = new Map<string, Promise<boolean>>();

/** One repair per server at a time; a failed one may be tried again on the next request. */
function repairOnce(url: string, deps?: ChainDeps): Promise<boolean> {
	const origin = new URL(url).origin;
	let pending = repairs.get(origin);
	if (!pending) {
		pending = repairCertificateChain(url, deps).catch(() => false);
		repairs.set(origin, pending);
		void pending.then((ok) => {
			if (!ok) {
				repairs.delete(origin);
			}
		});
	}
	return pending;
}

/**
 * Wraps fetch: when the server does not send its intermediate certificate, downloads it
 * (as a browser does), checks it chains to a trusted root and repeats the request once.
 * The TLS error comes before the request is sent, so repeating a POST is safe.
 */
export function withCertificateChainRepair(fetchImpl: FetchLike, deps?: ChainDeps): FetchLike {
	return (async (input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]) => {
		try {
			return await fetchImpl(input, init);
		} catch (e) {
			const code = fetchErrorCode(e);
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (!code || !MISSING_CHAIN_CODES.includes(code) || !(await repairOnce(url, deps))) {
				throw e;
			}
			return fetchImpl(input, init);
		}
	}) as FetchLike;
}

interface TlsCaApi {
	getCACertificates?: (type: "default") => string[];
	setDefaultCACertificates?: (certs: string[]) => void;
}

/** Real dependencies: Node's default CA list (Node 22.19+ / 24+), a raw TLS handshake, fetch for AIA. */
export function nodeChainDeps(): ChainDeps {
	const api = tls as unknown as TlsCaApi;
	const getCa = api.getCACertificates;
	const setCa = api.setDefaultCACertificates;
	return {
		trusted: () => (getCa ? getCa("default") : []),
		setTrusted: getCa && setCa ? (pems) => setCa(pems) : undefined,
		parse: (pem) => new X509Certificate(pem),
		peerCertificate: (host, port) =>
			new Promise<ChainCert>((resolve, reject) => {
				// rejectUnauthorized: false only to read the certificate; nothing is sent over this connection
				const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: NETWORK_TIMEOUT_MS }, () => {
					const raw = socket.getPeerCertificate(false)?.raw;
					socket.end();
					if (raw) {
						resolve(new X509Certificate(raw));
					} else {
						reject(new Error("сервер не прислал сертификат"));
					}
				});
				socket.on("timeout", () => socket.destroy(new Error("таймаут TLS")));
				socket.on("error", reject);
			}),
		download: async (url) => {
			if (!/^https?:\/\//i.test(url)) {
				return null;
			}
			const response = await fetch(url, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
			if (!response.ok) {
				return null;
			}
			const body = Buffer.from(await response.arrayBuffer());
			if (body.length > MAX_CERT_BYTES) {
				return null;
			}
			try {
				return new X509Certificate(body);
			} catch {
				// PKCS#7 bundles (.p7c) are not supported
				return null;
			}
		},
	};
}
