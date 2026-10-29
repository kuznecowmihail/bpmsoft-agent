import * as fs from "fs";
import * as path from "path";
import type { AppToolResult } from "../tools/appTool";
import { findPkgGitRepos } from "../lint/pkgGitRepos";
import type { PkgGitLayout } from "../lint/pkgGitRepos";
import { GIT_MISSING, GIT_REMOTE_TIMEOUT_MS, gitMissing, lastLine, nonEmptyLines, runGit } from "./gitRun";
import { errorText } from "../tools/errorText";

/** Options of the branch status: packages of the task, issue key and target branch. */
export interface BranchStatusOptions {
	packages: string[];
	issueKey?: string;
	target?: string;
}

/** Git folder of a package: its own repository, else the Pkg repository; undefined outside git. */
export function repoDirOfPackage(layout: PkgGitLayout, pkgRoot: string, name: string): string | undefined {
	const own = layout.repos.find((repo) => repo.dir === path.join(pkgRoot, name));
	return own?.dir ?? layout.repos.find((repo) => repo.dir === pkgRoot)?.dir;
}

/** Short label of a repository folder for messages: "Pkg" or the package name. */
export function repoLabel(pkgRoot: string, dir: string): string {
	return dir === pkgRoot ? "Pkg" : path.relative(pkgRoot, dir);
}

/** Current branch name, or "HEAD" when detached; throws when git fails. */
export async function currentBranch(dir: string): Promise<string> {
	const out = await runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	if (out.code !== 0) {
		throw new Error(lastLine(out.stderr) || "git rev-parse не выполнился");
	}
	return out.stdout.trim();
}

/** True when the branch name carries the issue key. */
export function isTaskBranch(name: string, issueKey?: string): boolean {
	return issueKey !== undefined && issueKey !== "" && name.toLowerCase().includes(issueKey.toLowerCase());
}

/** Git config key that remembers the MR target of a task branch created by git_create_mr. */
export function mrTargetKey(branch: string): string {
	return `branch.${branch}.bpmsoftMrTarget`;
}

/** Number of commits in a revision range; 0 when git fails. */
export async function countCommits(dir: string, range: string): Promise<number> {
	const out = await runGit(dir, ["rev-list", "--count", range]);
	return out.code === 0 ? Number(out.stdout.trim()) || 0 : 0;
}

/** Default branch of origin (origin/HEAD) without the origin/ prefix; undefined when not set. */
async function originHead(dir: string): Promise<string | undefined> {
	const out = await runGit(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	const name = out.code === 0 ? out.stdout.trim().replace(/^origin\//, "") : "";
	return name || undefined;
}

/**
 * MR target: the given one; the target remembered for a task branch; origin/HEAD for another task branch;
 * the current branch itself when it exists on origin (develop, release, sprint branch); otherwise origin/HEAD.
 */
export async function defaultTarget(dir: string, current: string, options: { target?: string; issueKey?: string }): Promise<string | undefined> {
	if (options.target !== undefined && options.target.trim() !== "") {
		return options.target.trim().replace(/^origin\//, "");
	}
	const remembered = await runGit(dir, ["config", "--get", mrTargetKey(current)]);
	if (remembered.code === 0 && remembered.stdout.trim() !== "") {
		return remembered.stdout.trim();
	}
	if (isTaskBranch(current, options.issueKey)) {
		return originHead(dir);
	}
	if (current !== "HEAD" && (await refExists(dir, `refs/remotes/origin/${current}`))) {
		return current;
	}
	return originHead(dir);
}

/** True when the ref exists. */
export async function refExists(dir: string, ref: string): Promise<boolean> {
	return (await runGit(dir, ["show-ref", "--verify", "--quiet", ref])).code === 0;
}

/** Ref to compare with: origin/<target> when it exists, else the local branch; undefined when neither exists. */
export async function targetRef(dir: string, target: string): Promise<string | undefined> {
	for (const ref of [`refs/remotes/origin/${target}`, `refs/heads/${target}`]) {
		if (await refExists(dir, ref)) {
			return ref;
		}
	}
	return undefined;
}

/** Commits of HEAD that the ref does not have: total count and at most 10 one-line entries. */
export async function aheadOf(dir: string, ref: string): Promise<{ count: number; commits: string[] }> {
	const log = await runGit(dir, ["log", "--oneline", "-10", `${ref}..HEAD`]);
	return { count: await countCommits(dir, `${ref}..HEAD`), commits: nonEmptyLines(log.stdout) };
}

/** Fetches origin; returns the error line or undefined on success. */
export async function fetchOrigin(dir: string): Promise<string | undefined> {
	const out = await runGit(dir, ["fetch", "--prune", "origin"], GIT_REMOTE_TIMEOUT_MS);
	return out.code === 0 ? undefined : lastLine(out.stderr) || "ошибка";
}

/** Up to 3 branches to switch to: with the issue key, then the target, then recently updated branches of origin. */
async function candidates(dir: string, current: string, target: string | undefined, issueKey?: string): Promise<string[]> {
	const out: string[] = [];
	const add = (name: string): void => {
		const bare = name.replace(/^origin\//, "");
		if (bare !== "" && bare !== "origin" && bare !== "HEAD" && bare !== current && !out.includes(bare)) {
			out.push(bare);
		}
	};
	if (issueKey) {
		const refs = await runGit(dir, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"]);
		for (const name of nonEmptyLines(refs.stdout)) {
			if (name.toLowerCase().includes(issueKey.toLowerCase())) {
				add(name);
			}
		}
	}
	if (target) {
		add(target);
	}
	const recent = await runGit(dir, ["for-each-ref", "--sort=-committerdate", "--count=10", "--format=%(refname:short)", "refs/remotes/origin"]);
	for (const name of nonEmptyLines(recent.stdout)) {
		add(name);
	}
	return out.slice(0, 3);
}

/** Status block of one repository. */
async function repoStatus(pkgRoot: string, dir: string, names: string[], options: BranchStatusOptions): Promise<string> {
	const text = [`Репозиторий ${repoLabel(pkgRoot, dir)} (пакеты: ${names.join(", ")})`];
	const fetchError = await fetchOrigin(dir);
	if (fetchError) {
		text.push(`- git fetch не прошёл (${fetchError}): сравнение по данным последнего fetch`);
	}
	let current: string;
	try {
		current = await currentBranch(dir);
	} catch (e) {
		text.push(`- ошибка git: ${errorText(e)}`);
		return text.join("\n");
	}
	text.push(`- текущая ветка: ${current}`);
	const taskBranch = isTaskBranch(current, options.issueKey);
	const onOrigin = current !== "HEAD" && (await refExists(dir, `refs/remotes/origin/${current}`));
	let behindOrigin = 0;
	let unpushed = 0;
	if (onOrigin) {
		behindOrigin = await countCommits(dir, `HEAD..refs/remotes/origin/${current}`);
		unpushed = await countCommits(dir, `refs/remotes/origin/${current}..HEAD`);
		if (behindOrigin > 0) {
			text.push(`- отстаёт от origin/${current} на ${behindOrigin} коммит(ов): ветку нужно обновить до работы`);
		}
		if (unpushed > 0) {
			text.push(`- ${unpushed} локальных коммит(ов) не отправлены в origin/${current}`);
		}
	}
	const target = await defaultTarget(dir, current, options);
	let aheadOfTarget = 0;
	if (target === undefined) {
		text.push("- ветка для MR не определена (нет origin/HEAD): спроси пользователя и передай target");
	} else {
		text.push(`- MR пойдёт в: ${target}`);
		if (target !== current) {
			const ref = await targetRef(dir, target);
			if (ref === undefined) {
				text.push(`- ветки ${target} нет ни на origin, ни локально`);
				aheadOfTarget = -1;
			} else {
				const ahead = await aheadOf(dir, ref);
				aheadOfTarget = ahead.count;
				if (ahead.count > 0) {
					text.push(`- в текущей ветке ${ahead.count} коммит(ов), которых нет в ${target}:`, ...ahead.commits.map((commit) => `  ${commit}`));
				}
				const behind = await countCommits(dir, `HEAD..${ref}`);
				if (behind > 0) {
					text.push(`- отстаёт от ${target} на ${behind} коммит(ов)`);
				}
			}
		}
	}
	const list = await candidates(dir, current, target, options.issueKey);
	if (list.length > 0) {
		text.push(`- кандидаты на переключение: ${list.join(", ")}`);
	}
	const fits = target !== undefined && (taskBranch || (target === current && unpushed === 0) || (target !== current && aheadOfTarget === 0));
	if (behindOrigin > 0) {
		text.push(`- итог: ветка отстаёт от origin — предложи обновить её (git_switch_branch с веткой ${current})`);
	} else if (fits) {
		text.push("- итог: ветка подходит");
	} else {
		text.push("- итог: ветка не целевая или в ней чужие коммиты — спроси пользователя, в какой ветке работать");
	}
	return text.join("\n");
}

/** Branch status of the repositories that hold the task packages; changes nothing except git fetch. */
export async function gitBranchStatus(pkgDir: string, options: BranchStatusOptions): Promise<AppToolResult> {
	const pkgRoot = path.resolve(pkgDir);
	if (options.packages.length === 0) {
		return { text: "Укажи пакеты задачи (packages).", isError: true };
	}
	if (await gitMissing(pkgRoot)) {
		return { text: GIT_MISSING, isError: true };
	}
	let layout: PkgGitLayout;
	try {
		layout = findPkgGitRepos(pkgRoot);
	} catch (e) {
		return { text: `Ошибка git: ${errorText(e)}`, isError: true };
	}
	const byDir = new Map<string, string[]>();
	const outside: string[] = [];
	const missing: string[] = [];
	for (const name of options.packages) {
		if (!fs.existsSync(path.join(pkgRoot, name))) {
			missing.push(name);
			continue;
		}
		const dir = repoDirOfPackage(layout, pkgRoot, name);
		if (dir === undefined) {
			outside.push(name);
			continue;
		}
		byDir.set(dir, [...(byDir.get(dir) ?? []), name]);
	}
	const blocks: string[] = [];
	for (const [dir, names] of byDir) {
		blocks.push(await repoStatus(pkgRoot, dir, names, options));
	}
	if (outside.length > 0) {
		blocks.push(`Пакеты вне git: ${outside.join(", ")} — ветку и MR для них не сделать.`);
	}
	if (missing.length > 0) {
		blocks.push(`Нет таких папок в Pkg: ${missing.join(", ")}.`);
	}
	return { text: blocks.join("\n\n"), isError: byDir.size === 0 };
}

/** Switches the repository of a package to a local or origin branch after confirmation; refuses with uncommitted changes. */
export async function gitSwitchBranch(
	pkgDir: string,
	pkg: string,
	branch: string,
	confirm?: (text: string) => Promise<boolean>,
): Promise<AppToolResult> {
	const pkgRoot = path.resolve(pkgDir);
	const name = branch.trim().replace(/^origin\//, "");
	if (pkg.trim() === "" || name === "") {
		return { text: "Нужны package и branch.", isError: true };
	}
	if (await gitMissing(pkgRoot)) {
		return { text: GIT_MISSING, isError: true };
	}
	let layout: PkgGitLayout;
	try {
		layout = findPkgGitRepos(pkgRoot);
	} catch (e) {
		return { text: `Ошибка git: ${errorText(e)}`, isError: true };
	}
	const dir = fs.existsSync(path.join(pkgRoot, pkg)) ? repoDirOfPackage(layout, pkgRoot, pkg) : undefined;
	if (dir === undefined) {
		return { text: `Пакет ${pkg} не найден в Pkg или не в git.`, isError: true };
	}
	if ((await runGit(dir, ["check-ref-format", "--branch", name])).code !== 0) {
		return { text: `Недопустимое имя ветки: ${name}`, isError: true };
	}
	const current = await currentBranch(dir).catch(() => "HEAD");
	if (name === current) {
		return fastForward(pkgRoot, dir, name, confirm);
	}
	const status = await runGit(dir, ["status", "--porcelain"]);
	const dirty = nonEmptyLines(status.stdout);
	if (dirty.length > 0) {
		return {
			text: [`В репозитории ${repoLabel(pkgRoot, dir)} есть незакоммиченные правки, переключение не делаю:`, ...dirty.slice(0, 30).map((line) => `  ${line}`), "Переключи ветку сам или закоммить правки."].join("\n"),
			isError: true,
		};
	}
	const local = await refExists(dir, `refs/heads/${name}`);
	if (!local && !(await refExists(dir, `refs/remotes/origin/${name}`))) {
		return { text: `Ветки ${name} нет ни локально, ни на origin.`, isError: true };
	}
	if (confirm && !(await confirm(`Переключить ветку git в ${repoLabel(pkgRoot, dir)}: ${current} → ${name}\nФайлы Pkg изменятся; после этого нужно «Обновить из файловой системы».`))) {
		return { text: "Пользователь отклонил переключение ветки.", isError: true };
	}
	const out = await runGit(dir, local ? ["switch", name] : ["switch", "-c", name, "--track", `origin/${name}`]);
	if (out.code !== 0) {
		return { text: `git switch не выполнился: ${lastLine(out.stderr || out.stdout)}`, isError: true };
	}
	return { text: `Ветка переключена: ${name} (${repoLabel(pkgRoot, dir)}). Файлы Pkg изменились — предложи пользователю обновить CRM.`, isError: false };
}

/** Fast-forwards the current branch to origin after confirmation; refuses when the branches diverged. */
async function fastForward(pkgRoot: string, dir: string, name: string, confirm?: (text: string) => Promise<boolean>): Promise<AppToolResult> {
	const fetchError = await fetchOrigin(dir);
	const ref = `refs/remotes/origin/${name}`;
	if (!(await refExists(dir, ref))) {
		return { text: `Ветки ${name} нет на origin — обновлять не из чего.`, isError: true };
	}
	const behind = await countCommits(dir, `HEAD..${ref}`);
	if (behind === 0) {
		return { text: `Ветка ${name} уже совпадает с origin/${name}${fetchError ? ` (git fetch не прошёл: ${fetchError})` : ""}.`, isError: false };
	}
	if (confirm && !(await confirm(`Обновить ветку git в ${repoLabel(pkgRoot, dir)}: ${name} ← origin/${name}, ${behind} коммит(ов)\nФайлы Pkg изменятся; после этого нужно «Обновить из файловой системы» и, если менялись C#, процессы или объекты, компиляция.`))) {
		return { text: "Пользователь отклонил обновление ветки.", isError: true };
	}
	const out = await runGit(dir, ["merge", "--ff-only", ref]);
	if (out.code !== 0) {
		return { text: `Ветку не обновить без слияния: ${lastLine(out.stderr || out.stdout)}. Обнови её сам (git pull).`, isError: true };
	}
	return { text: `Ветка ${name} обновлена до origin/${name}: ${behind} коммит(ов). Файлы Pkg изменились — предложи пользователю обновить CRM (и компиляцию, если в новых коммитах есть C#, процессы или объекты).`, isError: false };
}
