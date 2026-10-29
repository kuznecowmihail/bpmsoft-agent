import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

/** Git repository that holds packages of the Pkg folder, with its changed files. */
export interface PkgGitRepo {
	/** Repository top level as git prints it (path.resolve of `git rev-parse --show-toplevel`). */
	root: string;
	/** Folder git status ran in: the Pkg folder itself or a package folder with its own .git. */
	dir: string;
	/** Changed or new files of this repository under the Pkg folder, absolute paths built from pkgDir, sorted. */
	files: string[];
	/** Names of packages that have changed files, sorted. */
	packages: string[];
}

/** Git layout of the Pkg folder: repositories with packages, and packages outside any repository. */
export interface PkgGitLayout {
	repos: PkgGitRepo[];
	/** Package folders (names) that belong to no git repository, sorted. */
	withoutGit: string[];
}

/** Returns absolute paths of files under pkgDir that git status lists as changed or new. */
export function gitChangedFiles(pkgDir: string): string[] {
	const pkgRoot = path.resolve(pkgDir);
	// --show-prefix: the Pkg folder relative to the repository root, "/"-separated with a trailing slash; empty at the root.
	const prefix = execFileSync("git", ["-C", pkgRoot, "rev-parse", "--show-prefix"], { encoding: "utf8" }).replace(/\r?\n$/, "");
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
		const repoPath = entry.slice(3);
		if (!repoPath.startsWith(prefix)) {
			continue;
		}
		files.push(path.join(pkgRoot, ...repoPath.slice(prefix.length).split("/")));
	}
	return files;
}

/** Returns the top level of the git repository that holds the folder; throws when the folder is not in git. */
function repoRootOf(dir: string): string {
	const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	return path.resolve(out.replace(/\r?\n$/, ""));
}

/** Returns the sorted names of the non-hidden subfolders of a folder; empty when the folder is unreadable. */
function packageNames(pkgRoot: string): string[] {
	try {
		return fs
			.readdirSync(pkgRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
}

/**
 * Finds the git repositories of the packages in a Pkg folder. Pkg itself (or a folder above it) gives one repository
 * for all packages without their own .git; a package with its own .git is a separate repository, and its files are
 * left out of the outer one. Git runs without a shell. Packages outside any repository are listed in withoutGit.
 */
export function findPkgGitRepos(pkgDir: string): PkgGitLayout {
	const pkgRoot = path.resolve(pkgDir);
	const packages = packageNames(pkgRoot);
	const own = packages.filter((name) => fs.existsSync(path.join(pkgRoot, name, ".git")));
	const ownSet = new Set(own);
	let outerRoot: string | undefined;
	try {
		outerRoot = repoRootOf(pkgRoot);
	} catch {
		outerRoot = undefined;
	}
	const repos: PkgGitRepo[] = [];
	if (outerRoot !== undefined) {
		const files = gitChangedFiles(pkgRoot)
			.filter((file) => {
				const parts = path.relative(pkgRoot, file).split(path.sep);
				return parts.length >= 2 && !ownSet.has(parts[0]);
			})
			.sort();
		const outerPackages = [...new Set(files.map((file) => path.relative(pkgRoot, file).split(path.sep)[0]))].sort();
		repos.push({ root: outerRoot, dir: pkgRoot, files, packages: outerPackages });
	}
	for (const name of own) {
		const dir = path.join(pkgRoot, name);
		const root = repoRootOf(dir);
		const files = gitChangedFiles(dir).sort();
		repos.push({ root, dir, files, packages: files.length > 0 ? [name] : [] });
	}
	const withoutGit = outerRoot === undefined ? packages.filter((name) => !ownSet.has(name)) : [];
	return { repos, withoutGit };
}
