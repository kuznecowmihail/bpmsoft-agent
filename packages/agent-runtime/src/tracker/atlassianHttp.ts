import type { FetchLike } from "../crm/crmSession";

/** Connection to Jira or Confluence: base URL, email for Cloud (Basic with an API token), token. */
export interface AtlassianConnection {
	url: string;
	email?: string;
	token: string;
}

/** Jira connection with the optional custom field that holds acceptance criteria (customfield_…). */
export interface JiraConnection extends AtlassianConnection {
	acceptanceField?: string;
}

/** Tracker settings for the tools: each part is present only when it is configured. */
export interface TrackerConfig {
	jira?: JiraConnection;
	confluence?: AtlassianConnection;
}

/** Timeout of one request to Jira or Confluence. */
export const ATLASSIAN_TIMEOUT_MS = 30000;

/** Error with a text for the user; never contains the token. */
export class AtlassianError extends Error {}

/** Authorization header: Basic email:token for Cloud, Bearer personal access token for Server/Data Center. */
export function authHeader(conn: AtlassianConnection): string {
	return conn.email ? `Basic ${Buffer.from(`${conn.email}:${conn.token}`).toString("base64")}` : `Bearer ${conn.token}`;
}

/** Base URL without trailing slashes. */
export function baseUrl(conn: AtlassianConnection): string {
	return conn.url.trim().replace(/\/+$/, "");
}

/** Message of an unknown thrown value. */
export function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** Sends one REST request and returns the parsed JSON; throws AtlassianError with a text for the user. */
export async function atlassianJson(
	service: "Jira" | "Confluence",
	conn: AtlassianConnection,
	apiPath: string,
	options: { method?: "GET" | "POST"; body?: unknown; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<unknown> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? ATLASSIAN_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	try {
		response = await fetchImpl(`${baseUrl(conn)}${apiPath}`, {
			method: options.method ?? "GET",
			headers: {
				Authorization: authHeader(conn),
				Accept: "application/json",
				...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal: controller.signal,
		});
	} catch (e) {
		clearTimeout(timer);
		if (controller.signal.aborted) {
			throw new AtlassianError(`${service} не ответила за ${Math.round(timeoutMs / 1000)} с`);
		}
		const cause = e instanceof Error && e.cause instanceof Error ? ` (${(e.cause as NodeJS.ErrnoException).code ?? e.cause.message})` : "";
		throw new AtlassianError(`${service} недоступна: ${errorText(e)}${cause}`);
	}
	clearTimeout(timer);
	const text = await response.text();
	if (response.status === 401 || response.status === 403) {
		throw new AtlassianError(`${service}: нет доступа (HTTP ${response.status}) — проверь адрес, email и токен в настройках`);
	}
	if (response.status === 404) {
		throw new AtlassianError(`${service}: не найдено (HTTP 404)`);
	}
	if (!response.ok) {
		throw new AtlassianError(`${service}: ошибка HTTP ${response.status}: ${text.slice(0, 300)}`);
	}
	if (text.trim() === "") {
		return {};
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new AtlassianError(`${service}: ответ не JSON — проверь адрес (у Confluence Cloud он заканчивается на /wiki)`);
	}
}
