import * as fs from "fs";
import * as path from "path";
import { errorMessage } from "../db/crmDbTool";
import { CrmConnection, CrmLoginError, CrmResponse, CrmSession, CrmStoppedError, CrmTimeoutError, FetchLike } from "./crmSession";
import { LogMark, buildResult, extractBuildErrors, extractPackageSync, hasAppStarted, isPackageSyncFinished, lastLogLine, markLog, readSince } from "./crmLogs";
import { DEFAULT_MAX_FAILED_ACTIONS, FixLoop, errorSignature, schemaNameFromFile } from "./fixLoop";

export interface CrmActionRecord { action: "update" | "compile"; success: boolean; durationMs: number; summary: string; error?: string; denied?: boolean; attempt?: number; foreignSchemas?: string[]; blocked?: boolean; stopped?: boolean }
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
	/** Tests: after a timeout, how often (default 5000) and how long (default 600000) to wait for the end marker in the stand log. */
	logWaitPollMs?: number;
	logWaitLimitMs?: number;
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
	/** User stop: running waits are cut short, the action on the stand may continue. */
	signal?: AbortSignal;
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
const DEFAULT_LOG_WAIT_POLL_MS = 5000;
const DEFAULT_LOG_WAIT_LIMIT_MS = 600000;
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

function stoppedText(action: "update" | "compile"): string {
	return action === "update"
		? "Остановлено пользователем: ожидание обновления из файловой системы прервано. На стенде обновление могло продолжиться — не повторяй действие, пока пользователь не попросит."
		: "Остановлено пользователем: ожидание компиляции прервано. На стенде компиляция или перезапуск приложения могли продолжиться — не повторяй действие, пока пользователь не попросит.";
}

/** Common flow: confirmation, login, the action itself, error texts and the action record. */
async function runAction(
	options: CrmToolsOptions,
	loop: FixLoop,
	action: "update" | "compile",
	caption: string,
	run: (session: CrmSession, logRoot: string | undefined) => Promise<ActionOutcome>
): Promise<{ text: string; isError: boolean }> {
	if (options.signal?.aborted) {
		options.onAction?.({ action, success: false, durationMs: 0, summary: "", stopped: true, error: "Остановлено пользователем" });
		return { text: stoppedText(action), isError: true };
	}

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

	const stopped = (): { text: string; isError: boolean } => {
		options.onAction?.({ action, success: false, durationMs: Date.now() - started, summary: "Остановлено пользователем", stopped: true, error: "Остановлено пользователем" });
		return { text: stoppedText(action), isError: true };
	};

	const logRoot = options.appRoot !== undefined && fs.existsSync(path.join(options.appRoot, "Logs")) ? options.appRoot : undefined;
	const session = new CrmSession(options.connection, options.fetchImpl);

	try {
		await session.login(undefined, options.signal);
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			return stopped();
		}
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		if (e instanceof CrmLoginError) {
			return finish({ ...failure(`Вход в CRM не выполнен: ${message}. ${FALLBACK}`, message), countable: false });
		}
		return finish({ ...failure(`CRM недоступна: ${message}. ${FALLBACK}`, message), countable: false });
	}

	try {
		return finish(await run(session, logRoot));
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			return stopped();
		}
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		return finish({ ...failure(`CRM недоступна: ${message}. ${FALLBACK}`, message), countable: false });
	}
}

/** Waits in the stand log for the end marker of an action whose request timed out; undefined when the limit passes first. */
async function waitForLog(options: CrmToolsOptions, mark: LogMark, done: (text: string) => boolean): Promise<string | undefined> {
	const pollMs = options.logWaitPollMs ?? DEFAULT_LOG_WAIT_POLL_MS;
	const limitMs = options.logWaitLimitMs ?? DEFAULT_LOG_WAIT_LIMIT_MS;
	const started = Date.now();
	while (Date.now() - started < limitMs) {
		if (options.signal?.aborted) {
			throw new CrmStoppedError("остановлено пользователем");
		}
		await sleep(pollMs);
		if (options.signal?.aborted) {
			throw new CrmStoppedError("остановлено пользователем");
		}
		const text = readSince(mark);
		if (done(text)) {
			return text;
		}
	}
	return undefined;
}

/** The update request timed out: the stand may still run it, so the outcome comes from PackagesSynchronization.log. */
async function updateAfterTimeout(options: CrmToolsOptions, mark: LogMark | undefined, reason: string): Promise<ActionOutcome> {
	if (!mark) {
		const text = `CRM не ответила на «Обновить из файловой системы» (${reason}). На стенде обновление может продолжаться. Журналы стенда недоступны: не повторяй вызов сразу — попроси пользователя проверить в CRM, завершилось ли обновление, и продолжай после его ответа.`;
		return { ...failure(text, `CRM не ответила: ${reason}`), countable: false };
	}
	const text = await waitForLog(options, mark, isPackageSyncFinished);
	if (text === undefined) {
		const minutes = Math.round((options.logWaitLimitMs ?? DEFAULT_LOG_WAIT_LIMIT_MS) / 60000);
		const last = lastLogLine(readSince(mark));
		const message = `CRM не ответила на «Обновить из файловой системы» (${reason}), и за ${minutes} мин ожидания в журнале PackagesSynchronization.log не появилось завершение («<-- PackageInstallUtilities.LoadPackagesToDB»).`
			+ (last ? ` Последняя запись: ${last}.` : "")
			+ " Обновление на стенде может ещё идти: не повторяй вызов. Проверь журнал сам позже (Logs/<дата UTC>/PackagesSynchronization.log); если записи не появляются и маркера нет — попроси пользователя проверить стенд.";
		return { ...failure(message, `CRM не ответила: ${reason}`), countable: false };
	}
	const extract = extractPackageSync(text);
	if (extract === "") {
		return {
			success: true,
			text: `Обновление из файловой системы выполнено: CRM не ответила вовремя (${reason}), но завершение видно в журнале PackagesSynchronization.log. Список загруженного недоступен.`,
			summary: "Обновление из файловой системы выполнено (по журналу).",
		};
	}
	const message = `Обновление из файловой системы завершилось (по журналу; CRM не ответила вовремя — ${reason}), но в журнале PackagesSynchronization.log есть исключения:\n${extract}\nЕсли они про схемы, которые ты менял, — исправь и вызови обновление снова; иначе покажи их пользователю.`;
	return { ...failure(message, "исключения в журнале PackagesSynchronization.log"), countable: false };
}

/** The build request timed out: the outcome comes from Build.log; "succeeded" lets the caller restart as after a normal success. */
async function compileAfterTimeout(options: CrmToolsOptions, mark: LogMark | undefined, reason: string): Promise<ActionOutcome | "succeeded"> {
	if (!mark) {
		const text = `CRM не ответила на компиляцию (${reason}). На стенде компиляция может продолжаться, приложение не перезапускалось. Журналы стенда недоступны: не повторяй вызов сразу — попроси пользователя проверить в CRM, завершилась ли компиляция.`;
		return { ...failure(text, `CRM не ответила: ${reason}`), countable: false };
	}
	const text = await waitForLog(options, mark, (log) => buildResult(log) !== undefined);
	if (text === undefined) {
		const minutes = Math.round((options.logWaitLimitMs ?? DEFAULT_LOG_WAIT_LIMIT_MS) / 60000);
		const message = `CRM не ответила на компиляцию (${reason}), и за ${minutes} мин ожидания в журнале Build.log не появился результат («Build succeeded.» или «Build FAILED.»). Компиляция на стенде может ещё идти, приложение не перезапускалось: не повторяй вызов, проверь Build.log сам позже.`;
		return { ...failure(message, `CRM не ответила: ${reason}`), countable: false };
	}
	if (buildResult(text) === "failed") {
		const errors = extractBuildErrors(text);
		const message = `Компиляция завершилась с ошибками (по журналу Build.log; CRM не ответила вовремя — ${reason}):\n${errors}\nИсправь ошибки в файлах схем, затем снова обновление и компиляция. Приложение не перезапускалось.`;
		return failure(message, firstLine(errors) || "Build FAILED.");
	}
	return "succeeded";
}

async function runUpdate(options: CrmToolsOptions, session: CrmSession, logRoot: string | undefined): Promise<ActionOutcome> {
	const mark = logRoot ? markLog(logRoot, "PackagesSynchronization.log") : undefined;
	let response: CrmResponse;
	try {
		response = await session.post(LOAD_PACKAGES_PATH, UPDATE_TIMEOUT_MS, options.signal);
	} catch (e) {
		if (!(e instanceof CrmTimeoutError)) {
			throw e;
		}
		return updateAfterTimeout(options, mark, errorMessage(e).replace(/[.\s]+$/, ""));
	}
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
		if (options.signal?.aborted) {
			throw new CrmStoppedError("остановлено пользователем");
		}
		await sleep(pollMs);
		if (options.signal?.aborted) {
			throw new CrmStoppedError("остановлено пользователем");
		}
		if (commonMark && hasAppStarted(readSince(commonMark))) {
			return true;
		}
		const probe = new CrmSession(options.connection, options.fetchImpl);
		try {
			await probe.login(undefined, options.signal);
		} catch (e) {
			if (e instanceof CrmStoppedError) {
				throw e;
			}
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
	let response: CrmResponse;
	try {
		response = await session.post(BUILD_PATH, BUILD_TIMEOUT_MS, options.signal);
	} catch (e) {
		if (!(e instanceof CrmTimeoutError)) {
			throw e;
		}
		const outcome = await compileAfterTimeout(options, mark, errorMessage(e).replace(/[.\s]+$/, ""));
		if (outcome !== "succeeded") {
			return outcome;
		}
		response = { status: 200, text: "", json: { success: true, message: "успешно (по журналу Build.log)", errors: null } };
	}
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
		await session.post(RESTART_PATH, RESTART_TIMEOUT_MS, options.signal);
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			throw e;
		}
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
		const result = await runAction(options, loop, "update", UPDATE_CAPTION, (session, logRoot) => runUpdate(options, session, logRoot));
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
				if (options.signal?.aborted) {
					return update;
				}
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

/** Restarts the CRM application and waits until it answers; for the CLI and tools outside the chat flow. */
export async function restartCrm(options: {
	connection: CrmConnection;
	appRoot?: string;
	fetchImpl?: FetchLike;
	restartPollMs?: number;
	restartLimitMs?: number;
	signal?: AbortSignal;
}): Promise<{ success: boolean; text: string }> {
	const stoppedText = "Остановлено пользователем";
	const logRoot = options.appRoot !== undefined && fs.existsSync(path.join(options.appRoot, "Logs")) ? options.appRoot : undefined;
	const session = new CrmSession(options.connection, options.fetchImpl);
	try {
		await session.login(undefined, options.signal);
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			return { success: false, text: stoppedText };
		}
		const message = errorMessage(e).replace(/[.\s]+$/, "");
		const prefix = e instanceof CrmLoginError ? "Вход в CRM не выполнен" : "CRM недоступна";
		return { success: false, text: `${prefix}: ${message}.` };
	}

	const commonMark = logRoot ? markLog(logRoot, "Common.log") : undefined;
	const restartStarted = Date.now();
	try {
		await session.post(RESTART_PATH, RESTART_TIMEOUT_MS, options.signal);
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			return { success: false, text: stoppedText };
		}
		// The application may already be restarting; the wait below decides.
	}

	let ready: boolean;
	try {
		ready = await waitForRestart(options, commonMark, restartStarted);
	} catch (e) {
		if (e instanceof CrmStoppedError) {
			return { success: false, text: stoppedText };
		}
		throw e;
	}
	if (!ready) {
		const limitSeconds = (options.restartLimitMs ?? DEFAULT_RESTART_LIMIT_MS) / 1000;
		return { success: false, text: `После перезапуска CRM не поднялась за ${limitSeconds} с.` };
	}
	const seconds = Math.round((Date.now() - restartStarted) / 1000);
	return { success: true, text: `Приложение перезапущено, CRM снова доступна через ${seconds} с.` };
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
