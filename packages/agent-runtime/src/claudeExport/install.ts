import * as fs from "fs";
import * as path from "path";
import { ExportSources, fileSha256, textSha256 } from "./sources";
import { isInsideRoots } from "../safety/sandboxGuard";

/** First line of a root file (AGENTS.md or CLAUDE.md) that the app wrote itself. */
const MARKER = "<!-- bpmsoft-agent: generated -->";

/** Root file with the core rules; Cursor reads it. */
const AGENTS_MD = "AGENTS.md";

/** Root file read by Claude Code; it imports AGENTS.md or the separate core. */
const CLAUDE_MD = "CLAUDE.md";

/** Line appended to a foreign AGENTS.md so that Cursor reads the separate core. */
const AGENTS_READ_LINE = "Перед работой прочитай правила BPMSoft-агента: .claude/bpmsoft-agent.md";

/** Import line that connects the separate core file to a foreign CLAUDE.md. */
const IMPORT_LINE = "@.claude/bpmsoft-agent.md";

/** Core file location when the root files are not replaced. */
const SEPARATE_CORE_REL = ".claude/bpmsoft-agent.md";

/** Manifest location, relative to the stand root. */
const MANIFEST_REL = ".claude/skills/.bpmsoft-agent.json";

/** Claude Code settings with the CRM variables for the crm.js CLI, relative to the stand root. */
const SETTINGS_REL = ".claude/settings.local.json";

/** How the app treats a foreign root file: keep it and connect the separate core, or replace it. */
export type ClaudeMdChoice = "separate" | "replace";

/** Installation state read from the manifest. */
export type ClaudeSkillsStatus =
	| { state: "not-installed" }
	| { state: "installed"; installedAt: string; appVersion: string }
	| { state: "outdated"; installedAt: string; appVersion: string };

/** CRM connection written into .claude/settings.local.json for the Claude Code CLI. */
export interface CrmEnvConnection {
	url: string;
	user: string;
	password: string;
}

/** Result of an installation attempt; nothing is written unless the kind is "installed". */
export type InstallOutcome =
	| { kind: "installed"; written: number; removed: number; target: string; crmEnv: "written" | "skipped" | "invalid-settings" }
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

/** A file the install writes: a copy of a source file, or generated text. */
type OutputFile = { rel: string; source: string } | { rel: string; content: string };

/** Converts a "/"-separated rel path to a path under the stand root. */
function toDisk(appRoot: string, rel: string): string {
	return path.join(appRoot, ...rel.split("/"));
}

/** Throws when a path the export touches resolves outside the stand root (a symlinked .claude, root file or file). */
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

/** Returns true when a root file exists in the stand and was not written by the app. */
function isForeign(appRoot: string, rel: string): boolean {
	const file = toDisk(appRoot, rel);
	return fs.existsSync(file) && !hasMarker(file);
}

/** Returns the sha256 of a file the install writes: its source copy, or its generated text. */
function outputHash(file: OutputFile): string {
	return "content" in file ? textSha256(file.content) : fileSha256(file.source);
}

/** Returns the CLAUDE.md stub that imports the given root file and carries the app marker. */
function claudeStub(target: string): string {
	return `${MARKER}\n@${target}\n`;
}

/** Returns true when a manifest key may be touched: a root file, or a plain path under .claude/ without ".." or "\\". */
function isSafeManifestKey(rel: string): boolean {
	if (rel === CLAUDE_MD || rel === AGENTS_MD) {
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
 * Returns the export files that exist on disk and differ from both the new output and (when a manifest exists)
 * the manifest hash, sorted. Without a manifest, every export file that differs from its output counts.
 */
function modifiedFiles(appRoot: string, old: Manifest | undefined, newHashes: Map<string, string>): string[] {
	const candidates = old ? Object.keys(old.files) : [...newHashes.keys()];
	return candidates
		.filter((rel) => {
			const dest = toDisk(appRoot, rel);
			if ((rel === CLAUDE_MD || rel === AGENTS_MD) && !hasMarker(dest)) {
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

/** Appends a line to a foreign root file once, keeping its line endings. */
function addImport(file: string, line: string): void {
	const text = fs.readFileSync(file, "utf8");
	if (text.split(/\r?\n/).some((existing) => existing.trim() === line)) {
		return;
	}
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lead = text.length > 0 && !text.endsWith("\n") ? eol : "";
	fs.appendFileSync(file, lead + line + eol);
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
		if ((rel === CLAUDE_MD || rel === AGENTS_MD) && !hasMarker(dest)) {
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

/**
 * Sets the CRM variables in env of .claude/settings.local.json, keeping other keys and env entries.
 * A file that is not a JSON object (or whose env is not an object) is left untouched and reported as invalid.
 */
function writeCrmEnv(appRoot: string, crm: CrmEnvConnection): "written" | "invalid-settings" {
	const dest = toDisk(appRoot, SETTINGS_REL);
	assertInsideStand(appRoot, dest);
	let settings: Record<string, unknown> = {};
	if (fs.existsSync(dest)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(fs.readFileSync(dest, "utf8").replace(/^\uFEFF/, ""));
		} catch {
			return "invalid-settings";
		}
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return "invalid-settings";
		}
		settings = parsed as Record<string, unknown>;
	}
	if (settings.env !== undefined && (typeof settings.env !== "object" || settings.env === null || Array.isArray(settings.env))) {
		return "invalid-settings";
	}
	const env = (settings.env ?? {}) as Record<string, unknown>;
	settings.env = { ...env, BPMSOFT_CRM_URL: crm.url, BPMSOFT_CRM_USER: crm.user, BPMSOFT_CRM_PASSWORD: crm.password };
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, JSON.stringify(settings, null, 2) + "\n");
	return "written";
}

/**
 * Installs the skills, knowledge, lint bundle and core rules into the stand, and updates the manifest.
 * Root mode writes AGENTS.md (core) and a CLAUDE.md stub that imports it. Separate mode keeps foreign root files
 * and connects them to the core in .claude/bpmsoft-agent.md.
 */
export function installClaudeSkills(
	appRoot: string,
	sources: ExportSources,
	options: { appVersion: string; claudeMd?: ClaudeMdChoice; overwriteModified?: boolean; now?: () => Date; crm?: CrmEnvConnection },
): InstallOutcome {
	const old = readManifest(appRoot);
	const agentsForeign = isForeign(appRoot, AGENTS_MD);
	const claudeForeign = isForeign(appRoot, CLAUDE_MD);

	let mode: "root" | "separate";
	if (!agentsForeign && !claudeForeign) {
		mode = "root";
	} else if (old?.claudeMd === "separate") {
		mode = "separate";
	} else if (options.claudeMd) {
		mode = options.claudeMd === "separate" ? "separate" : "root";
	} else {
		return { kind: "needs-claude-md-choice" };
	}

	const written: OutputFile[] = [...sources.files];
	const appended: Array<{ rel: string; line: string }> = [];
	if (mode === "root") {
		written.push({ rel: AGENTS_MD, source: sources.core }, { rel: CLAUDE_MD, content: claudeStub(AGENTS_MD) });
	} else {
		if (agentsForeign) {
			appended.push({ rel: AGENTS_MD, line: AGENTS_READ_LINE });
		} else {
			written.push({ rel: AGENTS_MD, source: sources.core });
		}
		if (claudeForeign) {
			appended.push({ rel: CLAUDE_MD, line: IMPORT_LINE });
		} else {
			written.push({ rel: CLAUDE_MD, content: claudeStub(agentsForeign ? SEPARATE_CORE_REL : AGENTS_MD) });
		}
		if (agentsForeign || claudeForeign) {
			written.push({ rel: SEPARATE_CORE_REL, source: sources.core });
		}
	}
	written.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

	const newHashes = new Map(written.map((file) => [file.rel, outputHash(file)] as const));
	const modified = modifiedFiles(appRoot, old, newHashes);
	if (modified.length > 0 && !options.overwriteModified) {
		return { kind: "needs-overwrite-confirm", modified };
	}

	const newRels = new Set(written.map((file) => file.rel));
	const touched = [
		...written.map((file) => toDisk(appRoot, file.rel)),
		...appended.map((item) => toDisk(appRoot, item.rel)),
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
	for (const file of written) {
		const dest = toDisk(appRoot, file.rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		if ("content" in file) {
			fs.writeFileSync(dest, file.content);
		} else {
			fs.copyFileSync(file.source, dest);
		}
		files[file.rel] = outputHash(file);
	}
	for (const item of appended) {
		addImport(toDisk(appRoot, item.rel), item.line);
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

	const crmEnv = options.crm ? writeCrmEnv(appRoot, options.crm) : "skipped";

	return { kind: "installed", written: written.length, removed, target: path.join(appRoot, ".claude"), crmEnv };
}
