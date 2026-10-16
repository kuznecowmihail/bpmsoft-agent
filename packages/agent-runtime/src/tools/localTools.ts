import { execFile, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AppTool, AppToolParam, AppToolResult } from "./appTool";
import { checkToolAccess, isAutoApprovedToolCall, SandboxDecision, SandboxPolicy, ShellApprovalOptions } from "../safety/sandboxGuard";
import { buildSeatbeltProfile } from "../safety/shellSandbox";

export interface LocalToolsOptions {
	/** Working directory of commands and of relative paths: the project's Pkg folder. */
	cwd: string;
	/** Folders the agent may read (the application folder). The knowledge directory is added automatically. */
	readRoots: string[];
	/** Folders the agent may change (Pkg). */
	writeRoots: string[];
	/** Knowledge directory: readable, and node scripts from its scripts/ folder run without asking. */
	knowledgeDir: string;
	/** Asks the user before commands that may delete files, change git state or run other programs; without it such commands are refused. */
	requestPermission?: (request: { toolName: string; input: Record<string, unknown> }) => Promise<boolean>;
	/** For tests; default process.platform / os.homedir(). */
	platform?: NodeJS.Platform;
	homeDir?: string;
}

export const LOCAL_TOOL_NAMES = ["read_file", "list_dir", "glob_files", "grep_files", "write_file", "edit_file", "run_shell"];

/** Output limit of one tool result, in characters. */
const MAX_OUTPUT = 30000;
/** Read window of read_file, in lines, when `limit` is not given. */
const DEFAULT_READ_LIMIT = 2000;
/** Longer lines are cut in read_file output. */
const MAX_LINE_LENGTH = 2000;
/** Entries shown by list_dir. */
const MAX_LIST_ENTRIES = 500;
/** Files shown by glob_files. */
const MAX_GLOB_FILES = 500;
/** Lines shown by grep_files when `head_limit` is not given. */
const DEFAULT_HEAD_LIMIT = 200;
const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const MAX_SHELL_TIMEOUT_MS = 600000;
const SEARCH_TIMEOUT_MS = 30000;
const SEARCH_MAX_BUFFER = 20 * 1024 * 1024;
/** Shell output kept in memory: twice the tool output limit. */
const SHELL_COLLECT_LIMIT = MAX_OUTPUT * 2;
/** Files with secrets, never shown by grep_files. */
const SECRET_EXCLUDE_GLOBS = ["!**/ConnectionStrings.config", "!**/*.pfx", "!**/*.p12", "!**/*.pem", "!**/*.key"];
/** grep_files output_mode → ripgrep flag. */
const OUTPUT_MODE_FLAGS: Record<string, string> = { files_with_matches: "-l", content: "-n", count: "-c" };

interface RipgrepResult {
	stdout: string;
	/** Problem reported by rg (e.g. unreadable files); partial results may still be in stdout. */
	error?: string;
}

interface ShellResult {
	output: string;
	exitCode: number | null;
	timedOut: boolean;
}

/** Cuts a tool output to the limit and says how long it was. */
function truncate(text: string): string {
	return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… [обрезано, всего ${text.length} символов]` : text;
}

function countLines(text: string): number {
	return text === "" ? 0 : text.split("\n").length;
}

function fail(text: string): AppToolResult {
	return { text, isError: true };
}

function ok(text: string): AppToolResult {
	return { text, isError: false };
}

function denied(decision: SandboxDecision): AppToolResult {
	return fail(decision.reason ?? "Доступ запрещён");
}

function requireString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || value === "") {
		throw new Error(`Не указан параметр ${key}`);
	}
	return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean {
	return args[key] === true;
}

/** Wraps a tool body: any exception becomes an error result instead of breaking the agent loop. */
function defineTool(
	name: string,
	description: string,
	params: Record<string, AppToolParam>,
	run: (args: Record<string, unknown>) => Promise<AppToolResult>
): AppTool {
	return {
		name,
		description,
		params,
		async execute(args) {
			try {
				return await run(args);
			} catch (error) {
				return fail(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	};
}

/** Variables that agent shell commands may see: system ones only. */
const SHELL_ENV_NAMES = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|TZ|TERM|TMPDIR|TMP|TEMP|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|MSYSTEM)$/i;

/** Environment of agent shell commands: only system variables, no keys or tokens of the user's own environment. */
export function shellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const result: NodeJS.ProcessEnv = {};
	for (const key of Object.keys(env)) {
		if (SHELL_ENV_NAMES.test(key)) {
			result[key] = env[key];
		}
	}
	return result;
}

/** Finds the ripgrep binary of @cursor/sdk for the platform, or "rg" from PATH. */
export function resolveRipgrep(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
	try {
		const packageJson = require.resolve(`@cursor/sdk-${platform}-${arch}/package.json`);
		const candidate = path.join(path.dirname(packageJson), "bin", platform === "win32" ? "rg.exe" : "rg");
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	} catch {
		// the platform package is not installed: fall back to PATH
	}
	return "rg";
}

/** Runs ripgrep without a shell. Exit code 1 (no matches) is not an error; code 2 keeps partial results with the first error line. */
function runRipgrep(args: string[], platform: NodeJS.Platform): Promise<RipgrepResult> {
	return new Promise((resolve, reject) => {
		execFile(resolveRipgrep(platform), args, { maxBuffer: SEARCH_MAX_BUFFER, timeout: SEARCH_TIMEOUT_MS }, (error, stdout, stderr) => {
			const out = stdout.toString();
			if (!error) {
				resolve({ stdout: out });
				return;
			}
			if (error.killed) {
				reject(new Error(`поиск остановлен по таймауту ${SEARCH_TIMEOUT_MS / 1000} с`));
				return;
			}
			if (typeof error.code === "number") {
				const firstErrorLine = stderr.toString().trim().split("\n")[0];
				resolve({ stdout: out, error: error.code === 1 ? undefined : firstErrorLine || `rg завершился с кодом ${error.code}` });
				return;
			}
			reject(error);
		});
	});
}

/** mtime of a file in ms, 0 when it cannot be read. */
function mtimeOf(file: string): number {
	try {
		return fs.statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

/**
 * Runs a bash command without a shell wrapper of ours. On macOS the profile is applied through sandbox-exec.
 * Output of stdout and stderr is kept in arrival order; on timeout the process is killed and the result is returned at once
 * (a grandchild process may keep the pipes open, so waiting for "close" could hang).
 */
export function runShellCommand(
	command: string,
	opts: { cwd: string; platform: NodeJS.Platform; seatbeltProfile?: string; timeoutMs: number }
): Promise<ShellResult> {
	return new Promise((resolve) => {
		const { cwd, platform, seatbeltProfile, timeoutMs } = opts;
		let output = "";
		let timedOut = false;
		let settled = false;
		let timer: NodeJS.Timeout | undefined;

		const finish = (exitCode: number | null) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			resolve({ output, exitCode, timedOut });
		};

		const collect = (chunk: string) => {
			if (output.length < SHELL_COLLECT_LIMIT) {
				output = (output + chunk).slice(0, SHELL_COLLECT_LIMIT);
			}
		};

		// Off Windows the shell gets its own process group (detached), so a timeout can kill the whole tree.
		let child: ChildProcess;
		if (platform === "win32") {
			child = spawn("bash", ["-c", command], { cwd, env: shellEnv(), windowsHide: true });
		} else if (platform === "darwin" && seatbeltProfile) {
			child = spawn("/usr/bin/sandbox-exec", ["-p", seatbeltProfile, "/bin/bash", "-c", command], { cwd, env: shellEnv(), detached: true });
		} else {
			child = spawn("/bin/bash", ["-c", command], { cwd, env: shellEnv(), detached: true });
		}

		const killTree = () => {
			if (platform === "win32") {
				child.kill("SIGKILL");
				// taskkill /t also stops child processes; its own failure is not reported.
				spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }).on("error", () => undefined);
				return;
			}
			try {
				process.kill(-child.pid!, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		};

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", collect);
		child.stderr?.on("data", collect);

		child.on("error", (error: NodeJS.ErrnoException) => {
			output = platform === "win32" && error.code === "ENOENT" ? "Не найден bash — установите Git for Windows" : `Не удалось запустить команду: ${error.message}`;
			finish(127);
		});
		child.on("close", (code: number | null) => finish(code));

		timer = setTimeout(() => {
			timedOut = true;
			killTree();
			finish(null);
		}, timeoutMs);
	});
}

export function createLocalTools(options: LocalToolsOptions): AppTool[] {
	const policy: SandboxPolicy = {
		readRoots: [...options.readRoots, options.knowledgeDir],
		writeRoots: options.writeRoots,
		sourceRoots: [options.knowledgeDir]
	};
	const platform = options.platform ?? process.platform;
	const homeDir = options.homeDir ?? os.homedir();
	const cwd = options.cwd;
	const resolvePath = (p: string) => path.resolve(cwd, p);

	const readFile = defineTool(
		"read_file",
		"Читает текстовый файл с номерами строк (путь абсолютный или относительно Pkg). Используй вместо встроенного Read. Файлы с секретами недоступны.",
		{
			path: { type: "string", description: "Путь к файлу: абсолютный или относительно Pkg" },
			offset: { type: "number", description: "Номер первой строки, с 1", optional: true },
			limit: { type: "number", description: "Сколько строк прочитать, по умолчанию 2000", optional: true }
		},
		async (args) => {
			const abs = resolvePath(requireString(args, "path"));
			const decision = checkToolAccess("Read", { file_path: abs }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			if (fs.statSync(abs).isDirectory()) {
				return fail("Это папка — используй list_dir");
			}
			const buffer = fs.readFileSync(abs);
			if (buffer.subarray(0, 8000).includes(0)) {
				return fail("Двоичный файл — как текст его прочитать нельзя");
			}

			let text = buffer.toString("utf8");
			const hasBom = text.startsWith("\uFEFF");
			if (hasBom) {
				text = text.slice(1);
			}
			const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
			if (lines.length > 0 && lines[lines.length - 1] === "") {
				lines.pop();
			}

			const out: string[] = [];
			if (hasBom) {
				out.push("[файл начинается с BOM]");
			}
			if (lines.length === 0) {
				out.push("(файл пуст)");
				return ok(out.join("\n"));
			}
			const offset = Math.max(1, Math.floor(optionalNumber(args, "offset") ?? 1));
			const limit = Math.max(1, Math.floor(optionalNumber(args, "limit") ?? DEFAULT_READ_LIMIT));
			if (offset > lines.length) {
				return fail(`В файле ${lines.length} строк, offset ${offset} за пределами файла`);
			}
			const start = offset - 1;
			const end = Math.min(lines.length, start + limit);
			// Character budget of the result, with room reserved for the tail note.
			let size = out.reduce((sum, line) => sum + line.length + 1, 0);
			let last = start;
			for (let i = start; i < end; i++) {
				const line = lines[i].length > MAX_LINE_LENGTH ? `${lines[i].slice(0, MAX_LINE_LENGTH)}… [строка обрезана]` : lines[i];
				const numbered = `${String(i + 1).padStart(6)}\t${line}`;
				if (i > start && size + numbered.length + 1 > MAX_OUTPUT - 200) {
					break;
				}
				out.push(numbered);
				size += numbered.length + 1;
				last = i + 1;
			}
			if (last < lines.length) {
				out.push(`… показаны строки ${offset}–${last} из ${lines.length} — читай с offset ${last + 1}`);
			}
			return ok(truncate(out.join("\n")));
		}
	);

	const listDir = defineTool(
		"list_dir",
		"Показывает файлы и папки в папке; папки помечены «/» на конце. Путь абсолютный или относительно Pkg, по умолчанию Pkg.",
		{
			path: { type: "string", description: "Путь к папке: абсолютный или относительно Pkg; по умолчанию Pkg", optional: true }
		},
		async (args) => {
			const abs = resolvePath(optionalString(args, "path") ?? ".");
			const decision = checkToolAccess("LS", { path: abs }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			if (!fs.statSync(abs).isDirectory()) {
				return fail("Это не папка — читай файл через read_file");
			}
			const entries = fs
				.readdirSync(abs, { withFileTypes: true })
				.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
				.sort();
			if (entries.length === 0) {
				return ok("(папка пуста)");
			}
			const lines = entries.slice(0, MAX_LIST_ENTRIES);
			if (entries.length > MAX_LIST_ENTRIES) {
				lines.push(`… ещё ${entries.length - MAX_LIST_ENTRIES}`);
			}
			return ok(truncate(lines.join("\n")));
		}
	);

	const globFiles = defineTool(
		"glob_files",
		"Ищет файлы по шаблону glob внутри папки; сначала — недавно изменённые. Шаблон задаётся относительно path, например **/descriptor.json.",
		{
			pattern: { type: "string", description: "Шаблон glob относительно path, например **/descriptor.json" },
			path: { type: "string", description: "Папка поиска: абсолютная или относительно Pkg; по умолчанию Pkg", optional: true }
		},
		async (args) => {
			const pattern = requireString(args, "pattern");
			if (path.isAbsolute(pattern) || pattern.includes("..")) {
				return fail("pattern — относительно path, без .. и абсолютных путей");
			}
			const base = resolvePath(optionalString(args, "path") ?? ".");
			const decision = checkToolAccess("Glob", { path: base }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			const found = await runRipgrep(["--files", "--hidden", "--glob", "!.git", "--glob", pattern, base], platform);
			const files = found.stdout.split("\n").filter((line) => line !== "");
			if (files.length === 0) {
				return found.error ? fail(found.error) : ok("Файлов не найдено");
			}
			const sorted = files.map((file) => ({ file, mtime: mtimeOf(file) })).sort((a, b) => b.mtime - a.mtime);
			const lines = sorted.slice(0, MAX_GLOB_FILES).map((item) => item.file);
			if (sorted.length > MAX_GLOB_FILES) {
				lines.push(`… ещё ${sorted.length - MAX_GLOB_FILES} файлов`);
			}
			if (found.error) {
				lines.push(`[часть папок не просмотрена: ${found.error}]`);
			}
			return ok(truncate(lines.join("\n")));
		}
	);

	const grepFiles = defineTool(
		"grep_files",
		"Ищет регулярное выражение (синтаксис ripgrep) в файлах папки. Режимы вывода: files_with_matches (по умолчанию), content, count. Файлы с секретами пропускаются.",
		{
			pattern: { type: "string", description: "Регулярное выражение (синтаксис ripgrep)" },
			path: { type: "string", description: "Файл или папка: абсолютный или относительно Pkg; по умолчанию Pkg", optional: true },
			glob: { type: "string", description: "Фильтр имён файлов, например *.json", optional: true },
			output_mode: { type: "string", description: "files_with_matches (по умолчанию) | content | count", optional: true },
			ignore_case: { type: "boolean", description: "Игнорировать регистр", optional: true },
			context: { type: "number", description: "Строк контекста до и после совпадения (для content)", optional: true },
			head_limit: { type: "number", description: "Максимум строк вывода, по умолчанию 200", optional: true }
		},
		async (args) => {
			const pattern = requireString(args, "pattern");
			const target = resolvePath(optionalString(args, "path") ?? ".");
			const decision = checkToolAccess("Grep", { path: target }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			const mode = optionalString(args, "output_mode") ?? "files_with_matches";
			const modeFlag = OUTPUT_MODE_FLAGS[mode];
			if (modeFlag === undefined) {
				return fail(`Неизвестный output_mode: ${mode}. Допустимо: files_with_matches, content, count`);
			}
			const context = optionalNumber(args, "context");
			const headLimit = Math.max(1, Math.floor(optionalNumber(args, "head_limit") ?? DEFAULT_HEAD_LIMIT));

			const rgArgs = ["--no-config", "--color=never", "--max-columns=500", "--max-columns-preview", modeFlag];
			if (mode === "content" && context !== undefined && context > 0) {
				rgArgs.push("-C", String(Math.floor(context)));
			}
			if (optionalBoolean(args, "ignore_case")) {
				rgArgs.push("-i");
			}
			const glob = optionalString(args, "glob");
			if (glob !== undefined) {
				rgArgs.push("--glob", glob);
			}
			for (const excluded of SECRET_EXCLUDE_GLOBS) {
				rgArgs.push("--glob", excluded);
			}
			rgArgs.push("--", pattern, target);

			const found = await runRipgrep(rgArgs, platform);
			const lines = found.stdout.replace(/\n$/, "").split("\n").filter((line, index, all) => !(all.length === 1 && line === ""));
			if (lines.length === 0) {
				return found.error ? fail(found.error) : ok("Совпадений нет");
			}
			const shown = lines.slice(0, headLimit);
			if (lines.length > headLimit) {
				shown.push(`… ещё ${lines.length - headLimit} строк (head_limit ${headLimit})`);
			}
			if (found.error) {
				shown.push(`[часть файлов не просмотрена: ${found.error}]`);
			}
			return ok(truncate(shown.join("\n")));
		}
	);

	const writeFile = defineTool(
		"write_file",
		"Создаёт или полностью перезаписывает файл в Pkg (недостающие папки создаются). Путь абсолютный или относительно Pkg.",
		{
			path: { type: "string", description: "Путь к файлу: абсолютный или относительно Pkg" },
			content: { type: "string", description: "Полное содержимое файла" }
		},
		async (args) => {
			const abs = resolvePath(requireString(args, "path"));
			const content = args.content;
			if (typeof content !== "string") {
				throw new Error("Не указан параметр content");
			}
			const decision = checkToolAccess("Write", { file_path: abs }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, content, "utf8");
			return ok(`Записан файл ${abs} (${countLines(content)} строк)`);
		}
	);

	const editFile = defineTool(
		"edit_file",
		"Точная замена фрагмента в файле, как у инструмента правки: old_string должен совпасть с текстом файла дословно. Перед правкой прочитай файл через read_file. Путь абсолютный или относительно Pkg.",
		{
			path: { type: "string", description: "Путь к файлу: абсолютный или относительно Pkg" },
			old_string: { type: "string", description: "Точный фрагмент для замены, с отступами и переводами строк" },
			new_string: { type: "string", description: "Новый текст вместо фрагмента" },
			replace_all: { type: "boolean", description: "Заменить все вхождения, а не одно уникальное", optional: true }
		},
		async (args) => {
			const abs = resolvePath(requireString(args, "path"));
			const oldString = args.old_string;
			const newString = args.new_string;
			if (typeof oldString !== "string" || typeof newString !== "string") {
				throw new Error("Не указаны параметры old_string и new_string");
			}
			if (oldString === "" || oldString === newString) {
				return fail("old_string не должен быть пустым и должен отличаться от new_string");
			}
			const decision = checkToolAccess("Edit", { file_path: abs }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			const content = fs.readFileSync(abs, "utf8");
			let search = oldString;
			let replacement = newString;
			let occurrences = content.split(search).length - 1;
			// read_file shows CRLF files with plain "\n": retry the fragment with CRLF line breaks.
			if (occurrences === 0 && content.includes("\r\n") && oldString.includes("\n")) {
				const crlfOld = oldString.replace(/\r?\n/g, "\r\n");
				const crlfCount = content.split(crlfOld).length - 1;
				if (crlfCount > 0) {
					search = crlfOld;
					replacement = newString.replace(/\r?\n/g, "\r\n");
					occurrences = crlfCount;
				}
			}
			if (occurrences === 0) {
				return fail("old_string не найден в файле — перечитай файл read_file и скопируй фрагмент точно (без номеров строк)");
			}
			const replaceAll = optionalBoolean(args, "replace_all");
			if (occurrences > 1 && !replaceAll) {
				return fail(`old_string встречается ${occurrences} раз — добавь окружение, чтобы он стал уникальным, или replace_all: true`);
			}
			const updated = replaceAll ? content.split(search).join(replacement) : content.replace(search, () => replacement);
			fs.writeFileSync(abs, updated, "utf8");
			return ok(`Изменён файл ${abs} (замен: ${replaceAll ? occurrences : 1})`);
		}
	);

	const runShell = defineTool(
		"run_shell",
		"Команда bash в папке Pkg. На macOS выполняется в песочнице: запись только в Pkg и временные папки, сети нет. Удаление файлов, изменения git и сторонние программы — только с подтверждения пользователя.",
		{
			command: { type: "string", description: "Команда bash" },
			timeout_ms: { type: "number", description: "Таймаут в миллисекундах, по умолчанию 120000, максимум 600000", optional: true }
		},
		async (args) => {
			const command = requireString(args, "command");
			const decision = checkToolAccess("Bash", { command }, cwd, policy);
			if (!decision.allowed) {
				return denied(decision);
			}
			const osSandbox = platform === "darwin";
			const shellApproval: ShellApprovalOptions = {
				osSandbox,
				cwd,
				trustedScriptDirs: [path.join(options.knowledgeDir, "scripts")]
			};
			if (!isAutoApprovedToolCall("Bash", { command }, shellApproval)) {
				if (!options.requestPermission) {
					return fail("Команда требует подтверждения пользователя, а спросить его нельзя");
				}
				const approved = await options.requestPermission({ toolName: "Bash", input: { command } });
				if (!approved) {
					return fail("Пользователь отклонил команду");
				}
			}
			const requestedTimeout = optionalNumber(args, "timeout_ms");
			const timeoutMs = requestedTimeout !== undefined && requestedTimeout > 0 ? Math.min(requestedTimeout, MAX_SHELL_TIMEOUT_MS) : DEFAULT_SHELL_TIMEOUT_MS;

			const result = await runShellCommand(command, {
				cwd,
				platform,
				seatbeltProfile: osSandbox ? buildSeatbeltProfile({ writeRoots: options.writeRoots, readRoots: policy.readRoots, homeDir }) : undefined,
				timeoutMs
			});
			let text = result.output.trim() === "" ? "(нет вывода)" : truncate(result.output);
			if (result.timedOut) {
				text += `\n[команда прервана по таймауту ${timeoutMs} мс]`;
			}
			if (result.exitCode !== 0) {
				text += `\n[код выхода: ${result.exitCode}]`;
			}
			return { text, isError: result.timedOut || result.exitCode !== 0 };
		}
	);

	return [readFile, listDir, globFiles, grepFiles, writeFile, editFile, runShell];
}
