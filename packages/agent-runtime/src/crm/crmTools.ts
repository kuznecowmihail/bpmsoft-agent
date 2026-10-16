import * as fs from "fs";
import * as path from "path";
import { errorMessage } from "../db/crmDbTool";
import { CrmConnection, CrmLoginError, CrmSession, FetchLike } from "./crmSession";
import { LogMark, extractBuildErrors, extractPackageSync, hasAppStarted, markLog, readSince } from "./crmLogs";
import { DEFAULT_MAX_FAILED_ACTIONS, FixLoop, errorSignature, schemaNameFromFile } from "./fixLoop";

export interface CrmActionRecord { action: "update" | "compile"; success: boolean; durationMs: number; summary: string; error?: string; denied?: boolean; attempt?: number; foreignSchemas?: string[]; blocked?: boolean }
export interface CrmToolsOptions {
	connection: CrmConnection;
	/** Opened application folder; enables log checks when <appRoot>/Logs exists. */
	appRoot?: string;
	/** Asked before each action; false → not run. Argument: Russian action caption. */
	confirm?: (action: string) => Promise<boolean>;
	onAction?: (record: CrmActionRecord) => void;
	fetchImpl?: FetchLike;
	/** Tests: polling interval for restart readiness (default 2000) and limit (default 180000). */
	restartPollMs?: number;
	restartLimitMs?: number;
	/** Failed actions allowed per turn before the checkpoint (default 5). */
	maxFailedActions?: number;
	/** Names of schemas changed in this chat; errors in other schemas get a notice. */
	ownSchemas?: () => Set<string>;
	/** Runs before update; errors stop the update without calling CRM. */
	lint?: () => { ok: boolean; text: string };
	/** Files in Pkg changed at or after the time (ms); enables update before compile. */
	changedSince?: (ms: number) => boolean;
	/** Chat start (ms): reference when no update ran in this turn. */
	chatStartedAt?: () => number;
}
export interface CrmTool { name: string; description: string; execute(): Promise<{ text: string; isError: boolean }> }

export const CRM_UPDATE_TOOL = "crm_update_from_fs";
export const CRM_COMPILE_TOOL = "crm_compile";

const LOAD_PACKAGES_PATH = "/ServiceModel/AppInstallerService.svc/LoadPackagesToDB";
const BUILD_PATH = "/ServiceModel/WorkspaceExplorerService.svc/Build";
const RESTART_PATH = "/ServiceModel/AppInstallerService.svc/RestartApp";
const UPDATE_TIMEOUT_MS = 600000;
const BUILD_TIMEOUT_MS = 900000;
const RESTART_TIMEOUT_MS = 120000;
const DEFAULT_RESTART_POLL_MS = 2000;
const DEFAULT_RESTART_LIMIT_MS = 180000;
/** Without the log: a successful login counts as "app is back" only after a failed attempt or after this delay. */
const LOGIN_ONLY_READY_AFTER_MS = 60000;
const MAX_HTTP_TEXT_CHARS = 500;
const FALLBACK = "Не повторяй вызов: попроси пользователя выполнить действие в CRM вручную или проверить подключение к CRM в настройках приложения.";

const UPDATE_DESCRIPTION = "Выполняет на стенде CRM «Обновить из файловой системы»: загружает изменения из Pkg в базу. Возвращает, что загрузилось, и ошибки загрузки схем (с выдержкой из журнала PackagesSynchronization.log). Без параметров. Вызывай только с согласия пользователя.";
const COMPILE_DESCRIPTION = "Компилирует конфигурацию на стенде CRM (изменённое) и после успешной компиляции перезапускает приложение, дожидаясь его запуска. Возвращает ошибки компиляции (файл, строка, код, текст). Без параметров. Вызывай после успешного обновления и только с согласия пользователя. Если после последнего обновления файлы в Pkg менялись, сначала сам выполняет обновление из файловой системы.";

type Json = Record<string, unknown>;

interface ActionOutcome { success: boolean; text: string; summary?: string; error?: string; countable?: boolean; schemaNames?: string[] }

function asRecord(value: unknown): Json {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : {};
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** Text of a JSON value; null and undefined become "". */
function s(value: unknown): string {
	return value === undefined || value === null ? "" : String(value);
}

function firstLine(text: string): string {
	return text.split("\n")[0] ?? "";
}

/** The first pkg_lint error line without its "ОШИБКА " prefix; the first line of the text when there is none. */
function firstLintError(text: string): string {
	const line = text.split("\n").find((item) => item.startsWith("ОШИБКА "));
	return line !== undefined ? line.slice("ОШИБКА ".length) : firstLine(text);
}

function failure(text: string, error: string): ActionOutcome {
	return { success: false, text, error };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Common flow: confirmation, login, the action itself, error texts and the action record. */
async function runAction(
	options: CrmToolsOptions,
	loop: FixLoop,
	action: "update" | "compile",
	caption: string,
	run: (session: CrmSession, logRoot: string | undefined) => Promise<ActionOutcome>
): Promise<{ text: string; isError: boolean }> {
	const blockedText = loop.blocked();
	if (blockedText !== undefined) {
		options.onAction?.({ action, success: false, durationMs: 0, summary: "", blocked: true, error: blockedText });
		return { text: blockedText, isError: true };
	}

	if (action === "update" && options.lint) {
		const lint = options.lint();
		if (!lint.ok) {
			const note = loop.failure({ signature: errorSignature(lint.text), schemaNames: [] });
			options.onAction?.({ action, success: false, durationMs: 0, summary: "Проверка pkg_lint не пройдена", error: firstLintError(lint.text), attempt: note.attempt });
			return { text: `Обновление не выполнено: pkg_lint нашёл ошибки. Исправь их и вызови обновление снова.\n${lint.text}\n${note.text}`, isError: true };
		}
	}

	if (options.confirm && !(await options.confirm(caption))) {
		options.onAction?.({ action, success: false, durationMs: 0, summary: "", denied: true, error: "Пользователь отклонил действие" });
		return { text: "Пользователь отклонил действие", isError: true };
	}

	const started = Date.now();
	const finish = (outcome: ActionOutcome) => {
		let text = outcome.text;
		let attempt: number | undefined;
		let foreignSchemas: string[] | undefined;
		if (outcome.success) {
			loop.success(action);
		} else if (outcome.countable !== false) {
			const note = loop.failure({ signature: errorSignature(outcome.error ?? outcome.text), schemaNames: outcome.schemaNames ?? [] });
			text = `${outcome.text}\n${note.text}`;
			attempt = note.attempt;
			if (note.foreignSchemas.length > 0) {
				foreignSchemas = note.foreignSchemas;
			}
		}
		options.onAction?.({
			action,
			success: outcome.success,
			durationMs: Date.now() - started,
			summary: outcome.summary ?? firstLine(outcome.text),
			error: outcome.error,
			attempt,
			foreignSchemas,
		});
		return { text, isError: !outcome.success };
	};

	const logRoot = options.appRoot !== undefined && fs.existsSync(path.join(options.appRoot, "Logs")) ? options.appRoot : undefined;
	const session = new CrmSession(options.connection, options.fetchImpl);

	try {
		await session.login();
	} catch (e) {
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		if (e instanceof CrmLoginError) {
			return finish({ ...failure(`Вход в CRM не выполнен: ${message}. ${FALLBACK}`, message), countable: false });
		}
		return finish({ ...failure(`CRM недоступна: ${message}. ${FALLBACK}`, message), countable: false });
	}

	try {
		return finish(await run(session, logRoot));
	} catch (e) {
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		return finish({ ...failure(`CRM недоступна: ${message}. ${FALLBACK}`, message), countable: false });
	}
}

async function runUpdate(session: CrmSession, logRoot: string | undefined): Promise<ActionOutcome> {
	const mark = logRoot ? markLog(logRoot, "PackagesSynchronization.log") : undefined;
	const response = await session.post(LOAD_PACKAGES_PATH, UPDATE_TIMEOUT_MS);
	const json = asRecord(response.json);

	const loaded: string[] = [];
	for (const change of asArray(json.changes).map(asRecord)) {
		const items = asArray(change.items).map(asRecord);
		if (items.length === 0) {
			loaded.push(`${s(change.name)} (${s(change.stateCaption)})`);
			continue;
		}
		for (const item of items) {
			loaded.push(`${s(change.name)}: ${s(item.name)} (${s(item.typeCaption ?? item.typeName)}, ${s(item.stateCaption ?? item.stateName)})`);
		}
	}

	const errors: string[] = [];
	const schemaNames: string[] = [];
	for (const error of asArray(json.errors).map(asRecord)) {
		const item = asRecord(error.workspaceItem);
		const info = asRecord(error.errorInfo);
		errors.push(`${s(item.name ?? "?")} (${s(item.typeName)}): ${s(info.errorCode)}: ${s(info.message)}`);
		if (s(item.name) !== "") {
			schemaNames.push(s(item.name));
		}
	}
	if (json.errorInfo) {
		const info = asRecord(json.errorInfo);
		errors.push(`${s(info.errorCode)}: ${s(info.message)}`);
	}
	if (response.status !== 200 && errors.length === 0) {
		errors.push(`HTTP ${response.status}: ${response.text.slice(0, MAX_HTTP_TEXT_CHARS)}`);
	}

	const ok = response.status === 200 && errors.length === 0;
	const lines = [ok ? "Обновление из файловой системы выполнено." : "Обновление из файловой системы выполнено с ошибками."];
	if (loaded.length > 0) {
		lines.push("Загружено:", ...loaded.map((line) => `- ${line}`));
	} else {
		lines.push("Изменений не было.");
	}
	if (!ok) {
		lines.push("Ошибки:", ...errors.map((line) => `- ${line}`));
		const extract = mark ? extractPackageSync(readSince(mark)) : "";
		if (extract) {
			lines.push("Журнал PackagesSynchronization.log:", extract);
		}
		lines.push("Найди причину в указанной схеме (вызови pkg_lint), исправь и вызови обновление снова.");
	}

	return {
		success: ok,
		text: lines.join("\n"),
		summary: `${lines[0]} Загружено элементов: ${loaded.length}.`,
		error: ok ? undefined : errors.join("; "),
		schemaNames,
	};
}

/** Waits until the restarted application answers; false when the limit passes first. */
async function waitForRestart(options: CrmToolsOptions, commonMark: LogMark | undefined, since: number): Promise<boolean> {
	const pollMs = options.restartPollMs ?? DEFAULT_RESTART_POLL_MS;
	const limitMs = options.restartLimitMs ?? DEFAULT_RESTART_LIMIT_MS;
	let sawDown = false;
	while (Date.now() - since < limitMs) {
		await sleep(pollMs);
		if (commonMark && hasAppStarted(readSince(commonMark))) {
			return true;
		}
		const probe = new CrmSession(options.connection, options.fetchImpl);
		try {
			await probe.login();
		} catch {
			sawDown = true;
			continue;
		}
		if (sawDown || Date.now() - since >= LOGIN_ONLY_READY_AFTER_MS) {
			return true;
		}
	}
	return false;
}

async function runCompile(options: CrmToolsOptions, session: CrmSession, logRoot: string | undefined): Promise<ActionOutcome> {
	const mark = logRoot ? markLog(logRoot, "Build.log") : undefined;
	const response = await session.post(BUILD_PATH, BUILD_TIMEOUT_MS);
	const json = asRecord(response.json);

	const real = asArray(json.errors).map(asRecord).filter((item) => item.warning === false);
	const realLines = real.map((item) => `${s(item.fileName)}(${s(item.line)},${s(item.column)}): ${s(item.errorNumber)} ${s(item.errorText)}`);
	const success = response.status === 200 && json.success === true && realLines.length === 0;

	if (!success) {
		const info = asRecord(json.errorInfo);
		const reason = [s(info.errorCode), s(info.message)].filter((part) => part !== "").join(": ")
			|| s(json.message)
			|| `HTTP ${response.status}`;
		const lines = ["Компиляция завершилась с ошибками:"];
		if (realLines.length > 0) {
			lines.push(...realLines.map((line) => `- ${line}`));
		} else {
			lines.push(`- ${reason}`);
		}
		const extract = mark ? extractBuildErrors(readSince(mark)) : "";
		if (extract) {
			lines.push("Журнал Build.log:", extract);
		}
		lines.push("Исправь ошибки в файлах схем, затем снова обновление и компиляция. Приложение не перезапускалось.");
		return {
			...failure(lines.join("\n"), realLines.length > 0 ? realLines.join("; ") : reason),
			schemaNames: real.map((item) => schemaNameFromFile(s(item.fileName))).filter((name) => name !== ""),
		};
	}

	const commonMark = logRoot ? markLog(logRoot, "Common.log") : undefined;
	const restartStarted = Date.now();
	try {
		await session.post(RESTART_PATH, RESTART_TIMEOUT_MS);
	} catch {
		// The application may already be restarting; the wait below decides.
	}

	const ready = await waitForRestart(options, commonMark, restartStarted);
	if (!ready) {
		const limitSeconds = (options.restartLimitMs ?? DEFAULT_RESTART_LIMIT_MS) / 1000;
		const text = `Компиляция выполнена, но после перезапуска CRM не поднялась за ${limitSeconds} с — попроси пользователя проверить стенд.`;
		return { ...failure(text, "CRM не поднялась после перезапуска"), countable: false };
	}

	const seconds = Math.round((Date.now() - restartStarted) / 1000);
	const text = `Компиляция выполнена: ${s(json.message ?? "успешно")}. Приложение перезапущено, CRM снова доступна через ${seconds} с. Пользователю осталось обновить страницу в браузере (Ctrl+F5) и проверить результат.`;
	return { success: true, text };
}

/** Two CRM tools: update from the file system and compile with restart. */
export function createCrmTools(options: CrmToolsOptions): CrmTool[] {
	const loop = new FixLoop({ maxFailures: options.maxFailedActions ?? DEFAULT_MAX_FAILED_ACTIONS, ownSchemas: options.ownSchemas });
	const UPDATE_CAPTION = "Обновить CRM из файловой системы";
	const COMPILE_CAPTION = "Скомпилировать и перезапустить CRM";
	/** Time of the last successful update in this tools instance (ms). */
	let lastUpdateOkAt: number | undefined;
	const runUpdateStep = async (): Promise<{ text: string; isError: boolean }> => {
		const result = await runAction(options, loop, "update", UPDATE_CAPTION, (session, logRoot) => runUpdate(session, logRoot));
		if (!result.isError) {
			lastUpdateOkAt = Date.now();
		}
		return result;
	};
	/** Compile; when Pkg changed since the last update, runs the update first (same queue, so no overlap). */
	const runCompileStep = async (): Promise<{ text: string; isError: boolean }> => {
		let prefix = "";
		if (options.changedSince) {
			const since = lastUpdateOkAt ?? options.chatStartedAt?.() ?? 0;
			if (options.changedSince(since)) {
				const update = await runUpdateStep();
				if (update.isError) {
					return { text: `Компиляция не запускалась: перед ней нужно обновление из файловой системы (файлы менялись), а оно не прошло.\n${update.text}`, isError: true };
				}
				prefix = "Перед компиляцией выполнено обновление из файловой системы: файлы менялись после последнего обновления.\n";
			}
		}
		const compile = await runAction(options, loop, "compile", COMPILE_CAPTION, (session, logRoot) => runCompile(options, session, logRoot));
		return prefix === "" ? compile : { text: prefix + compile.text, isError: compile.isError };
	};
	/** The SDK can call one tool twice at once: a running action is shared by its duplicates, and different actions run one at a time (one CRM build at a time). */
	const inFlight = new Map<"update" | "compile", Promise<{ text: string; isError: boolean }>>();
	let queue: Promise<unknown> = Promise.resolve();
	const guarded = (action: "update" | "compile", job: () => Promise<{ text: string; isError: boolean }>) => (): Promise<{ text: string; isError: boolean }> => {
		const running = inFlight.get(action);
		if (running) {
			return running;
		}
		const result = queue.then(() => job()).finally(() => inFlight.delete(action));
		inFlight.set(action, result);
		queue = result.catch(() => undefined);
		return result;
	};
	return [
		{
			name: CRM_UPDATE_TOOL,
			description: UPDATE_DESCRIPTION,
			execute: guarded("update", runUpdateStep),
		},
		{
			name: CRM_COMPILE_TOOL,
			description: COMPILE_DESCRIPTION,
			execute: guarded("compile", runCompileStep),
		},
	];
}

/** Login check for the settings screen. Throws Error with the reason; never includes the password. */
export async function testCrmConnection(connection: CrmConnection, fetchImpl?: FetchLike): Promise<string> {
	const session = new CrmSession(connection, fetchImpl);
	try {
		await session.login();
	} catch (e) {
		throw new Error(`Не удалось войти в CRM: ${errorMessage(e)}`);
	}
	return `Вход выполнен: ${connection.url.replace(/\/+$/, "")}`;
}
