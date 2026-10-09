import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * File-access policy for the agent: reads are allowed only under `readRoots`
 * (the opened BPMSoft application folder and the knowledge directory),
 * writes only under `writeRoots` (the project's Pkg folder). Enforced by a
 * PreToolUse hook (see `anthropicProvider.ts`), i.e. before the user is ever
 * asked to approve a tool call.
 */
export interface SandboxPolicy {
	readRoots: string[];
	writeRoots: string[];
}

export interface SandboxDecision {
	allowed: boolean;
	reason?: string;
}

const READ_PATH_KEYS: Record<string, string[]> = {
	Read: ["file_path"],
	Glob: ["path", "pattern"],
	Grep: ["path"],
	LS: ["path"],
	NotebookRead: ["notebook_path"]
};

const WRITE_PATH_KEYS: Record<string, string[]> = {
	Write: ["file_path"],
	Edit: ["file_path"],
	MultiEdit: ["file_path"],
	NotebookEdit: ["notebook_path"]
};

/** Paths that are always fine to touch (e.g. `2>/dev/null`). */
const ALWAYS_ALLOWED = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

/** Shell-level write indicators; tested on the command with quoted strings and harmless redirections removed. */
const BASH_SHELL_WRITE_PATTERN =
	/(^|[\s;&|(])(rm|mv|cp|mkdir|rmdir|touch|tee|ln|chmod|chown|truncate|dd|install|rsync|tar|unzip|zip|patch)(\s|$)|>|\bsed\s+(-[a-zA-Z]+\s+)*-i|\bperl\s+-[a-zA-Z]*i|\bgit\s+(checkout|reset|clean|restore|apply|commit|push|stash|mv|rm)\b/;

/** File-writing APIs inside inline scripts (node -e "..."); tested on the full command, quotes included. */
const SCRIPT_WRITE_PATTERN = /writeFile|appendFile|createWriteStream|unlink|rmSync|mkdirSync|copyFile|renameSync/;

/** Removes quoted strings and redirections that never write project files (2>&1, >/dev/null, 2>/dev/null). */
function stripForShellWriteCheck(command: string): string {
	return command
		.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''")
		.replace(/\d*>&\d+/g, " ")
		.replace(/\d*>>?\s*\/dev\/(null|stdout|stderr)\b/g, " ");
}

/** Removes here-document bodies (lines between `<<EOF` and the closing `EOF`); here-strings `<<<` are kept. */
function stripHeredocBodies(command: string): string {
	const out: string[] = [];
	let terminator: string | undefined;
	for (const line of command.split("\n")) {
		if (terminator !== undefined) {
			if (line.trim() === terminator) {
				terminator = undefined;
				out.push(line);
			}
			continue;
		}
		out.push(line);
		const match = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
		if (match) {
			terminator = match[2];
		}
	}
	return out.join("\n");
}

/** True when the command may create, change or delete files. */
function bashMayWrite(command: string): boolean {
	return BASH_SHELL_WRITE_PATTERN.test(stripForShellWriteCheck(command)) || SCRIPT_WRITE_PATTERN.test(command);
}

/** Shell-level deletions, overwriting moves and git state changes; tested like writes (quotes and heredoc bodies removed). */
const BASH_SHELL_DESTRUCTIVE_PATTERN =
	/(^|[\s;&|(`])(rm|rmdir|unlink|mv|truncate|shred|dd|rsync)(\s|$)|\bfind\b[^\n;|&]*\s-delete\b|\bgit\s+(checkout|clean|reset|restore|stash|commit|push|pull|rm|mv|add|merge|rebase|apply|cherry-pick|revert|switch|branch|tag)\b/;

/** File-deleting APIs inside inline scripts; tested on the full command. */
const SCRIPT_DESTRUCTIVE_PATTERN = /\b(unlinkSync|rmSync|rmdirSync|unlink|rmdir|rm)\s*\(|\brenameSync\s*\(/;

/** True when the command may delete or overwrite files by moving them, or change git state. */
function bashMayDestroy(command: string): boolean {
	return (
		BASH_SHELL_DESTRUCTIVE_PATTERN.test(stripForShellWriteCheck(stripHeredocBodies(command))) ||
		SCRIPT_DESTRUCTIVE_PATTERN.test(command)
	);
}

/**
 * Tool calls that run without asking the user once the sandbox hook has allowed them:
 * reads, and file changes (which the sandbox keeps inside Pkg) except deletions,
 * overwriting moves, git state changes and risky programs.
 */
export function isAutoApprovedToolCall(toolName: string, input: Record<string, unknown>): boolean {
	// Bash commands need special handling: check for destructive/risky operations BEFORE
	// isReadOnlyToolCall, which doesn't know about -delete or git state changes.
	if (toolName === "Bash") {
		const command = String(input.command ?? "");
		return command.trim() !== "" && !bashMayDestroy(command) && !BASH_RISKY_PATTERN.test(command);
	}
	if (isReadOnlyToolCall(toolName, input)) {
		return true;
	}
	if (WRITE_PATH_KEYS[toolName]) {
		return true;
	}
	return false;
}

/** Path-like tokens in a shell command: absolute, home-relative or parent-relative. */
const BASH_PATH_TOKEN = /(?:^|[\s'"`=:(,;|&<>])((?:~\/|\/|\.\.)[^\s'"`;|&<>(),]*)/g;

/** Environment variables that expand to directories outside the project (PWD excluded: handled separately). */
const BASH_ENV_PATH = /\$\{?(HOME|OLDPWD|TMPDIR|USER)\b/;

/** Commands that may have side effects beyond the file checks (network, package managers, processes, other interpreters) — always ask the user. */
const BASH_RISKY_PATTERN =
	/(^|[\s;&|(`$])(curl|wget|npm|npx|yarn|pnpm|pip|pip3|python|python3|ruby|php|sudo|su|kill|pkill|killall|open|osascript|ssh|scp|sftp|nc|psql|mysql|sqlite3|docker|kubectl|brew|launchctl|crontab|eval|exec|source|bash|sh|zsh)(\s|$)/;

/** `cd <dir>` at the start of a command part (after a newline, ;, &, | or "("). */
const BASH_CD = /(?:^|[\n;&|(])\s*cd(?:\s+("[^"]*"|'[^']*'|[^\s;&|)]+))?(?=\s*(?:$|[\n;&|)]))/g;

interface CdBase {
	index: number;
	dir: string;
	raw: string;
}

function realpathOfExistingPrefix(p: string): string {
	let current = p;
	const rest: string[] = [];
	while (!fs.existsSync(current)) {
		const parent = path.dirname(current);
		if (parent === current) {
			return p;
		}
		rest.unshift(path.basename(current));
		current = parent;
	}
	try {
		return path.join(fs.realpathSync(current), ...rest);
	} catch {
		return p;
	}
}

/** Resolves `~`, relative segments and symlinks of the existing part of the path. */
export function resolveSandboxPath(rawPath: string, cwd: string): string {
	let p = rawPath;
	if (p === "~" || p.startsWith("~/")) {
		p = path.join(os.homedir(), p.slice(1));
	}
	return realpathOfExistingPrefix(path.resolve(cwd, p));
}

export function isInsideRoots(absolutePath: string, roots: string[]): boolean {
	const normalizedPath = realpathOfExistingPrefix(path.resolve(absolutePath));
	return roots.some((root) => {
		const r = realpathOfExistingPrefix(path.resolve(root));
		return normalizedPath === r || normalizedPath.startsWith(r + path.sep);
	});
}

/** Static part of a glob pattern, before the first wildcard. */
function staticPrefix(pattern: string): string {
	const index = pattern.search(/[*?[{]/);
	return index === -1 ? pattern : pattern.slice(0, index);
}

function deny(reason: string): SandboxDecision {
	return { allowed: false, reason };
}

/** Directories the command switches to with cd, in order; `index` — where the new directory starts to apply. */
function cdBases(command: string, cwd: string): CdBase[] | SandboxDecision {
	const bases: CdBase[] = [];
	let current = cwd;

	for (const m of command.matchAll(BASH_CD)) {
		let raw = (m[1] ?? "").replace(/^["']|["']$/g, "");

		if (raw === "" || raw === "-" || raw.startsWith("$")) {
			return deny("Команда переходит в папку, которую нельзя проверить (cd без пути, cd -, cd $…) — укажи путь внутри проекта явно");
		}

		current = resolveSandboxPath(raw, current);
		bases.push({
			index: m.index + m[0].length,
			dir: current,
			raw
		});
	}

	return bases;
}

/** Directory a command part at `index` runs in: the last cd before it, else cwd. */
function baseAt(bases: CdBase[], index: number, cwd: string): string {
	for (let i = bases.length - 1; i >= 0; i--) {
		if (bases[i].index <= index) {
			return bases[i].dir;
		}
	}
	return cwd;
}

/** Checks a shell command heuristically: every path it mentions must be inside the project; writing commands may touch only Pkg. */
export function checkBashCommand(command: string, cwd: string, policy: SandboxPolicy): SandboxDecision {
	if (BASH_ENV_PATH.test(command)) {
		return deny("Команда использует переменные окружения с путями ($HOME и т.п.) — укажи путь внутри проекта явно");
	}
	if (/(^|[\s;&|(])~(?=$|[\s;&|)])/.test(stripHeredocBodies(command).replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''"))) {
		return deny("Команда обращается к домашней папке (~) — укажи путь внутри проекта явно");
	}

	const bases = cdBases(command, cwd);
	if (!Array.isArray(bases)) {
		return bases;
	}

	for (const base of bases) {
		if (!isInsideRoots(base.dir, policy.readRoots)) {
			return deny(`Команда переходит в папку вне проекта: ${base.raw}`);
		}
	}

	for (const m of command.matchAll(/\$\{?PWD\}?([^\s'"\`;|&<>(),]*)/g)) {
		const resolved = resolveSandboxPath("." + m[1], baseAt(bases, m.index, cwd));
		if (!isInsideRoots(resolved, policy.readRoots)) {
			return deny(`Команда обращается к пути вне проекта: ${m[0]}`);
		}
	}

	const writes = bashMayWrite(command);

	if (writes) {
		const startsWithCd = command.trimStart().startsWith("cd ");

		if (!startsWithCd) {
			if (!isInsideRoots(resolveSandboxPath(".", cwd), policy.writeRoots)) {
				return deny("Команды с записью можно выполнять только в каталоге Pkg проекта");
			}
		}

		for (const base of bases) {
			if (!isInsideRoots(base.dir, policy.writeRoots)) {
				return deny("Команды с записью можно выполнять только в каталоге Pkg проекта");
			}
		}

		for (const m of command.matchAll(/\$\{?PWD\}?([^\s'"\`;|&<>(),]*)/g)) {
			const resolved = resolveSandboxPath("." + m[1], baseAt(bases, m.index, cwd));
			if (!isInsideRoots(resolved, policy.writeRoots)) {
				return deny(`Команда с записью затрагивает путь вне Pkg: ${m[0]} — изменять можно только файлы в Pkg. Если этот путь только читается, выполни чтение отдельной командой, без записи в той же команде`);
			}
		}
	}

	for (const match of command.matchAll(BASH_PATH_TOKEN)) {
		const token = match[1];
		if (ALWAYS_ALLOWED.has(token)) {
			continue;
		}
		if (token.startsWith("/")) {
			const firstSegment = token.split("/")[1];
			if (!firstSegment || !fs.existsSync("/" + firstSegment)) {
				continue; // not a filesystem path (regex, URL path and the like)
			}
		}
		const resolved = resolveSandboxPath(token, baseAt(bases, match.index ?? 0, cwd));
		if (!isInsideRoots(resolved, policy.readRoots)) {
			return deny(`Команда обращается к пути вне проекта: ${token}`);
		}
		if (writes && !isInsideRoots(resolved, policy.writeRoots)) {
			return deny(`Команда с записью затрагивает путь вне Pkg: ${token} — изменять можно только файлы в Pkg. Если этот путь только читается, выполни чтение отдельной командой, без записи в той же команде`);
		}
	}

	return { allowed: true };
}

/** Decides whether a tool call may run under the policy. Tools without file paths are allowed. */
export function checkToolAccess(
	toolName: string,
	input: Record<string, unknown>,
	cwd: string,
	policy: SandboxPolicy
): SandboxDecision {
	const readKeys = READ_PATH_KEYS[toolName];
	const writeKeys = WRITE_PATH_KEYS[toolName];
	if (readKeys || writeKeys) {
		const keys = readKeys ?? writeKeys;
		const roots = readKeys ? policy.readRoots : policy.writeRoots;
		for (const key of keys) {
			const value = input[key];
			if (typeof value !== "string" || value === "") {
				continue;
			}
			let raw = value;
			if (key === "pattern") {
				raw = staticPrefix(value);
				if (!(raw.startsWith("/") || raw.startsWith("~") || raw.includes(".."))) {
					continue;
				}
			}
			const resolved = resolveSandboxPath(raw === "" ? "." : raw, cwd);
			if (!isInsideRoots(resolved, roots)) {
				return deny(
					readKeys
						? `Чтение вне папки проекта запрещено: ${value}`
						: `Запись разрешена только в каталог Pkg проекта: ${value}`
				);
			}
		}
		return { allowed: true };
	}
	if (toolName === "Bash") {
		return checkBashCommand(String(input.command ?? ""), cwd, policy);
	}
	return { allowed: true };
}

/**
 * True for tool calls that only read: such calls are auto-approved (the
 * PreToolUse hook has already rejected paths outside the project). Writing
 * tools, shell commands that may write and risky commands still require the
 * user's approval.
 */
export function isReadOnlyToolCall(toolName: string, input: Record<string, unknown>): boolean {
	if (READ_PATH_KEYS[toolName]) {
		return true;
	}
	if (toolName === "Bash") {
		const command = String(input.command ?? "");
		return command.trim() !== "" && !bashMayWrite(command) && !bashMayDestroy(command) && !BASH_RISKY_PATTERN.test(command);
	}
	return false;
}
