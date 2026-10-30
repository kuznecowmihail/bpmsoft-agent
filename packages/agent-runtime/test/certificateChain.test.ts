import { describe, it, expect } from "vitest";
import type { FetchLike } from "../src/crm/crmSession";
import { caIssuersUrl, ChainCert, ChainDeps, findMissingIntermediates, repairCertificateChain, withCertificateChainRepair } from "../src/tools/certificateChain";

/** Fake certificate: "signed by" the certificate whose name is in issuer. */
function cert(name: string, issuer: string, options: { ca?: boolean; aia?: string; validTo?: string } = {}): ChainCert {
	const key = { name } as unknown as ChainCert["publicKey"];
	return {
		ca: options.ca ?? true,
		infoAccess: options.aia ? `CA Issuers - URI:${options.aia}\nOCSP - URI:http://ocsp.example.com\n` : undefined,
		validFrom: "Jan 1 00:00:00 2020 GMT",
		validTo: options.validTo ?? "Jan 1 00:00:00 2030 GMT",
		publicKey: key,
		checkIssued: (other) => (other.publicKey as unknown as { name: string }).name === issuer,
		verify: (publicKey) => (publicKey as unknown as { name: string }).name === issuer,
		toString: () => `PEM:${name}`,
	};
}

const ROOT = cert("root", "root");
const INTERMEDIATE = cert("intermediate", "root", { aia: "http://ca.example.com/root.crt" });
const LEAF = cert("leaf", "intermediate", { ca: false, aia: "http://ca.example.com/intermediate.crt" });

function deps(downloads: Record<string, ChainCert>, trusted: ChainCert[] = [ROOT]): ChainDeps & { set: string[][]; fetched: string[] } {
	const byPem = new Map(trusted.map((c) => [c.toString(), c]));
	const set: string[][] = [];
	const fetched: string[] = [];
	return {
		set,
		fetched,
		trusted: () => [...byPem.keys()],
		setTrusted: (pems) => set.push(pems),
		parse: (pem) => {
			const found = byPem.get(pem);
			if (!found) {
				throw new Error("unknown pem");
			}
			return found;
		},
		peerCertificate: async () => LEAF,
		download: async (url) => {
			fetched.push(url);
			return downloads[url] ?? null;
		},
		now: () => new Date("2026-10-30T00:00:00Z"),
	};
}

describe("findMissingIntermediates", () => {
	it("downloads the intermediate that chains to a trusted root", async () => {
		const d = deps({ "http://ca.example.com/intermediate.crt": INTERMEDIATE });
		expect(await findMissingIntermediates(LEAF, d)).toEqual(["PEM:intermediate"]);
	});

	it("does not trust a downloaded certificate that chains to an unknown root", async () => {
		const fakeRoot = cert("fake-root", "fake-root");
		const fakeIntermediate = cert("intermediate", "fake-root", { aia: "http://evil.example.com/root.crt" });
		const d = deps({ "http://ca.example.com/intermediate.crt": fakeIntermediate, "http://evil.example.com/root.crt": fakeRoot });
		expect(await findMissingIntermediates(LEAF, d)).toBeNull();
	});

	it("rejects a downloaded certificate that did not sign the server certificate", async () => {
		const other = cert("other", "root");
		const d = deps({ "http://ca.example.com/intermediate.crt": other });
		expect(await findMissingIntermediates(LEAF, d)).toBeNull();
	});

	it("rejects a non-CA or expired intermediate", async () => {
		const notCa = cert("intermediate", "root", { ca: false });
		expect(await findMissingIntermediates(LEAF, deps({ "http://ca.example.com/intermediate.crt": notCa }))).toBeNull();
		const expired = cert("intermediate", "root", { validTo: "Jan 1 00:00:00 2025 GMT" });
		expect(await findMissingIntermediates(LEAF, deps({ "http://ca.example.com/intermediate.crt": expired }))).toBeNull();
	});

	it("returns null when nothing is missing or there is no AIA link", async () => {
		expect(await findMissingIntermediates(LEAF, deps({}, [ROOT, INTERMEDIATE]))).toBeNull();
		expect(await findMissingIntermediates(cert("leaf", "intermediate"), deps({}))).toBeNull();
	});
});

describe("repairCertificateChain", () => {
	it("adds the intermediate to the trusted certificates", async () => {
		const d = deps({ "http://ca.example.com/intermediate.crt": INTERMEDIATE });
		expect(await repairCertificateChain("https://jira.example.com/rest/api/2/myself", d)).toBe(true);
		expect(d.set).toEqual([["PEM:root", "PEM:intermediate"]]);
	});

	it("does nothing for http or without the Node API", async () => {
		const d = deps({ "http://ca.example.com/intermediate.crt": INTERMEDIATE });
		expect(await repairCertificateChain("http://jira.example.com", d)).toBe(false);
		expect(await repairCertificateChain("https://jira.example.com", { ...d, setTrusted: undefined })).toBe(false);
		expect(d.set).toEqual([]);
	});
});

describe("caIssuersUrl", () => {
	it("reads the CA Issuers link", () => {
		expect(caIssuersUrl(LEAF)).toBe("http://ca.example.com/intermediate.crt");
		expect(caIssuersUrl(ROOT)).toBeUndefined();
	});
});

describe("withCertificateChainRepair", () => {
	function tlsError(code: string): Error {
		return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
	}

	function flakyFetch(error: Error): { fetchImpl: FetchLike; calls: () => number } {
		let calls = 0;
		const fetchImpl = (async () => {
			calls++;
			if (calls === 1) {
				throw error;
			}
			return new Response("ok");
		}) as unknown as FetchLike;
		return { fetchImpl, calls: () => calls };
	}

	it("repeats the request once after the chain is repaired", async () => {
		const d = deps({ "http://ca.example.com/intermediate.crt": INTERMEDIATE });
		const f = flakyFetch(tlsError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"));
		const response = await withCertificateChainRepair(f.fetchImpl, d)("https://repaired.example.com/x");
		expect(await response.text()).toBe("ok");
		expect(f.calls()).toBe(2);
	});

	it("rethrows the original error when the chain cannot be repaired", async () => {
		const d = deps({});
		const f = flakyFetch(tlsError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"));
		await expect(withCertificateChainRepair(f.fetchImpl, d)("https://broken.example.com/x")).rejects.toThrow("fetch failed");
		expect(f.calls()).toBe(1);
	});

	it("does not touch other network errors", async () => {
		const d = deps({ "http://ca.example.com/intermediate.crt": INTERMEDIATE });
		const f = flakyFetch(tlsError("ECONNREFUSED"));
		await expect(withCertificateChainRepair(f.fetchImpl, d)("https://refused.example.com/x")).rejects.toThrow("fetch failed");
		expect(f.calls()).toBe(1);
		expect(d.fetched).toEqual([]);
	});
});
