import * as http from "http";
import * as path from "path";
import { errorMessage } from "../db/crmDbTool";
import { runPkgLintCli } from "../lint/pkgLintCli";
import { CrmConnection, CrmLoginError, CrmResponse, CrmSession, CrmTimeoutError, FetchLike } from "./crmSession";
import { CRM_COMPILE_TOOL, CRM_UPDATE_TOOL, createCrmTools, restartCrm } from "./crmTools";
import { formatCrmResponse, isStandPath } from "./crmRequestTool";

/** Dependencies of a stand action: stand root, knowledge folder and test hooks. */
export interface StandDeps {
	/** Stand root (folder with BPMSoft.Configuration). */
	root: string;
	/** Knowledge folder; pkg-lint reads its checks from here. */
	knowledgeDir: string;
	fetchImpl?: FetchLike;
	/** Tests: polling interval and limit for restart readiness. */
	restartPollMs?: number;
	restartLimitMs?: number;
	/** How long the browser login waits for the page (default 120000). */
	browserLoginTimeoutMs?: number;
}

/** Result of a stand action: success flag and text for the user. */
export interface StandResult {
	ok: boolean;
	text: string;
}

/** One REST request to the stand; path is relative to the stand root. */
export interface StandRequest {
	method: "GET" | "POST";
	path: string;
	body?: string;
	maxChars?: number;
}

/** Running browser login: text with instructions, promise of the outcome and a cancel function. */
export interface BrowserLoginHandle {
	ok: true;
	text: string;
	done: Promise<StandResult>;
	close(): void;
}

const REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_BROWSER_PORT = 8919;
const BROWSER_LOGIN_TIMEOUT_MS = 120000;

/** Failure text of login or request; the messages never contain the password. */
function failureText(e: unknown): string {
	const message = errorMessage(e).replace(/[.\s]+$/, "");
	const prefix = e instanceof CrmLoginError ? "Вход в CRM не выполнен" : e instanceof CrmTimeoutError ? "CRM не ответила" : "CRM недоступна";
	return `${prefix}: ${message}.`;
}

/** Runs one CRM tool of the chat flow against the stand root. */
async function runTool(name: string, connection: CrmConnection, deps: StandDeps): Promise<{ text: string; isError: boolean }> {
	const tool = createCrmTools({
		connection,
		appRoot: deps.root,
		fetchImpl: deps.fetchImpl,
		restartPollMs: deps.restartPollMs,
		restartLimitMs: deps.restartLimitMs,
	}).find((item) => item.name === name);
	if (!tool) {
		throw new Error(`нет инструмента ${name}`);
	}
	return tool.execute();
}

/** Update: pkg-lint of the changed files, then the CRM update from the file system. */
export async function standUpdate(connection: CrmConnection, deps: StandDeps): Promise<StandResult> {
	const pkgDir = path.join(deps.root, "BPMSoft.Configuration", "Pkg");
	const lint = runPkgLintCli(["--git", pkgDir], deps.knowledgeDir);
	if (lint.code === 1) {
		return { ok: false, text: `${lint.text}\nОбновление не выполнено: исправь ошибки pkg-lint.` };
	}
	const notes = [lint.code === 0 ? lint.text : `pkg-lint пропущен: ${lint.text.split("\n")[0] ?? ""}`];
	const result = await runTool(CRM_UPDATE_TOOL, connection, deps);
	return { ok: !result.isError, text: [...notes, result.text].join("\n") };
}

/** Compile: update first (Build re-exports packages and deletes schemas not loaded to the DB yet), then CRM compilation. */
export async function standCompile(connection: CrmConnection, deps: StandDeps): Promise<StandResult> {
	const update = await standUpdate(connection, deps);
	if (!update.ok) {
		return { ok: false, text: `Компиляция не запускалась: перед ней нужно обновление из файловой системы, а оно не прошло.\n${update.text}` };
	}
	const result = await runTool(CRM_COMPILE_TOOL, connection, deps);
	return { ok: !result.isError, text: `${update.text}\n${result.text}` };
}

/** Restart: restart of the application and waiting for it to answer. */
export async function standRestart(connection: CrmConnection, deps: StandDeps): Promise<StandResult> {
	const result = await restartCrm({
		connection,
		appRoot: deps.root,
		fetchImpl: deps.fetchImpl,
		restartPollMs: deps.restartPollMs,
		restartLimitMs: deps.restartLimitMs,
	});
	return { ok: result.success, text: result.text };
}

/** Request: one REST request to the stand after login; returns the status and the (truncated) body. */
export async function standRequest(connection: CrmConnection, deps: StandDeps, request: StandRequest): Promise<StandResult> {
	if (!isStandPath(request.path)) {
		return { ok: false, text: "Путь должен начинаться с / и вести на стенд CRM" };
	}
	if (request.method === "GET" && request.body !== undefined) {
		return { ok: false, text: "У GET-запроса не бывает тела" };
	}
	const body = request.method === "POST" ? (request.body ?? "{}") : null;

	const session = new CrmSession(connection, deps.fetchImpl);
	let response: CrmResponse;
	try {
		await session.login();
		response = await session.request(request.method, request.path, body, REQUEST_TIMEOUT_MS);
	} catch (e) {
		return { ok: false, text: failureText(e) };
	}
	return { ok: response.status < 400, text: formatCrmResponse(response.status, response.text, request.maxChars ?? DEFAULT_MAX_CHARS) };
}

/**
 * Browser login: serves the password once on 127.0.0.1 with CORS for the CRM origin. The user runs the printed
 * JavaScript on the CRM page; the page fetches the password and logs in itself, so the password never reaches the chat.
 * Only a GET with Origin equal to the CRM origin gets the password; any other request gets 403 and does not consume it.
 */
export function startBrowserLogin(
	connection: CrmConnection,
	deps: StandDeps,
	port: number = DEFAULT_BROWSER_PORT,
): Promise<BrowserLoginHandle | { ok: false; text: string }> {
	let origin: string;
	let basePath: string;
	try {
		const url = new URL(connection.url);
		origin = url.origin;
		basePath = url.pathname.replace(/\/+$/, "");
	} catch {
		return Promise.resolve({ ok: false, text: "Адрес CRM не похож на адрес (нужен http:// или https://)" });
	}
	const timeoutMs = deps.browserLoginTimeoutMs ?? BROWSER_LOGIN_TIMEOUT_MS;
	const loginPage = `${connection.url.replace(/\/+$/, "")}/Login/Login.html`;

	return new Promise((resolve) => {
		let served = false;
		let listening = false;
		let finished = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let resolveDone: (result: StandResult) => void = () => undefined;
		const done = new Promise<StandResult>((resolve) => {
			resolveDone = resolve;
		});
		const server = http.createServer();
		/** Ends the login once: clears the timer, closes the port and resolves done. */
		const finish = (result: StandResult) => {
			if (finished) {
				return;
			}
			finished = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			server.close();
			server.closeAllConnections();
			resolveDone(result);
		};
		server.on("request", (req, res) => {
			if (served) {
				res.statusCode = 404;
				res.end();
				return;
			}
			if (req.method !== "GET" || req.headers.origin !== origin) {
				process.stderr.write(`Запрос без адреса CRM (Origin: ${req.headers.origin ?? "нет"}) — пароль не отдан. Выполни фрагмент на странице ${loginPage}, адрес должен совпадать точно (localhost и 127.0.0.1 — разные адреса).\n`);
				res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
				res.end("Пароль отдаётся только странице CRM");
				return;
			}
			served = true;
			res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": origin });
			res.end(connection.password, () => finish({ ok: true, text: "Пароль передан странице" }));
		});
		server.on("error", (e) => {
			const result = { ok: false, text: `Не удалось открыть порт ${port}: ${errorMessage(e)}` };
			if (listening) {
				finish(result);
			} else {
				finished = true;
				resolve({ ok: false, text: result.text });
			}
		});
		server.listen(port, "127.0.0.1", () => {
			listening = true;
			const address = server.address();
			const actualPort = typeof address === "object" && address !== null ? address.port : port;
			const script = [
				"(async () => {",
				`const pw = await fetch("http://127.0.0.1:${actualPort}/").then(r => r.text());`,
				`const r = await fetch(${JSON.stringify(`${basePath}/ServiceModel/AuthService.svc/Login`)}, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({UserName: ${JSON.stringify(connection.user)}, UserPassword: pw})});`,
				`return r.status + " " + (await r.text()).slice(0, 80); })()`,
			].join(" ");
			const text = [
				`Открой в браузере страницу входа: ${loginPage}`,
				"Фрагмент JavaScript для этой страницы:",
				script,
				"Выполни фрагмент в этой странице инструментом выполнения JavaScript (в Cursor — browser_cdp, метод Runtime.evaluate с awaitPromise: true и returnByValue: true); ответ 200 — вход выполнен. Пароль не вводи в форму и не подбирай.",
				`Жду, пока страница заберёт пароль (до ${Math.round(timeoutMs / 1000)} с).`,
			].join("\n");
			timer = setTimeout(() => finish({ ok: false, text: `Страница не забрала пароль за ${Math.round(timeoutMs / 1000)} с` }), timeoutMs);
			resolve({ ok: true, text, done, close: () => finish({ ok: false, text: "Вход отменён" }) });
		});
	});
}
