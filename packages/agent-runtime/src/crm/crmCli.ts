import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { errorMessage } from "../db/crmDbTool";
import { runPkgLintCli } from "../lint/pkgLintCli";
import { CrmConnection, CrmLoginError, CrmResponse, CrmSession, FetchLike } from "./crmSession";
import { CRM_COMPILE_TOOL, CRM_UPDATE_TOOL, createCrmTools, restartCrm } from "./crmTools";
import { formatCrmResponse, isStandPath } from "./crmRequestTool";

/** Result of the CLI run: exit code and text for stdout. */
export interface CrmCliResult {
	code: 0 | 1 | 2;
	text: string;
}

/** Dependencies of the CLI run: stand root, folder of the bundle and test hooks. */
export interface CrmCliDeps {
	/** Stand root (Claude Code runs there). */
	cwd: string;
	/** Folder of crm.js; the knowledge folder for pkg-lint is its parent. */
	scriptDir: string;
	fetchImpl?: FetchLike;
	/** Progress lines printed before a wait (browser-login); the password is never logged. */
	log?: (line: string) => void;
	/** Tests: polling interval and limit for restart readiness. */
	restartPollMs?: number;
	restartLimitMs?: number;
	/** Tests: how long browser-login waits for the page (default 120000). */
	browserLoginTimeoutMs?: number;
}

const USAGE = [
	"Использование: crm.js <команда> [аргументы]",
	"  update [--no-lint] — pkg-lint по изменённым файлам (если не выключен), затем «Обновить из файловой системы» в CRM",
	"  compile [--no-lint] — сначала update (Build удаляет с диска схемы, ещё не загруженные в БД), затем компиляция конфигурации в CRM и перезапуск приложения",
	"  restart — перезапуск приложения и ожидание его запуска",
	"  request <GET|POST> <путь> [тело|@файл] [--max <N>] — запрос к сервису CRM, путь от корня стенда, например /ServiceModel/...",
	"  browser-login [--port <N>] — передать пароль CRM странице в браузере, чтобы войти в CRM без пароля в чате",
].join("\n");

const NOT_CONFIGURED = "Доступ к CRM не настроен: нет переменных BPMSOFT_CRM_URL, BPMSOFT_CRM_USER, BPMSOFT_CRM_PASSWORD ни в окружении, ни в .claude/settings.local.json. Переустановите скиллы в приложении bpmsoft-agent (Настройки → скиллы для Claude Code и Cursor) или попросите пользователя выполнить действие в CRM самому.";
const CONNECTION_KEYS = ["BPMSOFT_CRM_URL", "BPMSOFT_CRM_USER", "BPMSOFT_CRM_PASSWORD"];
const COMMANDS = ["update", "compile", "restart", "request", "browser-login"];
const REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_BROWSER_PORT = 8919;
const BROWSER_LOGIN_TIMEOUT_MS = 120000;

/** Usage result, with an optional error line before the usage text. */
function usage(message?: string): CrmCliResult {
	return { code: 2, text: message ? `${message}\n${USAGE}` : USAGE };
}

/** Connection from the environment; undefined when any variable is missing. */
function readConnection(env: NodeJS.ProcessEnv): CrmConnection | undefined {
	const url = env.BPMSOFT_CRM_URL;
	const user = env.BPMSOFT_CRM_USER;
	const password = env.BPMSOFT_CRM_PASSWORD;
	if (!url || !user || !password) {
		return undefined;
	}
	return { url, user, password };
}

/** CRM variables from the env block of .claude/settings.local.json in cwd; {} when the file is missing or invalid. */
function readSettingsEnv(cwd: string): NodeJS.ProcessEnv {
	try {
		const raw = fs.readFileSync(path.join(cwd, ".claude", "settings.local.json"), "utf8").replace(/^\uFEFF/, "");
		const parsed: unknown = JSON.parse(raw);
		const block = typeof parsed === "object" && parsed !== null ? (parsed as { env?: unknown }).env : undefined;
		if (typeof block !== "object" || block === null) {
			return {};
		}
		const result: NodeJS.ProcessEnv = {};
		for (const key of CONNECTION_KEYS) {
			const value = (block as Record<string, unknown>)[key];
			if (typeof value === "string") {
				result[key] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
}

/** Environment without empty values, so an empty variable does not hide the value from the settings file. */
function nonEmpty(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const result: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(env)) {
		if (value) {
			result[key] = value;
		}
	}
	return result;
}

/** Failure text of login or request; the messages never contain the password. */
function failureText(e: unknown): string {
	const message = errorMessage(e).replace(/[.\s]+$/, "");
	const prefix = e instanceof CrmLoginError ? "Вход в CRM не выполнен" : "CRM недоступна";
	return `${prefix}: ${message}.`;
}

/** Runs one CRM tool of the chat flow against the stand root. */
async function runTool(name: string, connection: CrmConnection, deps: CrmCliDeps): Promise<{ text: string; isError: boolean }> {
	const tool = createCrmTools({
		connection,
		appRoot: deps.cwd,
		fetchImpl: deps.fetchImpl,
		restartPollMs: deps.restartPollMs,
		restartLimitMs: deps.restartLimitMs,
	}).find((item) => item.name === name);
	if (!tool) {
		throw new Error(`нет инструмента ${name}`);
	}
	return tool.execute();
}

/** update: pkg-lint of the changed files (unless --no-lint), then the CRM update from the file system. */
async function runUpdate(args: string[], connection: CrmConnection, deps: CrmCliDeps): Promise<CrmCliResult> {
	const noLint = args.includes("--no-lint");
	const extra = args.filter((arg) => arg !== "--no-lint");
	if (extra.length > 0) {
		return usage(`update: лишние аргументы: ${extra.join(" ")}`);
	}
	const notes: string[] = [];
	if (!noLint) {
		const pkgDir = path.join(deps.cwd, "BPMSoft.Configuration", "Pkg");
		const lint = runPkgLintCli(["--git", pkgDir], path.join(deps.scriptDir, ".."));
		if (lint.code === 1) {
			return { code: 1, text: `${lint.text}\nОбновление не выполнено: исправь ошибки pkg-lint.` };
		}
		notes.push(lint.code === 0 ? lint.text : `pkg-lint пропущен: ${lint.text.split("\n")[0] ?? ""}`);
	}
	const result = await runTool(CRM_UPDATE_TOOL, connection, deps);
	return { code: result.isError ? 1 : 0, text: [...notes, result.text].join("\n") };
}

/** compile: update first (Build re-exports packages to the file system and deletes schemas not loaded to the DB yet), then CRM compilation and restart. */
async function runCompile(args: string[], connection: CrmConnection, deps: CrmCliDeps): Promise<CrmCliResult> {
	const extra = args.filter((arg) => arg !== "--no-lint");
	if (extra.length > 0) {
		return usage(`compile: лишние аргументы: ${extra.join(" ")}`);
	}
	const update = await runUpdate(args, connection, deps);
	if (update.code !== 0) {
		return { code: update.code, text: `Компиляция не запускалась: перед ней нужно обновление из файловой системы, а оно не прошло.\n${update.text}` };
	}
	const result = await runTool(CRM_COMPILE_TOOL, connection, deps);
	return { code: result.isError ? 1 : 0, text: `${update.text}\n${result.text}` };
}

/** restart: restart of the application and waiting for it to answer. */
async function runRestart(args: string[], connection: CrmConnection, deps: CrmCliDeps): Promise<CrmCliResult> {
	if (args.length > 0) {
		return usage(`restart: лишние аргументы: ${args.join(" ")}`);
	}
	const result = await restartCrm({
		connection,
		appRoot: deps.cwd,
		fetchImpl: deps.fetchImpl,
		restartPollMs: deps.restartPollMs,
		restartLimitMs: deps.restartLimitMs,
	});
	return { code: result.success ? 0 : 1, text: result.text };
}

/** request: one REST request to the stand after login; prints the status and the (truncated) body. */
async function runRequest(args: string[], connection: CrmConnection, deps: CrmCliDeps): Promise<CrmCliResult> {
	const positional: string[] = [];
	let maxChars = DEFAULT_MAX_CHARS;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--max") {
			const value = Number(args[i + 1]);
			if (!Number.isInteger(value) || value < 0) {
				return { code: 2, text: "--max: нужно неотрицательное целое число" };
			}
			maxChars = value;
			i++;
		} else {
			positional.push(args[i]);
		}
	}
	if (positional.length < 2 || positional.length > 3) {
		return usage("request: нужны метод, путь и для POST — тело (JSON или @файл)");
	}
	const method = positional[0].toUpperCase();
	if (method !== "GET" && method !== "POST") {
		return { code: 2, text: `Метод должен быть GET или POST: ${positional[0]}` };
	}
	const requestPath = positional[1];
	if (!isStandPath(requestPath)) {
		return { code: 2, text: "Путь должен начинаться с / и вести на стенд CRM" };
	}

	let body: string | null = null;
	if (method === "POST") {
		body = positional[2] ?? "{}";
		if (body.startsWith("@")) {
			try {
				body = fs.readFileSync(path.resolve(deps.cwd, body.slice(1)), "utf8").replace(/^\uFEFF/, "");
			} catch (e) {
				return { code: 2, text: `Не удалось прочитать файл тела: ${errorMessage(e)}` };
			}
		}
	} else if (positional[2] !== undefined) {
		return { code: 2, text: "У GET-запроса не бывает тела" };
	}

	const session = new CrmSession(connection, deps.fetchImpl);
	let response: CrmResponse;
	try {
		await session.login();
		response = await session.request(method, requestPath, body, REQUEST_TIMEOUT_MS);
	} catch (e) {
		return { code: 1, text: failureText(e) };
	}
	return { code: response.status < 400 ? 0 : 1, text: formatCrmResponse(response.status, response.text, maxChars) };
}

/**
 * browser-login: serves the password once on 127.0.0.1 with CORS for the CRM origin. The user runs the printed
 * JavaScript on the CRM page; the page fetches the password and logs in itself, so the password never reaches the chat.
 * Only a GET with Origin equal to the CRM origin gets the password; any other request gets 403 and does not consume it.
 */
async function runBrowserLogin(args: string[], connection: CrmConnection, deps: CrmCliDeps): Promise<CrmCliResult> {
	let port = DEFAULT_BROWSER_PORT;
	if (args.length > 0) {
		if (args.length !== 2 || args[0] !== "--port") {
			return usage("browser-login: допустим только --port <N>");
		}
		const value = Number(args[1]);
		if (!Number.isInteger(value) || value < 0 || value > 65535) {
			return { code: 2, text: "--port: нужен номер порта от 0 до 65535" };
		}
		port = value;
	}

	let origin: string;
	let basePath: string;
	try {
		const url = new URL(connection.url);
		origin = url.origin;
		basePath = url.pathname.replace(/\/+$/, "");
	} catch {
		return { code: 2, text: "BPMSOFT_CRM_URL не похож на адрес (нужен http:// или https://)" };
	}
	const timeoutMs = deps.browserLoginTimeoutMs ?? BROWSER_LOGIN_TIMEOUT_MS;
	const log = deps.log ?? (() => undefined);

	return new Promise<CrmCliResult>((resolve) => {
		let served = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const server = http.createServer();
		const finish = (result: CrmCliResult) => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			server.close();
			server.closeAllConnections();
			resolve(result);
		};
		server.on("request", (req, res) => {
			if (served) {
				res.statusCode = 404;
				res.end();
				return;
			}
			if (req.method !== "GET" || req.headers.origin !== origin) {
				log(`Запрос без адреса CRM (Origin: ${req.headers.origin ?? "нет"}) — пароль не отдан. Выполни фрагмент на странице ${connection.url.replace(/\/+$/, "")}/Login/Login.html, адрес должен совпадать точно (localhost и 127.0.0.1 — разные адреса).`);
				res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
				res.end("Пароль отдаётся только странице CRM");
				return;
			}
			served = true;
			res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": origin });
			res.end(connection.password, () => finish({ code: 0, text: "Пароль передан странице" }));
		});
		server.on("error", (e) => finish({ code: 1, text: `Не удалось открыть порт ${port}: ${errorMessage(e)}` }));
		server.listen(port, "127.0.0.1", () => {
			const address = server.address();
			const actualPort = typeof address === "object" && address !== null ? address.port : port;
			const script = [
				"(async () => {",
				`const pw = await fetch("http://127.0.0.1:${actualPort}/").then(r => r.text());`,
				`const r = await fetch(${JSON.stringify(`${basePath}/ServiceModel/AuthService.svc/Login`)}, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({UserName: ${JSON.stringify(connection.user)}, UserPassword: pw})});`,
				`return r.status + " " + (await r.text()).slice(0, 80); })()`,
			].join(" ");
			log(`Открой в браузере страницу входа: ${connection.url.replace(/\/+$/, "")}/Login/Login.html`);
			log("Фрагмент JavaScript для этой страницы:");
			log(script);
			log("Выполни фрагмент в этой странице инструментом выполнения JavaScript (в Cursor — browser_cdp, метод Runtime.evaluate с awaitPromise: true и returnByValue: true); ответ 200 — вход выполнен. Пароль не вводи в форму и не подбирай.");
			log(`Жду, пока страница заберёт пароль (до ${Math.round(timeoutMs / 1000)} с).`);
			timer = setTimeout(() => finish({ code: 1, text: `Страница не забрала пароль за ${Math.round(timeoutMs / 1000)} с` }), timeoutMs);
		});
	});
}

/** Runs the CRM CLI for arguments and environment; does not print or exit. */
export async function runCrmCli(argv: string[], env: NodeJS.ProcessEnv, deps: CrmCliDeps): Promise<CrmCliResult> {
	const [command, ...rest] = argv;
	if (command === undefined || command === "--help" || command === "-h") {
		return usage();
	}
	if (!COMMANDS.includes(command)) {
		return usage(`Неизвестная команда: ${command}`);
	}
	const connection = readConnection(env) ?? readConnection({ ...readSettingsEnv(deps.cwd), ...nonEmpty(env) });
	if (!connection) {
		return { code: 2, text: NOT_CONFIGURED };
	}
	switch (command) {
		case "update":
			return runUpdate(rest, connection, deps);
		case "compile":
			return runCompile(rest, connection, deps);
		case "restart":
			return runRestart(rest, connection, deps);
		case "request":
			return runRequest(rest, connection, deps);
		default:
			return runBrowserLogin(rest, connection, deps);
	}
}
