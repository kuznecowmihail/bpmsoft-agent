import * as fs from "fs";
import * as path from "path";
import { lintSchemas } from "./pkgLint";
import { listChangedFiles, schemaDirsOf, sqlScriptDirsOf } from "./changedFiles";
import { findPkgGitRepos } from "./pkgGitRepos";
import type { PkgGitLayout } from "./pkgGitRepos";

/** Usage text printed by the standalone pkg-lint.js bundle. */
const USAGE = [
	"Использование: pkg-lint.js [--knowledge <папка знаний>] [--git <папка Pkg>] [--since <мс>] <путь>...",
	"  <путь> — папка схемы (с descriptor.json), папка SqlScripts/<скрипт>, папка набора данных Data/<набор> или папка пакета (с Schemas, SqlScripts или Data).",
	"  --git <папка Pkg> — проверить схемы, скрипты и наборы данных, которые git status показывает как изменённые или новые: в репозитории Pkg (или выше) и в репозиториях отдельных пакетов.",
	"  --since <мс> — вместе с --git: в пакетах вне git (и если git недоступен) проверить файлы, изменённые с этого момента (мс от 1970-01-01).",
	"  --knowledge <папка> — папка знаний с scripts/ (по умолчанию — папка bpm-knowledge рядом с бандлом).",
].join("\n");

/** Note prepended to the report when packages were checked by file modification time, not by git. */
const BY_TIME_NOTE = "pkg-lint.js: пакеты вне git проверены по времени изменения файлов.";

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

/**
 * Adds the folders found at a path: a package (all Schemas, SqlScripts and Data subfolders), a schema folder,
 * an SQL script folder or a data set folder. Returns false when the path is none of them.
 */
function addPath(target: string, schemaDirs: Set<string>, sqlDirs: Set<string>, dataDirs: Set<string>): boolean {
	const abs = path.resolve(target);
	if (isDir(path.join(abs, "Schemas")) || isDir(path.join(abs, "SqlScripts")) || isDir(path.join(abs, "Data"))) {
		for (const dir of subfolders(path.join(abs, "Schemas"))) {
			schemaDirs.add(dir);
		}
		for (const dir of subfolders(path.join(abs, "SqlScripts"))) {
			sqlDirs.add(dir);
		}
		for (const dir of subfolders(path.join(abs, "Data"))) {
			dataDirs.add(dir);
		}
		return true;
	}
	if (isFile(path.join(abs, "descriptor.json"))) {
		const parent = path.basename(path.dirname(abs));
		if (parent === "SqlScripts") {
			sqlDirs.add(abs);
		} else if (parent === "Data") {
			dataDirs.add(abs);
		} else {
			schemaDirs.add(abs);
		}
		return true;
	}
	return false;
}

/** Returns the data set folders (<pkg>/Data/<набор>) that contain the given changed files. */
function dataDirsOfChanged(pkgRoot: string, files: string[]): string[] {
	const dirs = new Set<string>();
	for (const file of files) {
		const parts = path.relative(pkgRoot, file).split(path.sep);
		const i = parts.indexOf("Data");
		if (i < 0 || parts.length < i + 3) {
			continue;
		}
		const dir = path.join(pkgRoot, ...parts.slice(0, i + 2));
		if (isDir(dir)) {
			dirs.add(dir);
		}
	}
	return [...dirs];
}

/** Runs the lint for CLI arguments and returns the exit code and report text; does not print or exit. */
export function runPkgLintCli(argv: string[], defaultKnowledgeDir: string): PkgLintCliResult {
	let knowledgeDir = defaultKnowledgeDir;
	let gitRoot: string | undefined;
	let sinceMs: number | undefined;
	const targets: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--knowledge" || arg === "--git" || arg === "--since") {
			const value = argv[i + 1];
			if (value === undefined) {
				return usage(`${arg}: нужно значение`);
			}
			i++;
			if (arg === "--knowledge") {
				knowledgeDir = path.resolve(value);
			} else if (arg === "--git") {
				gitRoot = path.resolve(value);
			} else {
				const ms = value.trim() === "" ? NaN : Number(value);
				if (!Number.isInteger(ms) || ms < 0) {
					return usage("--since: нужно число миллисекунд");
				}
				sinceMs = ms;
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
	const dataDirs = new Set<string>();
	const unrecognized = targets.filter((target) => !addPath(target, schemaDirs, sqlDirs, dataDirs));
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
	let byTime = false;
	if (gitRoot !== undefined) {
		const pkgRoot = path.resolve(gitRoot);
		let layout: PkgGitLayout | undefined;
		let gitError: unknown;
		try {
			layout = findPkgGitRepos(pkgRoot);
		} catch (e) {
			gitError = e;
		}
		if (layout !== undefined) {
			extraFiles = layout.repos.flatMap((repo) => repo.files);
			if (sinceMs !== undefined && layout.withoutGit.length > 0) {
				const outside = new Set(layout.withoutGit);
				extraFiles.push(...listChangedFiles(pkgRoot, sinceMs).filter((file) => outside.has(path.relative(pkgRoot, file).split(path.sep)[0])));
				byTime = true;
			} else if (layout.repos.length === 0) {
				return {
					code: 2,
					text: "pkg-lint.js: ни папка Pkg, ни пакеты в ней не в git — изменённые схемы не найти; передай папки схем или пакета.",
				};
			}
		} else if (sinceMs !== undefined) {
			extraFiles = listChangedFiles(pkgRoot, sinceMs);
			byTime = true;
		} else {
			return { code: 2, text: `pkg-lint.js: не удалось прочитать git: ${errorMessage(gitError)}` };
		}
		extraFiles = [...new Set(extraFiles)].sort();
		for (const dir of schemaDirsOf(pkgRoot, extraFiles)) {
			schemaDirs.add(dir);
		}
		for (const dir of sqlScriptDirsOf(pkgRoot, extraFiles)) {
			sqlDirs.add(dir);
		}
		for (const dir of dataDirsOfChanged(pkgRoot, extraFiles)) {
			dataDirs.add(dir);
		}
	}
	/** Prepends the by-time note to the report when packages were checked by modification time. */
	const withNote = (text: string): string => (byTime ? `${BY_TIME_NOTE}\n${text}` : text);
	if (schemaDirs.size === 0 && sqlDirs.size === 0 && dataDirs.size === 0) {
		if (gitRoot !== undefined && targets.length === 0) {
			return { code: 0, text: withNote("pkg-lint.js: изменённых схем нет.") };
		}
		return { code: 0, text: withNote("pkg-lint.js: в указанных папках нет схем, наборов данных и SQL-скриптов.") };
	}
	const dataList = [...dataDirs].sort();
	const report = lintSchemas([...schemaDirs].sort(), {
		knowledgeDir,
		// JSON files of data sets are checked by the data set lint; passing them here would report them twice.
		extraFiles: extraFiles.filter((file) => !dataList.some((dir) => file.startsWith(dir + path.sep))),
		sqlScriptDirs: [...sqlDirs].sort(),
		dataDirs: dataList,
		title: "pkg-lint.js",
	});
	return { code: report.ok ? 0 : 1, text: withNote(report.text) };
}
