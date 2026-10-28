import { Agent, fetch as undiciFetch } from "undici";
import { errorMessage } from "../db/crmDbTool";

export interface CrmConnection { url: string; user: string; password: string }
export interface CrmResponse { status: number; text: string; json: unknown }
export type FetchLike = typeof fetch;

/** Node's fetch drops a request after 300 s without response headers; CRM update and build run longer, our own timer limits them. */
const LONG_REQUESTS = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const TIMEOUT_CODES = ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"];

export class CrmLoginError extends Error {}
export class CrmUnavailableError extends Error {}
/** No answer in time: the action on the stand may still run. */
export class CrmTimeoutError extends CrmUnavailableError {}
/** The user stopped the request: not a failure of the CRM. */
export class CrmStoppedError extends Error {}

const LOGIN_PATH = "/ServiceModel/AuthService.svc/Login";
const DEFAULT_LOGIN_TIMEOUT_MS = 30000;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Accept": "application/json" };

interface RawResponse { status: number; text: string; headers: Headers }

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Network error text; Node puts the reason (for example ECONNREFUSED) into the cause. */
function networkMessage(e: unknown): string {
	const message = errorMessage(e);
	const code = (e as { cause?: { code?: unknown } } | null | undefined)?.cause?.code;
	return typeof code === "string" && code && !message.includes(code) ? `${message} (${code})` : message;
}

/** Logged-in HTTP session to a BPMSoft CRM stand (cookies + BPMCSRF). */
export class CrmSession {
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;
	private readonly cookies = new Map<string, string>();

	constructor(private readonly connection: CrmConnection, fetchImpl?: FetchLike) {
		this.baseUrl = connection.url.replace(/\/+$/, "");
		this.fetchImpl = fetchImpl ?? ((input, init) => undiciFetch(input as never, { ...(init ?? {}), dispatcher: LONG_REQUESTS } as never) as unknown as Promise<Response>);
	}

	/** Throws CrmLoginError (wrong login, message from the CRM) or CrmUnavailableError (network/HTTP failure). */
	async login(timeoutMs: number = DEFAULT_LOGIN_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
		const body = JSON.stringify({ UserName: this.connection.user, UserPassword: this.connection.password });
		const response = await this.send("POST", LOGIN_PATH, body, timeoutMs, signal);
		if (response.status !== 200) {
			throw new CrmUnavailableError(`HTTP ${response.status}`);
		}
		const json = parseJson(response.text);
		if (!isRecord(json)) {
			throw new CrmUnavailableError("CRM вернула неожиданный ответ на вход");
		}
		if (json.Code !== 0) {
			throw new CrmLoginError(typeof json.Message === "string" && json.Message ? json.Message : `код ${String(json.Code)}`);
		}
	}

	/** POST with body null after login(); throws CrmUnavailableError on network failure or timeout. */
	async post(path: string, timeoutMs: number, signal?: AbortSignal): Promise<CrmResponse> {
		const response = await this.send("POST", path, "null", timeoutMs, signal);
		return { status: response.status, text: response.text, json: parseJson(response.text) };
	}

	/** Request after login(): GET sends no body, POST sends the given text (null means no body). */
	async request(method: "GET" | "POST", path: string, body: string | null, timeoutMs: number, signal?: AbortSignal): Promise<CrmResponse> {
		const response = await this.send(method, path, body, timeoutMs, signal);
		return { status: response.status, text: response.text, json: parseJson(response.text) };
	}

	private async send(method: "GET" | "POST", path: string, body: string | null, timeoutMs: number, signal?: AbortSignal): Promise<RawResponse> {
		const headers: Record<string, string> = { ...JSON_HEADERS };
		if (this.cookies.size > 0) {
			headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
			const csrf = this.cookies.get("BPMCSRF");
			if (csrf !== undefined) {
				headers.BPMCSRF = csrf;
			}
		}

		if (signal?.aborted) {
			throw new CrmStoppedError("остановлено пользователем");
		}
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const onStop = () => controller.abort();
		signal?.addEventListener("abort", onStop, { once: true });
		try {
			const sendBody = method === "GET" ? undefined : body ?? undefined;
			const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body: sendBody, signal: controller.signal });
			const text = await response.text();
			this.absorbCookies(response.headers);
			return { status: response.status, text, headers: response.headers };
		} catch (e) {
			if (signal?.aborted) {
				throw new CrmStoppedError("остановлено пользователем");
			}
			if (controller.signal.aborted) {
				throw new CrmTimeoutError(`таймаут ${timeoutMs / 1000} с`);
			}
			const code = (e as { cause?: { code?: unknown } } | null | undefined)?.cause?.code;
			if (typeof code === "string" && TIMEOUT_CODES.includes(code)) {
				throw new CrmTimeoutError(networkMessage(e));
			}
			throw new CrmUnavailableError(networkMessage(e));
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onStop);
		}
	}

	private absorbCookies(headers: Headers): void {
		for (const raw of headers.getSetCookie()) {
			const pair = raw.split(";")[0] ?? "";
			const eq = pair.indexOf("=");
			if (eq > 0) {
				this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
			}
		}
	}
}
