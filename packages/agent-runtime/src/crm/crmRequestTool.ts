import { errorMessage } from "../db/crmDbTool";
import type { AppTool, AppToolResult } from "../tools/appTool";
import { CrmConnection, CrmLoginError, CrmSession, CrmStoppedError, CrmTimeoutError, FetchLike } from "./crmSession";

export const CRM_REQUEST_TOOL = "crm_request";
export const DEFAULT_REQUEST_MAX_CHARS = 4000;
const MAX_REQUEST_MAX_CHARS = 50000;
const REQUEST_TIMEOUT_MS = 120000;
const BODY_PREVIEW_CHARS = 500;
const FALLBACK = "Не повторяй вызов: попроси пользователя выполнить запрос самому или проверить подключение к CRM в настройках приложения.";
const TIMEOUT_FALLBACK = "Запрос мог выполниться на стенде: не повторяй его вслепую — проверь результат чтением данных или журналом стенда, или спроси пользователя.";

const DESCRIPTION = "Один HTTP-запрос к стенду CRM под учётной записью из настроек: вход и заголовок BPMCSRF инструмент делает сам. Возвращает HTTP <код> и тело ответа (обрезано до maxChars). GET и POST DataService SelectQuery выполняются сразу; любой другой POST (изменение данных, свои сервисы, запуск процесса) пользователь разрешает сам.";

export interface CrmRequestRecord { method: string; path: string; status?: number; durationMs: number; error?: string; denied?: boolean; stopped?: boolean }
export interface CrmRequestToolOptions {
	connection: CrmConnection;
	/** Asked before each request that may change data; false → not sent. Without it such requests are refused. */
	confirm?: (action: string) => Promise<boolean>;
	onRequest?: (record: CrmRequestRecord) => void;
	fetchImpl?: FetchLike;
	signal?: AbortSignal;
}

/** True for a path relative to the stand root: starts with one "/" and has no scheme. */
export function isStandPath(requestPath: string): boolean {
	return requestPath.startsWith("/") && !requestPath.startsWith("//") && !requestPath.includes("://");
}

/** "HTTP <code>" and the body cut to maxChars with a note about the full length. */
export function formatCrmResponse(status: number, text: string, maxChars: number): string {
	const shown = text.length > maxChars ? `${text.slice(0, maxChars)}\n… (обрезано, всего ${text.length} символов)` : text;
	const head = `HTTP ${status}`;
	return shown ? `${head}\n${shown}` : head;
}

/** Requests that only read: GET and DataService SelectQuery. */
export function isReadOnlyCrmRequest(method: "GET" | "POST", requestPath: string): boolean {
	if (method === "GET") {
		return true;
	}
	const bare = requestPath.split(/[?#]/)[0] ?? "";
	return /\/DataService\/json\/(SyncReply|reply)\/SelectQuery\/?$/i.test(bare);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** REST request tool of the chat: path only on the stand, credentials never shown to the agent. */
export function createCrmRequestTool(options: CrmRequestToolOptions): AppTool {
	return {
		name: CRM_REQUEST_TOOL,
		description: DESCRIPTION,
		params: {
			method: { type: "string", description: "GET или POST" },
			path: { type: "string", description: "Путь от адреса стенда, начинается с /: например /rest/<Сервис>/<Метод> или /DataService/json/SyncReply/SelectQuery" },
			body: { type: "string", optional: true, description: "Тело POST — текст JSON (по умолчанию {}); у GET тела нет" },
			maxChars: { type: "number", optional: true, description: `Сколько символов ответа показать (по умолчанию ${DEFAULT_REQUEST_MAX_CHARS}, не больше ${MAX_REQUEST_MAX_CHARS})` },
		},
		execute: async (args): Promise<AppToolResult> => {
			const method = String(args.method ?? "").trim().toUpperCase();
			const requestPath = String(args.path ?? "").trim();
			if (method !== "GET" && method !== "POST") {
				return { text: `Метод должен быть GET или POST: ${String(args.method ?? "")}`, isError: true };
			}
			if (!isStandPath(requestPath)) {
				return { text: "Путь должен начинаться с / и вести на стенд CRM (без адреса сервера)", isError: true };
			}
			let maxChars = DEFAULT_REQUEST_MAX_CHARS;
			if (args.maxChars !== undefined && args.maxChars !== null) {
				const value = Number(args.maxChars);
				if (!Number.isInteger(value) || value < 0) {
					return { text: "maxChars: нужно неотрицательное целое число", isError: true };
				}
				maxChars = Math.min(value, MAX_REQUEST_MAX_CHARS);
			}
			const rawBody = optionalString(args.body);
			let body: string | null = null;
			if (method === "GET") {
				if (rawBody !== undefined) {
					return { text: "У GET-запроса не бывает тела", isError: true };
				}
			} else {
				body = rawBody ?? "{}";
				try {
					JSON.parse(body);
				} catch (e) {
					return { text: `Тело не является JSON: ${errorMessage(e)}`, isError: true };
				}
			}

			const record = (fields: Partial<CrmRequestRecord> & { durationMs: number }) => options.onRequest?.({ method, path: requestPath, ...fields });
			if (options.signal?.aborted) {
				record({ durationMs: 0, stopped: true, error: "Остановлено пользователем" });
				return { text: "Остановлено пользователем", isError: true };
			}
			if (!isReadOnlyCrmRequest(method, requestPath)) {
				if (!options.confirm) {
					return { text: "Этот запрос может изменить данные и требует подтверждения пользователя, а спросить его нельзя", isError: true };
				}
				const preview = body !== null && body.length > BODY_PREVIEW_CHARS ? `${body.slice(0, BODY_PREVIEW_CHARS)}…` : body;
				const approved = await options.confirm(`REST-запрос к CRM: ${method} ${requestPath}${preview ? `\n${preview}` : ""}`);
				if (!approved) {
					record({ durationMs: 0, denied: true, error: "Пользователь отклонил запрос" });
					return { text: "Пользователь отклонил запрос", isError: true };
				}
			}

			const started = Date.now();
			const session = new CrmSession(options.connection, options.fetchImpl);
			try {
				await session.login(undefined, options.signal);
				const response = await session.request(method, requestPath, body, REQUEST_TIMEOUT_MS, options.signal);
				record({ durationMs: Date.now() - started, status: response.status });
				return { text: formatCrmResponse(response.status, response.text, maxChars), isError: response.status >= 400 };
			} catch (e) {
				if (e instanceof CrmStoppedError) {
					record({ durationMs: Date.now() - started, stopped: true, error: "Остановлено пользователем" });
					return { text: "Остановлено пользователем: запрос прерван. На стенде он мог выполниться — не повторяй его, пока пользователь не попросит.", isError: true };
				}
				const message = errorMessage(e).replace(/[.\s]+$/, "");
				record({ durationMs: Date.now() - started, error: message });
				if (e instanceof CrmTimeoutError) {
					return { text: `CRM не ответила: ${message}. ${TIMEOUT_FALLBACK}`, isError: true };
				}
				const prefix = e instanceof CrmLoginError ? "Вход в CRM не выполнен" : "CRM недоступна";
				return { text: `${prefix}: ${message}. ${FALLBACK}`, isError: true };
			}
		},
	};
}
