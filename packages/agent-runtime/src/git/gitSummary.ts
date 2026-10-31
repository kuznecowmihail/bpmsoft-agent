import * as path from "path";
import { findPkgGitRepos } from "../lint/pkgGitRepos";
import { countCommits, currentBranch, defaultTarget, repoLabel, targetRef } from "./gitBranches";
import { gitMissing } from "./gitRun";

/** Branch state of one git repository of the Pkg packages, for the desktop badge. */
export interface GitRepoSummary {
	/** "Pkg" or the package name (repoLabel). */
	label: string;
	/** Repository folder: the Pkg folder or a package folder. */
	dir: string;
	/** Current branch, "HEAD" when detached, "?" when git rev-parse failed. */
	branch: string;
	/** MR target branch (defaultTarget without issue key); undefined when not found. */
	target?: string;
	/** Commits of HEAD missing in the target ref. */
	ahead: number;
	/** Commits of the target ref missing in HEAD. */
	behind: number;
	/** Number of changed or new files (findPkgGitRepos files). */
	changed: number;
}

/** Git state of the Pkg folder: repositories, packages outside git, git not installed. */
export interface PkgGitSummary {
	repos: GitRepoSummary[];
	withoutGit: string[];
	gitMissing?: boolean;
}

/** Branch summary of the Pkg repositories without git fetch: compares with the last fetched refs. */
export async function pkgGitSummary(pkgDir: string): Promise<PkgGitSummary> {
	const pkgRoot = path.resolve(pkgDir);
	if (await gitMissing(pkgRoot)) {
		return { repos: [], withoutGit: [], gitMissing: true };
	}
	const layout = findPkgGitRepos(pkgRoot);
	const repos: GitRepoSummary[] = [];
	for (const repo of layout.repos) {
		let branch: string;
		try {
			branch = await currentBranch(repo.dir);
		} catch {
			branch = "?";
		}
		const target = branch === "?" ? undefined : await defaultTarget(repo.dir, branch, {});
		const ref = target ? await targetRef(repo.dir, target) : undefined;
		const ahead = ref ? await countCommits(repo.dir, `${ref}..HEAD`) : 0;
		const behind = ref ? await countCommits(repo.dir, `HEAD..${ref}`) : 0;
		repos.push({
			label: repoLabel(pkgRoot, repo.dir),
			dir: repo.dir,
			branch,
			target,
			ahead,
			behind,
			changed: repo.files.length,
		});
	}
	return { repos, withoutGit: layout.withoutGit };
}
