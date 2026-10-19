import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { lintSchemas } from "./pkgLint";
import { schemaDirsOf, sqlScriptDirsOf } from "./changedFiles";

/** Usage text printed by the standalone pkg-lint.js bundle. */
const USAGE = [
	"Использование: pkg-lint.js [--knowledge <папка знаний>] [--git <папка Pkg>] <путь>...",
	"  <путь> — папка схемы (с descriptor.json), папка SqlScripts/<скрипт> или папка пакета (с Schemas или SqlScripts).",
	"  --git <папка Pkg> — проверить схемы и скрипты, которые git status показывает как изменённые или новые.",
	"  --knowledge <папка> — папка знаний с scripts/ (по умолчанию — папка bpm-knowledge рядом с бандлом).",
].join("\n");

/** Result of the CLI run: exit code and text for stdout. */
export interface PkgLintCliResult {
	code: 0 | 1 | 2;
	text: string;
}

/** Returns the usage result, with an optional error line before the usage text. */
function usage(message?: string): PkgLintCliResult {
	return { code: 2, text: message ? `${message}\n${USAGE}` : USAGE };
}

/** Returns the message of an unknown thrown value. */
function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** Returns true when the path is an existing directory. */
function isDir(dir: string): boolean {
	try {
		return fs.statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

/** Returns true when the path is an existing file. */
function isFile(file: string): boolean {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

/** Returns the sorted subfolders of a folder, or an empty list when it does not exist. */
function subfolders(dir: string): string[] {
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => path.join(dir, entry.name))
			.sort();
	} catch {
		return [];
	}
}

/** Adds the folders found at a path: a package (all Schemas and SqlScripts subfolders), a schema folder or an SQL script folder. Returns false when the path is none of them. */
function addPath(target: string, schemaDirs: Set<string>, sqlDirs: Set<string>): boolean {
	const abs = path.resolve(target);
	if (isDir(path.join(abs, "Schemas")) || isDir(path.join(abs, "SqlScripts"))) {
		for (const dir of subfolders(path.join(abs, "Schemas"))) {
			schemaDirs.add(dir);
		}
		for (const dir of subfolders(path.join(abs, "SqlScripts"))) {
			sqlDirs.add(dir);
		}
		return true;
	}
	if (isFile(path.join(abs, "descriptor.json"))) {
		const isSql = path.basename(path.dirname(abs)) === "SqlScripts";
		(isSql ? sqlDirs : schemaDirs).add(abs);
		return true;
	}
	return false;
}

/** Returns absolute paths of files under pkgRoot that git status lists as changed or new; git runs without a shell. */
function gitChangedFiles(pkgRoot: string): string[] {
	const top = execFileSync("git", ["-C", pkgRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
	// -z: paths are not quoted, and a rename or copy is followed by its source path, which is skipped.
	const status = execFileSync("git", ["-C", pkgRoot, "status", "--porcelain", "-z", "--untracked-files=all"], {
		encoding: "utf8",
	});
	const entries = status.split("\0");
	const files: string[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.length < 4) {
			continue;
		}
		if (entry.slice(0, 2).includes("R") || entry.slice(0, 2).includes("C")) {
			i++;
		}
		const file = path.join(top, ...entry.slice(3).split("/"));
		if (file.startsWith(pkgRoot + path.sep)) {
			files.push(file);
		}
	}
	return files;
}

/** Runs the lint for CLI arguments and returns the exit code and report text; does not print or exit. */
export function runPkgLintCli(argv: string[], defaultKnowledgeDir: string): PkgLintCliResult {
	let knowledgeDir = defaultKnowledgeDir;
	let gitRoot: string | undefined;
	const targets: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--knowledge" || arg === "--git") {
			const value = argv[i + 1];
			if (value === undefined) {
				return usage(`${arg}: нужно значение`);
			}
			i++;
			if (arg === "--knowledge") {
				knowledgeDir = path.resolve(value);
			} else {
				gitRoot = path.resolve(value);
			}
		} else {
			targets.push(arg);
		}
	}
	if (targets.length === 0 && gitRoot === undefined) {
		return usage();
	}
	const schemaDirs = new Set<string>();
	const sqlDirs = new Set<string>();
	const unrecognized = targets.filter((target) => !addPath(target, schemaDirs, sqlDirs));
	if (unrecognized.length > 0) {
		return usage(
			unrecognized
				.map(
					(target) =>
						`pkg-lint.js: путь не распознан (нужна папка пакета, схемы, набора данных или SQL-скрипта): ${target}`,
				)
				.join("\n"),
		);
	}
	let extraFiles: string[] = [];
	if (gitRoot !== undefined) {
		try {
			const pkgRoot = fs.realpathSync(gitRoot);
			extraFiles = gitChangedFiles(pkgRoot);
			for (const dir of schemaDirsOf(pkgRoot, extraFiles)) {
				schemaDirs.add(dir);
			}
			for (const dir of sqlScriptDirsOf(pkgRoot, extraFiles)) {
				sqlDirs.add(dir);
			}
		} catch (e) {
			return { code: 2, text: `pkg-lint.js: не удалось прочитать git status: ${errorMessage(e)}` };
		}
		if (targets.length === 0 && schemaDirs.size === 0 && sqlDirs.size === 0) {
			return { code: 0, text: "pkg-lint.js: изменённых схем нет." };
		}
	}
	const report = lintSchemas([...schemaDirs].sort(), {
		knowledgeDir,
		extraFiles,
		sqlScriptDirs: [...sqlDirs].sort(),
	});
	return { code: report.ok ? 0 : 1, text: report.text };
}

if (require.main === module) {
	const result = runPkgLintCli(process.argv.slice(2), path.join(__dirname, ".."));
	process.stdout.write(result.text + "\n");
	process.exitCode = result.code;
}
