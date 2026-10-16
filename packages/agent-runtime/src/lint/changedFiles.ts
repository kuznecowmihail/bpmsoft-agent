import * as fs from "fs";
import * as path from "path";

/** Package subfolders that hold schema-related files. */
const WALKED_FOLDERS = ["Schemas", "Resources", "Data", "SqlScripts"];

/** Returns true for folders that must not be walked (node_modules and hidden folders). */
function isSkippedDir(name: string): boolean {
	return name === "node_modules" || name.startsWith(".");
}

/** Returns true when the path is an existing regular file modified at or after sinceMs. */
function isChangedFile(file: string, sinceMs: number): boolean {
	try {
		const stat = fs.statSync(file);
		return stat.isFile() && stat.mtimeMs >= sinceMs;
	} catch {
		return false;
	}
}

/** Returns true when the path is an existing directory. */
function isDirectory(dir: string): boolean {
	try {
		return fs.statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

/** Recursively collects changed files under dir, skipping hidden and node_modules folders. */
function collectChanged(dir: string, sinceMs: number, out: string[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!isSkippedDir(entry.name)) {
				collectChanged(full, sinceMs, out);
			}
			continue;
		}
		if (isChangedFile(full, sinceMs)) {
			out.push(full);
		}
	}
}

/** Returns absolute paths of files under Pkg packages whose mtime is at or after sinceMs, sorted. */
export function listChangedFiles(pkgRoot: string, sinceMs: number): string[] {
	const out: string[] = [];
	let packages: fs.Dirent[];
	try {
		packages = fs.readdirSync(pkgRoot, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const pkg of packages) {
		if (pkg.name.startsWith(".")) {
			continue;
		}
		const pkgDir = path.join(pkgRoot, pkg.name);
		const descriptor = path.join(pkgDir, "descriptor.json");
		if (isChangedFile(descriptor, sinceMs)) {
			out.push(descriptor);
		}
		for (const folder of WALKED_FOLDERS) {
			const folderDir = path.join(pkgDir, folder);
			if (isDirectory(folderDir)) {
				collectChanged(folderDir, sinceMs, out);
			}
		}
	}
	return out.sort();
}

/** Splits a changed file path into [package, folder, name, ...] segments relative to pkgRoot. */
function splitSegments(pkgRoot: string, file: string): string[] {
	return path.relative(pkgRoot, file).split(path.sep);
}

/** Removes the trailing ".<Category>" part of a resource folder name. */
function stripCategory(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

/** Returns the names of schemas (Schemas, Data, SqlScripts, Resources) that have changed files since sinceMs. */
export function changedSchemaNames(pkgRoot: string, sinceMs: number): Set<string> {
	const names = new Set<string>();
	for (const file of listChangedFiles(pkgRoot, sinceMs)) {
		const segments = splitSegments(pkgRoot, file);
		if (segments.length < 4) {
			continue;
		}
		const [, folder, name] = segments;
		if (folder === "Schemas" || folder === "Data" || folder === "SqlScripts") {
			names.add(name);
		} else if (folder === "Resources") {
			names.add(stripCategory(name));
		}
	}
	return names;
}

/** Returns sorted unique SqlScripts/<name> directories that contain changed files since sinceMs. */
export function changedSqlScriptDirs(pkgRoot: string, sinceMs: number): string[] {
	const dirs = new Set<string>();
	for (const file of listChangedFiles(pkgRoot, sinceMs)) {
		const segments = splitSegments(pkgRoot, file);
		if (segments.length < 4) {
			continue;
		}
		const [pkg, folder, name] = segments;
		if (folder !== "SqlScripts") {
			continue;
		}
		const scriptDir = path.join(pkgRoot, pkg, "SqlScripts", name);
		if (isDirectory(scriptDir)) {
			dirs.add(scriptDir);
		}
	}
	return [...dirs].sort();
}

/** Returns sorted unique Schemas/<name> directories that contain changed files since sinceMs. */
export function changedSchemaDirs(pkgRoot: string, sinceMs: number): string[] {
	const dirs = new Set<string>();
	for (const file of listChangedFiles(pkgRoot, sinceMs)) {
		const segments = splitSegments(pkgRoot, file);
		if (segments.length < 4) {
			continue;
		}
		const [pkg, folder, name] = segments;
		if (folder !== "Schemas" && folder !== "Resources") {
			continue;
		}
		const schemaName = folder === "Resources" ? stripCategory(name) : name;
		const schemaDir = path.join(pkgRoot, pkg, "Schemas", schemaName);
		if (isDirectory(schemaDir)) {
			dirs.add(schemaDir);
		}
	}
	return [...dirs].sort();
}
