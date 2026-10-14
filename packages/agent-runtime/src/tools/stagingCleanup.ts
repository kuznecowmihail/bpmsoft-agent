import * as fs from "fs";
import * as path from "path";

/** Folder the Claude Agent SDK uses to stage atomic writes; it is left behind empty after the write. */
const STAGING_DIR = ".cc-writes";
const STAGING_PARENT = ".claude";
/** Depth of the sweep under a write root: <Пакет>/Schemas/<Схема>/ plus one level. */
const SWEEP_DEPTH = 4;
const SKIP_DIRS = new Set([".git", "node_modules", STAGING_PARENT]);

/** Removes `<dir>/.claude/.cc-writes` and then `<dir>/.claude`, both only when empty. Missing or non-empty folders are left alone. */
export function removeStagingDir(dir: string): void {
	const parent = path.join(dir, STAGING_PARENT);
	try {
		fs.rmdirSync(path.join(parent, STAGING_DIR));
	} catch {
		// missing or not empty
	}
	try {
		fs.rmdirSync(parent);
	} catch {
		// missing, not empty, or a real .claude folder of the project
	}
}

/** Directories under `root` (including it) down to `depth`, skipping .git, node_modules and .claude. */
function directoriesUnder(root: string, depth: number): string[] {
	const found = [root];
	if (depth <= 0) {
		return found;
	}
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(root, { withFileTypes: true });
	} catch {
		return found;
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
			continue;
		}
		found.push(...directoriesUnder(path.join(root, entry.name), depth - 1));
	}
	return found;
}

/**
 * Cleans the SDK's staging folders after a turn: the directories the agent wrote to
 * plus a shallow sweep of the write roots (shell commands change files we cannot see).
 */
export function cleanupStagingDirs(touchedDirs: Iterable<string>, writeRoots: Iterable<string> = []): void {
	const dirs = new Set<string>(touchedDirs);
	for (const root of writeRoots) {
		for (const dir of directoriesUnder(root, SWEEP_DEPTH)) {
			dirs.add(dir);
		}
	}
	for (const dir of dirs) {
		removeStagingDir(dir);
	}
}
