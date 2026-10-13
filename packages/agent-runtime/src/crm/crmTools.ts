import * as fs from "fs";
import * as path from "path";
import { errorMessage } from "../db/crmDbTool";
import { CrmConnection, CrmLoginError, CrmSession, FetchLike } from "./crmSession";
import { LogMark, extractBuildErrors, extractPackageSync, hasAppStarted, markLog, readSince } from "./crmLogs";

export interface CrmActionRecord { action: "update" | "compile"; success: boolean; durationMs: number; summary: string; error?: string; denied?: boolean }
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
const COMPILE_DESCRIPTION = "Компилирует конфигурацию на стенде CRM (изменённое) и после успешной компиляции перезапускает приложение, дожидаясь его запуска. Возвращает ошибки компиляции (файл, строка, код, текст). Без параметров. Вызывай после успешного обновления и только с согласия пользователя.";

type Json = Record<string, unknown>;

interface ActionOutcome { success: boolean; text: string; summary?: string; error?: string }

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

function failure(text: string, error: string): ActionOutcome {
	return { success: false, text, error };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Common flow: confirmation, login, the action itself, error texts and the action record. */
async function runAction(
	options: CrmToolsOptions,
	action: "update" | "compile",
	caption: string,
	run: (session: CrmSession, logRoot: string | undefined) => Promise<ActionOutcome>
): Promise<{ text: string; isError: boolean }> {
	if (options.confirm && !(await options.confirm(caption))) {
		options.onAction?.({ action, success: false, durationMs: 0, summary: "", denied: true, error: "Пользователь отклонил действие" });
		return { text: "Пользователь отклонил действие", isError: true };
	}

	const started = Date.now();
	const finish = (outcome: ActionOutcome) => {
		options.onAction?.({
			action,
			success: outcome.success,
			durationMs: Date.now() - started,
			summary: outcome.summary ?? firstLine(outcome.text),
			error: outcome.error,
		});
		return { text: outcome.text, isError: !outcome.success };
	};

	const logRoot = options.appRoot !== undefined && fs.existsSync(path.join(options.appRoot, "Logs")) ? options.appRoot : undefined;
	const session = new CrmSession(options.connection, options.fetchImpl);

	try {
		await session.login();
	} catch (e) {
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		if (e instanceof CrmLoginError) {
			return finish(failure(`Вход в CRM не выполнен: ${message}. ${FALLBACK}`, message));
		}
		return finish(failure(`CRM недоступна: ${message}. ${FALLBACK}`, message));
	}

	try {
		return finish(await run(session, logRoot));
	} catch (e) {
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		return finish(failure(`CRM недоступна: ${message}. ${FALLBACK}`, message));
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
	for (const error of asArray(json.errors).map(asRecord)) {
		const item = asRecord(error.workspaceItem);
		const info = asRecord(error.errorInfo);
		errors.push(`${s(item.name ?? "?")} (${s(item.typeName)}): ${s(info.errorCode)}: ${s(info.message)}`);
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
		lines.push("Найди причину в указанной схеме (для процессов и объектов запусти check-process.js / check-entity.js), исправь и вызови обновление снова.");
	}

	return {
		success: ok,
		text: lines.join("\n"),
		summary: `${lines[0]} Загружено элементов: ${loaded.length}.`,
		error: ok ? undefined : errors.join("; "),
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
		return failure(lines.join("\n"), realLines.length > 0 ? realLines.join("; ") : reason);
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
		return failure(text, "CRM не поднялась после перезапуска");
	}

	const seconds = Math.round((Date.now() - restartStarted) / 1000);
	const text = `Компиляция выполнена: ${s(json.message ?? "успешно")}. Приложение перезапущено, CRM снова доступна через ${seconds} с. Пользователю осталось обновить страницу в браузере (Ctrl+F5) и проверить результат.`;
	return { success: true, text };
}

/** Two CRM tools: update from the file system and compile with restart. */
export function createCrmTools(options: CrmToolsOptions): CrmTool[] {
	return [
		{
			name: CRM_UPDATE_TOOL,
			description: UPDATE_DESCRIPTION,
			execute: () => runAction(options, "update", "Обновить CRM из файловой системы", (session, logRoot) => runUpdate(session, logRoot)),
		},
		{
			name: CRM_COMPILE_TOOL,
			description: COMPILE_DESCRIPTION,
			execute: () => runAction(options, "compile", "Скомпилировать и перезапустить CRM", (session, logRoot) => runCompile(options, session, logRoot)),
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
