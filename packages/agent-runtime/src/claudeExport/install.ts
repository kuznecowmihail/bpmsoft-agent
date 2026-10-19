import * as fs from "fs";
import * as path from "path";
import { ExportFile, ExportSources, fileSha256 } from "./sources";
import { isInsideRoots } from "../safety/sandboxGuard";

/** First line of a CLAUDE.md that the app wrote itself. */
const MARKER = "<!-- bpmsoft-agent: generated -->";

/** Import line that connects the separate core file to a foreign CLAUDE.md. */
const IMPORT_LINE = "@.claude/bpmsoft-agent.md";

/** Core file location when CLAUDE.md is not replaced. */
const SEPARATE_CORE_REL = ".claude/bpmsoft-agent.md";

/** Manifest location, relative to the stand root. */
const MANIFEST_REL = ".claude/skills/.bpmsoft-agent.json";

/** How the app treats a foreign CLAUDE.md: keep it and import the core, or replace it. */
export type ClaudeMdChoice = "separate" | "replace";

/** Installation state read from the manifest. */
export type ClaudeSkillsStatus =
	| { state: "not-installed" }
	| { state: "installed"; installedAt: string; appVersion: string }
	| { state: "outdated"; installedAt: string; appVersion: string };

/** Result of an installation attempt; nothing is written unless the kind is "installed". */
export type InstallOutcome =
	| { kind: "installed"; written: number; removed: number; target: string }
	| { kind: "needs-claude-md-choice" }
	| { kind: "needs-overwrite-confirm"; modified: string[] };

/** Manifest stored at .claude/skills/.bpmsoft-agent.json. */
interface Manifest {
	appVersion: string;
	installedAt: string;
	hash: string;
	claudeMd: "root" | "separate";
	files: Record<string, string>;
}

/** Converts a "/"-separated rel path to a path under the stand root. */
function toDisk(appRoot: string, rel: string): string {
	return path.join(appRoot, ...rel.split("/"));
}

/** Throws when a path the export touches resolves outside the stand root (a symlinked .claude, CLAUDE.md or file). */
function assertInsideStand(appRoot: string, dest: string): void {
	if (!isInsideRoots(dest, [appRoot])) {
		throw new Error(`Путь выходит за пределы папки проекта: ${dest}`);
	}
}

/** Returns true when the first line of the file, without BOM and trailing CR, is the app marker. */
function hasMarker(file: string): boolean {
	if (!fs.existsSync(file)) {
		return false;
	}
	const firstLine = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split("\n")[0].replace(/\r$/, "");
	return firstLine === MARKER;
}

/** Returns true when a manifest key may be touched: CLAUDE.md, or a plain path under .claude/ without ".." or "\\". */
function isSafeManifestKey(rel: string): boolean {
	if (rel === "CLAUDE.md") {
		return true;
	}
	return (
		rel.startsWith(".claude/") &&
		!rel.includes("\\") &&
		!path.posix.isAbsolute(rel) &&
		!rel.split("/").includes("..")
	);
}

/** Reads the manifest, or returns undefined when it is absent or corrupt. Unsafe file keys are dropped. */
function readManifest(appRoot: string): Manifest | undefined {
	try {
		const data = JSON.parse(fs.readFileSync(toDisk(appRoot, MANIFEST_REL), "utf8").replace(/^\uFEFF/, ""));
		const valid =
			typeof data?.hash === "string" &&
			typeof data.installedAt === "string" &&
			typeof data.appVersion === "string" &&
			(data.claudeMd === "root" || data.claudeMd === "separate") &&
			typeof data.files === "object" &&
			data.files !== null;
		if (!valid) {
			return undefined;
		}
		const files = Object.fromEntries(
			Object.entries(data.files as Record<string, string>).filter(([rel]) => isSafeManifestKey(rel)),
		);
		return { ...(data as Manifest), files };
	} catch {
		return undefined;
	}
}

/**
 * Returns the export files that exist on disk and differ from both the new source and (when a manifest exists)
 * the manifest hash, sorted. Without a manifest, every export file that differs from its source counts.
 */
function modifiedFiles(appRoot: string, old: Manifest | undefined, newHashes: Map<string, string>): string[] {
	const candidates = old ? Object.keys(old.files) : [...newHashes.keys()];
	return candidates
		.filter((rel) => {
			const dest = toDisk(appRoot, rel);
			if (rel === "CLAUDE.md" && !hasMarker(dest)) {
				return false;
			}
			if (!fs.existsSync(dest)) {
				return false;
			}
			const disk = fileSha256(dest);
			if (disk === newHashes.get(rel)) {
				return false;
			}
			return old ? disk !== old.files[rel] : true;
		})
		.sort();
}

/** Appends the import line to a foreign CLAUDE.md once, keeping its line endings. */
function addImport(file: string): void {
	const text = fs.readFileSync(file, "utf8");
	if (text.split(/\r?\n/).some((line) => line.trim() === IMPORT_LINE)) {
		return;
	}
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lead = text.length > 0 && !text.endsWith("\n") ? eol : "";
	fs.appendFileSync(file, lead + IMPORT_LINE + eol);
}

/** Deletes files from the old manifest that the new export no longer contains, and empty folders under .claude/skills. */
function removeStale(appRoot: string, old: Manifest | undefined, keep: Set<string>): number {
	if (!old) {
		return 0;
	}
	const skillsRoot = path.join(appRoot, ".claude", "skills");
	let removed = 0;
	for (const rel of Object.keys(old.files)) {
		if (keep.has(rel)) {
			continue;
		}
		const dest = toDisk(appRoot, rel);
		if (!fs.existsSync(dest)) {
			continue;
		}
		if (rel === "CLAUDE.md" && !hasMarker(dest)) {
			continue;
		}
		assertInsideStand(appRoot, dest);
		fs.unlinkSync(dest);
		removed++;
		let dir = path.dirname(dest);
		while (dir.startsWith(skillsRoot + path.sep) && fs.readdirSync(dir).length === 0) {
			fs.rmdirSync(dir);
			dir = path.dirname(dir);
		}
	}
	return removed;
}

/** Returns the installation state of the export in the stand, compared with the current sources. */
export function claudeSkillsStatus(appRoot: string, sources: ExportSources): ClaudeSkillsStatus {
	const old = readManifest(appRoot);
	if (!old) {
		return { state: "not-installed" };
	}
	const info = { installedAt: old.installedAt, appVersion: old.appVersion };
	return old.hash === sources.hash ? { state: "installed", ...info } : { state: "outdated", ...info };
}

/** Installs the skills, knowledge, lint bundle and CLAUDE.md core into the stand, and updates the manifest. */
export function installClaudeSkills(
	appRoot: string,
	sources: ExportSources,
	options: { appVersion: string; claudeMd?: ClaudeMdChoice; overwriteModified?: boolean; now?: () => Date },
): InstallOutcome {
	const old = readManifest(appRoot);
	const claudeMdPath = path.join(appRoot, "CLAUDE.md");

	let mode: "root" | "separate";
	if (!fs.existsSync(claudeMdPath) || hasMarker(claudeMdPath)) {
		mode = "root";
	} else if (old?.claudeMd === "separate") {
		mode = "separate";
	} else if (options.claudeMd) {
		mode = options.claudeMd === "separate" ? "separate" : "root";
	} else {
		return { kind: "needs-claude-md-choice" };
	}

	const coreRel = mode === "root" ? "CLAUDE.md" : SEPARATE_CORE_REL;
	const all: ExportFile[] = [...sources.files, { rel: coreRel, source: sources.core }].sort((a, b) =>
		a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0,
	);
	const newHashes = new Map(all.map((file) => [file.rel, fileSha256(file.source)] as const));

	const modified = modifiedFiles(appRoot, old, newHashes);
	if (modified.length > 0 && !options.overwriteModified) {
		return { kind: "needs-overwrite-confirm", modified };
	}

	const newRels = new Set(all.map((file) => file.rel));
	const touched = [
		...all.map((file) => toDisk(appRoot, file.rel)),
		...(mode === "separate" ? [claudeMdPath] : []),
		toDisk(appRoot, MANIFEST_REL),
		...Object.keys(old?.files ?? {})
			.filter((rel) => !newRels.has(rel))
			.map((rel) => toDisk(appRoot, rel))
			.filter((dest) => fs.existsSync(dest)),
	];
	for (const dest of touched) {
		assertInsideStand(appRoot, dest);
	}

	const files: Record<string, string> = {};
	for (const file of all) {
		const dest = toDisk(appRoot, file.rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(file.source, dest);
		files[file.rel] = fileSha256(file.source);
	}
	if (mode === "separate") {
		addImport(claudeMdPath);
	}

	const removed = removeStale(appRoot, old, newRels);

	const manifest: Manifest = {
		appVersion: options.appVersion,
		installedAt: (options.now ?? (() => new Date()))().toISOString(),
		hash: sources.hash,
		claudeMd: mode,
		files,
	};
	const manifestPath = toDisk(appRoot, MANIFEST_REL);
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

	return { kind: "installed", written: all.length, removed, target: path.join(appRoot, ".claude") };
}
