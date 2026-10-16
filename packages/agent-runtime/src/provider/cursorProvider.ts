import { Agent, Cursor } from "@cursor/sdk";
import type { AgentOptions, SDKAgent, SDKCustomTool, SDKMessage, ToolName } from "@cursor/sdk";
import * as path from "path";
import type { AgentEvent, TokenUsage } from "./messageMapper";
import type { ToolPermissionRequest } from "./anthropicProvider";
import { buildBpmsoftSystemPrompt } from "./systemPrompt";
import type { CrmDbTool } from "../db/crmDbTool";
import type { CrmTool } from "../crm/crmTools";
import type { AppTool } from "../tools/appTool";
import { appToolContent, appToolJsonSchema } from "../tools/appTool";
import { createLocalTools, LOCAL_TOOL_NAMES } from "../tools/localTools";

export interface CursorModelParam {
	id: string;
	value: string;
}

/** One entry of the model picker: a model or one of its variants (thinking, reasoning effort, Max). */
export interface CursorModelOption {
	id: string;
	name: string;
	/** Variant parameters passed as `model.params`; absent for the model's default mode. */
	params?: CursorModelParam[];
	recommended: boolean;
}

export interface RunCursorAgentQueryOptions {
	/** Cursor API key (Cursor Dashboard → API Keys) — never logged or persisted here. */
	apiKey: string;
	prompt: string;
	/** Working directory = the project's Pkg folder; our local tools allow writes only here. */
	cwd: string;
	/** Cursor model id, e.g. "composer-2.5" (see `listCursorModels`). */
	model: string;
	/** Variant parameters of the selected model (see CursorModelOption.params). */
	modelParams?: CursorModelParam[];
	/** Cursor agent id from a previous turn (`sessionId` on events) — continues that conversation. */
	resume?: string;
	/** Opened application folder: the agent is told to read only here and in the knowledge directory. */
	readRoot?: string;
	/**
	 * Asks the user before shell commands that may delete files, change git state or run other programs
	 * (run_shell of our local tools); without it such commands are refused.
	 */
	requestToolPermission?: (request: ToolPermissionRequest) => Promise<boolean>;
	/** Read-only CRM database tool, exposed to Cursor as a custom tool; omit when database access is off. */
	dbTool?: CrmDbTool;
	/** CRM stand actions (update from the file system, compile), exposed to Cursor as custom tools; omit when the user has not enabled them. */
	crmTools?: CrmTool[];
	/** Tools of the host app (built-in CRM browser and others), exposed to Cursor as custom tools; omit when none. */
	appTools?: AppTool[];
	/** Stops the turn: cancels the current Cursor run. */
	signal?: AbortSignal;
}

/**
 * The only Cursor tools offered to the model: MCP (our custom tools) and the todo list. Built-in read, search,
 * edit, delete, shell, subagents (task) and anything added in later SDK versions stay off: files and commands go
 * through our local tools, which check every path (sandboxGuard) like the Claude provider does.
 */
const CURSOR_TOOLS: ToolName[] = ["mcp", "updateTodos", "readTodos"];

const RESULT_TEXT_LIMIT = 4000;

function knowledgeDirectory(): string {
	return path.join(__dirname, "../../knowledge");
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Rules the Cursor agent follows itself (the model reads them in the first message). The paths are enforced
 * by our local tools (read_file, write_file, run_shell…), which reject everything outside the given folders;
 * the rest of the rules are the workflow and the confirmation of destructive actions.
 */
export function buildCursorSafetyRules(readRoot: string, writeRoot: string, knowledgeDir: string): string {
	return [
		"РЕЖИМ CURSOR. Встроенных инструментов чтения, поиска, правки и терминала в этой среде нет — работай только инструментами приложения:",
		"- read_file, list_dir, glob_files, grep_files — чтение и поиск (вместо Read, LS, Glob, Grep); где в инструкциях сказано «инструмент Read» — это read_file.",
		"- write_file — создать или перезаписать файл; edit_file — точная замена фрагмента (вместо инструмента правки); run_shell — команда bash в папке Pkg (date, node со скриптами из каталога знаний, perl -pi и т.п.).",
		"- Правь файлы только write_file и edit_file; читай read_file и grep_files. Команды для правки текста (python, python3, ruby, php, sed -i, perl -i, node -e) не используй: они дольше, ломают кодировку и часть из них каждый раз требует подтверждения пользователя. run_shell — для date, uuidgen (идентификаторы — только uuidgen, не python), node --check, скриптов проверок из каталога знаний и чтения логов стенда.",
		"- Порядок работы из инструкций обязателен, даже если задача кажется простой: 1) пакет — если пользователь не назвал пакет, а в Pkg их несколько, сначала спроси, в каком пакете работать, и не выбирай за него, даже если найдёшь подходящие схемы; 2) вопросы по требованиям с вариантами ответов; 3) план с AC/CC/DoD и остановка до подтверждения пользователя: сообщение с планом всегда заканчивай блоком <choices> с вопросом «Подтверждаете план?» и вариантами «Делай» и «Нужны правки» — без этого блока у пользователя нет кнопок и план выглядит незаконченным. Только после подтверждения — изменения файлов.",
		`- Читать можно только папку приложения ${readRoot} и каталог знаний ${knowledgeDir}, изменять — только ${writeRoot}. Приложение проверяет каждый путь и отклоняет остальные; команды выполняются без сети.`,
		"- Не читай файлы с секретами: ConnectionStrings.config, *.pfx, *.p12, *.pem, *.key — даже внутри папки приложения. Тип СУБД бери из DBEngineType существующих SQL-скриптов в Pkg; если их нет — спроси у пользователя.",
		"- Удаление файлов и папок, перемещение с перезаписью и команды git, меняющие состояние (checkout, reset, restore, stash, add, commit и т.п.), — только после явного согласия пользователя в чате: перечисли, что удалишь или изменишь, и дождись ответа. Такие команды run_shell приложение ещё раз показывает пользователю на подтверждение.",
		"- Удаление и массовое изменение данных (SQL-скрипт с DELETE или UPDATE) — только после вопроса пользователю блоком <choices>, даже если это очевидные дубли или мусор, найденный по ходу работы: сначала опиши находку и спроси, скрипт пиши после ответа.",
		"- Найденные в данных дубли, записи вне пакета и мусор не скрывай: сообщи о них до плана или в плане и спроси блоком <choices>, что с ними делать; молча пропускать находку нельзя.",
		"- Сеть, установка пакетов и сторонние программы не нужны — не используй их."
	].join("\n");
}

const CURSOR_FOLLOW_UP_REMINDER = [
	"<reminder>",
	"Инструкции из первого сообщения действуют.",
	"Новая задача или любая правка файлов, даже маленькая: пакет, вопросы, затем план (AC/CC/DoD, схемы, как проверить) и остановка до явного подтверждения пользователя («делай», «да», «подтверждаю»).",
	"Ответы пользователя на твои вопросы — не подтверждение плана: после них покажи план и остановись.",
	"Без подтверждённого плана файлы в Pkg не меняй.",
	"Вопросы с вариантами — блоком <choices> в конце сообщения (формат — в инструкциях первого сообщения). Сообщение с планом всегда заканчивается блоком <choices> с вопросом «Подтверждаете план?» и вариантами «Делай» и «Нужны правки».",
	"Исключение — исправление ошибки в только что сделанном по подтверждённому плану: исправляй сразу, без нового плана, если объём задачи не меняется.",
	"</reminder>"
].join("\n");

/** First message of a new Cursor conversation: our system prompt and safety rules, then the user's task. */
export function buildCursorFirstMessage(systemPrompt: string, safetyRules: string, userPrompt: string): string {
	return `<instructions>\n${systemPrompt}\n\n${safetyRules}\n</instructions>\n\n${userPrompt}`;
}

/** Every later message of a Cursor conversation: a short reminder of the workflow, then the user's text. */
export function buildCursorFollowUpMessage(userPrompt: string): string {
	return `${CURSOR_FOLLOW_UP_REMINDER}\n\n${userPrompt}`;
}

/** The CRM database tool in Cursor's custom-tool shape. */
function cursorDbTool(dbTool: CrmDbTool): SDKCustomTool {
	return {
		description: dbTool.description,
		inputSchema: { type: "object", properties: { sql: { type: "string", description: "Один запрос SELECT или WITH" } }, required: ["sql"] },
		annotations: { readOnlyHint: true },
		execute: async (args) => {
			const result = await dbTool.execute(typeof args.sql === "string" ? args.sql : "");
			return { content: [{ type: "text", text: result.text }], isError: result.isError };
		}
	};
}

/** A CRM stand action in Cursor's custom-tool shape (no parameters). */
function cursorCrmTool(crmTool: CrmTool): SDKCustomTool {
	return {
		description: crmTool.description,
		inputSchema: { type: "object", properties: {} },
		execute: async () => {
			const result = await crmTool.execute();
			return { content: [{ type: "text", text: result.text }], isError: result.isError };
		}
	};
}

/** A host-app tool in Cursor's custom-tool shape (parameters from its JSON Schema). */
function cursorAppTool(appTool: AppTool): SDKCustomTool {
	return {
		description: appTool.description,
		inputSchema: appToolJsonSchema(appTool) as SDKCustomTool["inputSchema"],
		execute: async (args) => {
			const result = await appTool.execute(args as Record<string, unknown>);
			return { content: appToolContent(result), isError: result.isError };
		}
	};
}

/**
 * Arguments of a crm_browser_* call wrapped by MCP: the first of args / arguments / input / toolArgs
 * that is an object, or a JSON string of one; empty object otherwise.
 */
function wrappedToolArguments(args: unknown): Record<string, unknown> {
	const r = record(args);
	for (const key of ["args", "arguments", "input", "toolArgs"]) {
		const value = r[key];
		if (value && typeof value === "object") {
			return value as Record<string, unknown>;
		}
		if (typeof value === "string") {
			try {
				const parsed: unknown = JSON.parse(value);
				if (parsed && typeof parsed === "object") {
					return parsed as Record<string, unknown>;
				}
			} catch {
				// not JSON — keep looking
			}
		}
	}
	return {};
}

/** Claude-style name and input of one of our local tools, so the chat shows it like the Claude provider's tools. */
function localToolEvent(toolName: string, a: Record<string, unknown>): { name: string; input: Record<string, unknown> } {
	switch (toolName) {
		case "read_file": return { name: "Read", input: { file_path: a.path } };
		case "list_dir": return { name: "LS", input: { path: a.path } };
		case "glob_files": return { name: "Glob", input: { pattern: a.pattern, path: a.path } };
		case "grep_files": return { name: "Grep", input: { pattern: a.pattern, path: a.path } };
		case "write_file": return { name: "Write", input: { file_path: a.path } };
		case "edit_file": return { name: "Edit", input: { file_path: a.path } };
		default: { // run_shell
			const command = typeof a.command === "string" ? a.command : "";
			const firstLine = command.split("\n")[0];
			return { name: "Bash", input: { command, description: firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine } };
		}
	}
}

/** Maps a Cursor tool call to the Claude-style name and input the desktop UI already understands. */
export function normalizeCursorToolCall(name: string, args: unknown): { name: string; input: Record<string, unknown> } {
	if (LOCAL_TOOL_NAMES.includes(name)) {
		return localToolEvent(name, record(args));
	}
	if (/mcp/i.test(name)) {
		const r = record(args);
		const explicit = [r.toolName, r.name, r.tool].find((value): value is string => typeof value === "string" && LOCAL_TOOL_NAMES.includes(value));
		if (explicit) {
			const inner = wrappedToolArguments(args);
			return localToolEvent(explicit, Object.keys(inner).length > 0 ? inner : r);
		}
	}
	if (/^crm_browser_[a-z_]+$/.test(name)) {
		return { name, input: record(args) };
	}
	if (/mcp/i.test(name)) {
		const browserTool = /crm_browser_[a-z_]+/.exec(JSON.stringify(args ?? null));
		if (browserTool) {
			return { name: browserTool[0], input: wrappedToolArguments(args) };
		}
	}
	if (name === "pkg_lint" || (/mcp/i.test(name) && JSON.stringify(args ?? null).includes("pkg_lint"))) {
		return { name: "pkg_lint", input: name === "pkg_lint" ? record(args) : wrappedToolArguments(args) };
	}
	for (const toolName of ["crm_update_from_fs", "crm_compile"]) {
		if (name === toolName || (/mcp/i.test(name) && JSON.stringify(args ?? null).includes(toolName))) {
			return { name: toolName, input: {} };
		}
	}
	if (name === "crm_db_query" || (/mcp/i.test(name) && JSON.stringify(args ?? null).includes("crm_db_query"))) {
		return { name: "crm_db_query", input: { sql: findSqlArgument(args) } };
	}
	const a = record(args);
	switch (name) {
		case "read":
			return { name: "Read", input: { file_path: a.path } };
		case "write":
			return { name: "Write", input: { file_path: a.path } };
		case "edit":
			return { name: "Edit", input: { file_path: a.path } };
		case "delete":
			return { name: "Delete", input: { file_path: a.path } };
		case "shell":
			return localToolEvent("run_shell", a);
		case "grep":
			return { name: "Grep", input: { pattern: a.pattern, path: a.path } };
		case "glob":
			return { name: "Glob", input: { pattern: a.globPattern, path: a.targetDirectory } };
		case "ls":
			return { name: "LS", input: { path: a.path } };
		case "updateTodos":
			return { name: "TodoWrite", input: {} };
		case "task":
			return { name: "Task", input: { description: a.description } };
		default:
			return { name, input: a };
	}
}

/** Finds the `sql` argument of a CRM database tool call, also when it is nested or passed as a JSON string. */
function findSqlArgument(value: unknown, depth = 0): string | undefined {
	const r = record(value);
	if (typeof r.sql === "string") {
		return r.sql;
	}
	if (depth >= 3) {
		return undefined;
	}
	for (const [key, nested] of Object.entries(r)) {
		if (typeof nested === "string" && ["args", "arguments", "input", "toolArgs"].includes(key)) {
			try {
				const found = findSqlArgument(JSON.parse(nested), depth + 1);
				if (found !== undefined) {
					return found;
				}
			} catch {
				// not JSON — keep looking
			}
		} else if (nested && typeof nested === "object") {
			const found = findSqlArgument(nested, depth + 1);
			if (found !== undefined) {
				return found;
			}
		}
	}
	return undefined;
}

function resultText(result: unknown): string {
	const text = typeof result === "string" ? result : JSON.stringify(result ?? null, null, 2) ?? "";
	return text.length > RESULT_TEXT_LIMIT ? `${text.slice(0, RESULT_TEXT_LIMIT)}\n… [обрезано]` : text;
}

function resultFailed(result: unknown): boolean {
	const r = record(result);
	return "error" in r || "failure" in r || "rejected" in r;
}

/** Curated models for long agentic BPMSoft tasks, in display order; matched against id and display name. */
const RECOMMENDED_MODEL_PATTERNS: RegExp[] = [
	/opus[\s-]*5\.5/i,
	/sonnet[\s-]*5\.5/i,
	/gpt[\s-]*5\.6/i,
	/gpt[\s-]*5\.5/i,
	/gemini[\s-]*3\.1[\s-]*pro/i,
	/grok[\s-]*4\.7/i,
	/composer[\s-]*2\.5/i
];

/** Position in the recommended list, or -1. */
export function cursorRecommendationRank(text: string): number {
	return RECOMMENDED_MODEL_PATTERNS.findIndex((pattern) => pattern.test(text));
}

interface CursorModelListItem {
	id: string;
	displayName?: string;
	parameters?: Array<{ id: string; displayName?: string; values: Array<{ value: string; displayName?: string }> }>;
	variants?: Array<{ params: CursorModelParam[]; displayName: string; isDefault?: boolean }>;
}

/** Human label of variant params from the model's parameter definitions, e.g. "High · 1M". */
function describeVariantParams(model: CursorModelListItem, params: CursorModelParam[]): string {
	return params
		.map((param) => {
			const definition = model.parameters?.find((item) => item.id === param.id);
			const value = definition?.values.find((item) => item.value === param.value);
			if (value?.displayName) {
				return value.displayName;
			}
			return `${definition?.displayName ?? param.id}: ${param.value}`;
		})
		.join(" · ");
}

/**
 * Expands the API model list into picker options: each model in its default mode plus
 * its non-default variants. Recommended models come first (in curated order), the rest
 * keep the API order.
 */
export function expandCursorModels(models: CursorModelListItem[]): CursorModelOption[] {
	const entries: Array<{ option: CursorModelOption; rank: number; index: number }> = [];
	for (const model of models) {
		const name = model.displayName || model.id;
		const rank = cursorRecommendationRank(`${model.id} ${name}`);
		const recommended = rank >= 0;
		entries.push({ option: { id: model.id, name, recommended }, rank, index: entries.length });
		for (const variant of model.variants ?? []) {
			if (variant.isDefault || variant.params.length === 0) {
				continue;
			}
			const own = variant.displayName.trim();
			const sameAsModel = own === "" || own.toLowerCase() === name.toLowerCase();
			const variantName = sameAsModel
				? `${name} · ${describeVariantParams(model, variant.params)}`
				: own.toLowerCase().includes(name.toLowerCase())
					? own
					: `${name} · ${own}`;
			entries.push({
				option: { id: model.id, name: variantName, params: variant.params, recommended },
				rank,
				index: entries.length
			});
		}
	}
	entries.sort((a, b) => {
		const ra = a.rank >= 0 ? a.rank : Number.MAX_SAFE_INTEGER;
		const rb = b.rank >= 0 ? b.rank : Number.MAX_SAFE_INTEGER;
		return ra !== rb ? ra - rb : a.index - b.index;
	});

	// Remove exact duplicate options (same id and identical params in same order)
	const seenOptions = new Set<string>();
	const uniqueEntries = entries.filter((entry) => {
		const paramsKey = entry.option.params
			? entry.option.params.map((p) => `${p.id}=${p.value}`).join(",")
			: "default";
		const key = `${entry.option.id}:${paramsKey}`;
		if (seenOptions.has(key)) {
			return false;
		}
		seenOptions.add(key);
		return true;
	});

	// Make names unique: append parameter descriptions to duplicates
	const nameCounts = new Map<string, number>();
	const nameToIndices = new Map<string, number[]>();
	uniqueEntries.forEach((entry, idx) => {
		const count = (nameCounts.get(entry.option.name) ?? 0) + 1;
		nameCounts.set(entry.option.name, count);
		const indices = nameToIndices.get(entry.option.name) ?? [];
		indices.push(idx);
		nameToIndices.set(entry.option.name, indices);
	});

	const result = uniqueEntries.map((entry) => entry.option);
	for (const [name, indices] of nameToIndices) {
		if (indices.length > 1) {
			// Skip the first occurrence, append suffix to the rest
			for (let i = 1; i < indices.length; i++) {
				const idx = indices[i];
				const entry = uniqueEntries[idx];
				const paramsSuffix = entry.option.params?.length
					? entry.option.params.map((p) => `${p.id}=${p.value}`).join(", ")
					: "по умолчанию";
				result[idx].name = `${name} (${paramsSuffix})`;
			}
		}
	}

	return result;
}

/** Network failures of the Cursor API that are worth another try when nothing reached the model yet. */
export function isTransientCursorError(message: string): boolean {
	return /fetch failed|failed to connect|network request failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message);
}

const CURSOR_SEND_ATTEMPTS = 3;
const CURSOR_RETRY_DELAY_MS = 5000;

/** Error text with the underlying cause — the SDK wraps fetch failures as "Network request failed". */
export function cursorErrorMessage(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
		const err = current as { message?: unknown; code?: unknown; cause?: unknown };
		const message = typeof err.message === "string" ? err.message : depth === 0 ? String(current) : "";
		const code = typeof err.code === "string" ? err.code : "";
		const text = code && !message.includes(code) ? `${message} (${code})` : message;
		if (text && !parts.some((part) => part.includes(text))) {
			parts.push(text);
		}
		current = err.cause;
	}
	if (parts.length === 0) {
		parts.push(String(error));
	}
	return parts.join(": ");
}

/**
 * Adds the tokens of one Cursor `usage` message (one per run) to the turn total.
 * Other messages leave the total unchanged.
 */
export function addCursorUsage(total: TokenUsage | undefined, message: unknown): TokenUsage | undefined {
	const r = record(message);
	if (r.type !== "usage") {
		return total;
	}
	const u = record(r.usage);
	const sum: TokenUsage = total ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
	return {
		inputTokens: sum.inputTokens + (typeof u.inputTokens === "number" ? u.inputTokens : 0),
		outputTokens: sum.outputTokens + (typeof u.outputTokens === "number" ? u.outputTokens : 0),
		cacheReadTokens: sum.cacheReadTokens + (typeof u.cacheReadTokens === "number" ? u.cacheReadTokens : 0),
		cacheWriteTokens: sum.cacheWriteTokens + (typeof u.cacheWriteTokens === "number" ? u.cacheWriteTokens : 0)
	};
}

/**
 * Converts one Cursor stream message to AgentEvents. Tool results are shaped like
 * Claude SDK user messages with `tool_result` blocks, so the UI and logs treat them
 * the same way. `seenCalls` remembers which tool calls already produced a `tool_use`.
 */
export function mapCursorMessage(message: SDKMessage, seenCalls: Set<string>): AgentEvent[] {
	if (message.type === "assistant") {
		const text = message.message.content
			.filter((block): block is { type: "text"; text: string } => block.type === "text")
			.map((block) => block.text)
			.join("");
		return text ? [{ type: "text", text }] : [];
	}
	if (message.type === "tool_call") {
		const events: AgentEvent[] = [];
		if (!seenCalls.has(message.call_id)) {
			seenCalls.add(message.call_id);
			const tool = normalizeCursorToolCall(message.name, message.args);
			events.push({ type: "tool_use", name: tool.name, input: tool.input });
		}
		if (message.status !== "running") {
			const isError = message.status === "error" || resultFailed(message.result);
			events.push({
				type: "other",
				raw: {
					type: "user",
					source: "cursor",
					message: { content: [{ type: "tool_result", tool_use_id: message.call_id, is_error: isError, content: resultText(message.result) }] }
				}
			});
		}
		return events;
	}
	if (message.type === "thinking" || message.type === "user" || message.type === "system" || message.type === "usage") {
		return [];
	}
	return [{ type: "other", raw: message }];
}

/**
 * Lists models available to the Cursor API key (for the model picker).
 * Expands each model into its default variant and non-default variants (thinking, reasoning, Max, etc.)
 * as separate options. Recommended models appear first in curated order.
 */
export async function listCursorModels(apiKey: string): Promise<CursorModelOption[]> {
	try {
		const models = await Cursor.models.list({ apiKey });
		return expandCursorModels(models);
	} catch (error) {
		throw new Error(cursorErrorMessage(error));
	}
}

async function* runCursorAgentQueryUnsafe(options: RunCursorAgentQueryOptions): AsyncGenerator<AgentEvent, void> {
	const knowledgeDir = knowledgeDirectory();
	const customTools: Record<string, SDKCustomTool> = {};
	if (options.dbTool) {
		customTools[options.dbTool.name] = cursorDbTool(options.dbTool);
	}
	for (const crmTool of options.crmTools ?? []) {
		customTools[crmTool.name] = cursorCrmTool(crmTool);
	}
	for (const appTool of options.appTools ?? []) {
		customTools[appTool.name] = cursorAppTool(appTool);
	}
	const localTools = createLocalTools({
		cwd: options.cwd,
		readRoots: [options.readRoot ?? options.cwd],
		writeRoots: [options.cwd],
		knowledgeDir,
		requestPermission: options.requestToolPermission,
		signal: options.signal
	});
	for (const localTool of localTools) {
		customTools[localTool.name] = cursorAppTool(localTool);
	}
	const agentOptions: AgentOptions = {
		apiKey: options.apiKey,
		model: options.modelParams?.length ? { id: options.model, params: options.modelParams } : { id: options.model },
		tools: CURSOR_TOOLS,
		local: {
			cwd: options.cwd,
			// Isolation from the developer's own Cursor setup (rules, hooks, plugins).
			settingSources: [] as never[],
			// Cursor's own sandbox guards only its built-in shell, which is off; kept on where it exists as a second line of defence.
			sandboxOptions: { enabled: process.platform !== "win32" },
			// Custom tools run in this process (not in Cursor's sandbox); settingSources: [] keeps the user's own MCP servers out.
			customTools: customTools
		}
	};
	const startedAt = Date.now();
	let usage: TokenUsage | undefined;
	const agent: SDKAgent = options.resume
		? await Agent.resume(options.resume, agentOptions)
		: await Agent.create(agentOptions);
	try {
		yield { type: "system_init", model: options.model, mcpServers: [], sessionId: agent.agentId };
		const message = options.resume
			? buildCursorFollowUpMessage(options.prompt)
			: buildCursorFirstMessage(
					buildBpmsoftSystemPrompt(knowledgeDir, { dbQuery: Boolean(options.dbTool), crmActions: Boolean(options.crmTools?.length), crmBrowser: Boolean(options.appTools?.some((t) => t.name.startsWith("crm_browser_"))) }),
					buildCursorSafetyRules(options.readRoot ?? options.cwd, options.cwd, knowledgeDir),
					options.prompt
				);
		let finished = false;
		let errorText = "";
		let durationMs: number | undefined;
		for (let attempt = 1; attempt <= CURSOR_SEND_ATTEMPTS && !options.signal?.aborted; attempt++) {
			let produced = false;
			try {
				const run = await agent.send(message);
				const cancelRun = () => {
					run.cancel().catch(() => undefined);
				};
				if (options.signal?.aborted) {
					cancelRun();
				} else {
					options.signal?.addEventListener("abort", cancelRun, { once: true });
				}
				try {
					const seenCalls = new Set<string>();
					let pendingText = "";
					for await (const sdkMessage of run.stream()) {
						usage = addCursorUsage(usage, sdkMessage);
						for (const event of mapCursorMessage(sdkMessage, seenCalls)) {
							produced = true;
							if (event.type === "text") {
								pendingText += event.text;
								continue;
							}
							if (pendingText) {
								yield { type: "text", text: pendingText };
								pendingText = "";
							}
							yield event;
						}
					}
					if (pendingText) {
						yield { type: "text", text: pendingText };
					}
					const result = await run.wait();
					finished = result.status === "finished";
					errorText = finished ? "" : result.error?.message ?? "";
					durationMs = result.durationMs;
				} finally {
					options.signal?.removeEventListener("abort", cancelRun);
				}
			} catch (error) {
				if (options.signal?.aborted) {
					finished = false;
					errorText = "";
					break;
				}
				if (produced || !isTransientCursorError(cursorErrorMessage(error)) || attempt === CURSOR_SEND_ATTEMPTS) {
					throw error;
				}
				finished = false;
				errorText = cursorErrorMessage(error);
			}
			if (finished || produced || !isTransientCursorError(errorText) || attempt === CURSOR_SEND_ATTEMPTS || options.signal?.aborted) {
				break;
			}
			yield {
				type: "text",
				text: `Нет связи с Cursor (${errorText}). Повторяю запрос через ${CURSOR_RETRY_DELAY_MS / 1000} с — попытка ${attempt + 1} из ${CURSOR_SEND_ATTEMPTS}.`
			};
			await new Promise((resolve) => setTimeout(resolve, CURSOR_RETRY_DELAY_MS));
		}
		const stopped = Boolean(options.signal?.aborted);
		if (!finished && errorText && !stopped) {
			yield { type: "text", text: `Ошибка Cursor: ${errorText}` };
		}
		yield {
			type: "result",
			success: finished && !stopped,
			durationMs: durationMs ?? Date.now() - startedAt,
			sessionId: agent.agentId,
			usage,
			...(stopped ? { stopped: true } : {})
		};
	} finally {
		agent.close();
	}
}

/**
 * Runs one turn of the BPMSoft agent through the Cursor SDK (local agent on the
 * user's machine) and yields the same AgentEvents as `runBpmsoftAgentQuery`.
 * Files and commands go through our local tools (read_file, write_file, run_shell…), which check
 * every path (sandboxGuard): reads only in the application folder and the knowledge directory, writes only in `cwd` (Pkg).
 * Cursor's built-in tools are off. The workflow rules are passed to the model in the first message
 * (see `buildCursorSafetyRules`).
 */
export async function* runCursorAgentQuery(options: RunCursorAgentQueryOptions): AsyncGenerator<AgentEvent, void> {
	try {
		yield* runCursorAgentQueryUnsafe(options);
	} catch (error) {
		throw new Error(cursorErrorMessage(error));
	}
}
