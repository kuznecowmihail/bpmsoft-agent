# Цепочка Jira → MR, этап 1: ветка и MR — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** инструменты `git_branch_status`, `git_switch_branch`, `git_create_mr` в desktop и в MCP-сервере `bpmsoft`, правила их вызова в промпте и экспорте.

**Architecture:** модуль `packages/agent-runtime/src/git/` поверх `findPkgGitRepos`; git вызывается асинхронно через `execFile` без оболочки. Инструменты — `AppTool`; desktop передаёт `confirm` (карточка разрешения `git_action`), MCP-сервер — без `confirm` (подтверждают разрешения Claude Code / Cursor).

**Tech Stack:** TypeScript, Node `child_process.execFile`, vitest, `@modelcontextprotocol/sdk`, zod.

**Spec:** `docs/superpowers/specs/2026-10-29-jira-mr-chain-design.md`

## Global Constraints

- Кроссплатформенно: пути через `path.join`, без `/` в строках путей; git только через `execFile`, без `shell: true`.
- Git не обязателен: без него инструменты отвечают «git не найден», ничего не падает.
- Код — табы, однострочный JSDoc над каждой функцией, комментарии на английском, тексты пользователю на русском.
- Весь промпт `systemPrompt.ts` — один template-литерал: без обратных кавычек в тексте.
- Вне этапа 1: Jira, Confluence, настройки целевой ветки (по умолчанию `origin/HEAD`, агент может передать `target`), кнопка «Взять задачу», ссылки между несколькими MR, регистрация MCP-сервера в стенде без CRM и БД.

---

### Task 1: git-модуль

**Files:**
- Create: `packages/agent-runtime/src/git/gitRun.ts`, `packages/agent-runtime/src/git/gitBranches.ts`, `packages/agent-runtime/src/git/gitCreateMr.ts`
- Test: `packages/agent-runtime/test/gitTools.test.ts`

**Interfaces:**
- Consumes: `findPkgGitRepos(pkgDir): PkgGitLayout`, `PkgGitLayout` из `src/lint/pkgGitRepos.ts`; `AppToolResult` из `src/tools/appTool.ts`.
- Produces: `runGit`, `gitMissing`, `GIT_MISSING`, `GIT_REMOTE_TIMEOUT_MS`; `gitBranchStatus(pkgDir, {packages, issueKey?, target?})`, `gitSwitchBranch(pkgDir, pkg, branch, confirm?)`, `repoDirOfPackage`, `repoLabel`; `gitCreateMr(pkgDir, CreateMrInput, confirm?)`, `branchName`, `pkgRelative`, `selectTaskFiles`. Все инструментальные функции возвращают `Promise<AppToolResult>`.

- [ ] **Step 1: gitRun.ts**

```ts
import { execFile } from "child_process";

/** Result of one git call; code -1 when git could not be started or timed out. */
export interface GitOutput {
	code: number;
	stdout: string;
	stderr: string;
}

/** Timeout of a local git call. */
export const GIT_TIMEOUT_MS = 30000;
/** Timeout of git calls that go to the remote (fetch, push). */
export const GIT_REMOTE_TIMEOUT_MS = 120000;
/** Text for the user when git is not installed. */
export const GIT_MISSING = "git не найден: установите git — без него ветку и MR не сделать";

/** Runs git in a folder without a shell; never waits for a password prompt and never throws. */
export function runGit(cwd: string, args: string[], timeoutMs: number = GIT_TIMEOUT_MS): Promise<GitOutput> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["-C", cwd, ...args],
			{
				encoding: "utf8",
				timeout: timeoutMs,
				maxBuffer: 16 * 1024 * 1024,
				windowsHide: true,
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
			},
			(error, stdout, stderr) => {
				if (!error) {
					resolve({ code: 0, stdout, stderr });
					return;
				}
				const e = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
				if (e.code === "ENOENT") {
					resolve({ code: -1, stdout: "", stderr: GIT_MISSING });
					return;
				}
				if (e.killed) {
					resolve({ code: -1, stdout, stderr: `git не ответил за ${Math.round(timeoutMs / 1000)} с` });
					return;
				}
				resolve({ code: typeof e.code === "number" ? e.code : 1, stdout, stderr: stderr || e.message });
			},
		);
	});
}

/** True when git cannot be started. */
export async function gitMissing(cwd: string): Promise<boolean> {
	return (await runGit(cwd, ["--version"])).code === -1;
}

/** Last non-empty line of git output, for short error messages. */
export function lastLine(text: string): string {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
	return lines[lines.length - 1] ?? "";
}

/** Message of an unknown thrown value. */
export function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
```

- [ ] **Step 2: gitBranches.ts**

```ts
import * as fs from "fs";
import * as path from "path";
import type { AppToolResult } from "../tools/appTool";
import { findPkgGitRepos } from "../lint/pkgGitRepos";
import type { PkgGitLayout } from "../lint/pkgGitRepos";
import { GIT_MISSING, GIT_REMOTE_TIMEOUT_MS, errorText, gitMissing, lastLine, runGit } from "./gitRun";

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

/** Non-empty trimmed lines of git output. */
function lines(text: string): string[] {
	return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
}

/** Current branch name, or "HEAD" when detached; throws when git fails. */
export async function currentBranch(dir: string): Promise<string> {
	const out = await runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	if (out.code !== 0) {
		throw new Error(lastLine(out.stderr) || "git rev-parse не выполнился");
	}
	return out.stdout.trim();
}

/** Target branch: the given one, else the default branch of origin; undefined when origin/HEAD is not set. */
export async function targetBranch(dir: string, target?: string): Promise<string | undefined> {
	if (target !== undefined && target.trim() !== "") {
		return target.trim().replace(/^origin\//, "");
	}
	const out = await runGit(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	const name = out.code === 0 ? out.stdout.trim().replace(/^origin\//, "") : "";
	return name || undefined;
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
	const count = await runGit(dir, ["rev-list", "--count", `${ref}..HEAD`]);
	const log = await runGit(dir, ["log", "--oneline", "-10", `${ref}..HEAD`]);
	return { count: Number(count.stdout.trim()) || 0, commits: lines(log.stdout) };
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
		for (const name of lines(refs.stdout)) {
			if (name.toLowerCase().includes(issueKey.toLowerCase())) {
				add(name);
			}
		}
	}
	if (target) {
		add(target);
	}
	const recent = await runGit(dir, ["for-each-ref", "--sort=-committerdate", "--count=10", "--format=%(refname:short)", "refs/remotes/origin"]);
	for (const name of lines(recent.stdout)) {
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
	const target = await targetBranch(dir, options.target);
	const taskBranch = options.issueKey !== undefined && current.toLowerCase().includes(options.issueKey.toLowerCase());
	let ok = taskBranch;
	if (target === undefined) {
		text.push("- целевая ветка не определена (нет origin/HEAD): спроси пользователя и передай target");
	} else {
		text.push(`- целевая ветка: ${target}`);
		const ref = await targetRef(dir, target);
		if (ref === undefined) {
			text.push(`- ветки ${target} нет ни на origin, ни локально`);
		} else {
			const ahead = await aheadOf(dir, ref);
			if (ahead.count > 0) {
				text.push(`- в текущей ветке ${ahead.count} коммит(ов), которых нет в ${target}:`, ...ahead.commits.map((commit) => `  ${commit}`));
			}
			const behind = Number((await runGit(dir, ["rev-list", "--count", `HEAD..${ref}`])).stdout.trim()) || 0;
			if (behind > 0) {
				text.push(`- отстаёт от ${target} на ${behind} коммит(ов)`);
			}
			ok = ok || (current === target && ahead.count === 0);
		}
	}
	const list = await candidates(dir, current, target, options.issueKey);
	if (list.length > 0) {
		text.push(`- кандидаты на переключение: ${list.join(", ")}`);
	}
	text.push(ok ? "- итог: ветка подходит" : "- итог: ветка не целевая или в ней чужие коммиты — спроси пользователя, в какой ветке работать");
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
	const status = await runGit(dir, ["status", "--porcelain"]);
	const dirty = lines(status.stdout);
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
	const current = await currentBranch(dir).catch(() => "HEAD");
	if (confirm && !(await confirm(`Переключить ветку git в ${repoLabel(pkgRoot, dir)}: ${current} → ${name}\nФайлы Pkg изменятся; после этого нужно «Обновить из файловой системы».`))) {
		return { text: "Пользователь отклонил переключение ветки.", isError: true };
	}
	const out = await runGit(dir, local ? ["switch", name] : ["switch", "-c", name, "--track", `origin/${name}`]);
	if (out.code !== 0) {
		return { text: `git switch не выполнился: ${lastLine(out.stderr || out.stdout)}`, isError: true };
	}
	return { text: `Ветка переключена: ${name} (${repoLabel(pkgRoot, dir)}). Файлы Pkg изменились — предложи пользователю обновить CRM.`, isError: false };
}
```

- [ ] **Step 3: gitCreateMr.ts**

```ts
import * as path from "path";
import type { AppToolResult } from "../tools/appTool";
import { findPkgGitRepos } from "../lint/pkgGitRepos";
import type { PkgGitLayout } from "../lint/pkgGitRepos";
import { aheadOf, currentBranch, fetchOrigin, refExists, repoDirOfPackage, repoLabel, targetBranch, targetRef } from "./gitBranches";
import { GIT_MISSING, GIT_REMOTE_TIMEOUT_MS, errorText, gitMissing, lastLine, runGit } from "./gitRun";

/** Input of git_create_mr. */
export interface CreateMrInput {
	issueKey: string;
	title: string;
	paths: string[];
	description: string;
	target?: string;
}

/** Jira issue key: PRJ-123. */
export const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;
const DESCRIPTION_PREVIEW_CHARS = 1500;
const MR_URL = /https?:\/\/\S+\/-\/merge_requests\/\d+/;
const ANY_URL = /https?:\/\/\S+/;
const STAND_PKG_MARKER = "BPMSoft.Configuration/Pkg/";

const TRANSLIT: Record<string, string> = {
	а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
	р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Branch name <KEY>-<latin slug of the title>, slug at most 40 characters. */
export function branchName(issueKey: string, title: string): string {
	const latin = [...title.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join("");
	const slug = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
	return slug === "" ? issueKey : `${issueKey}-${slug}`;
}

/** Task path relative to Pkg with platform separators: absolute, stand-relative or Pkg-relative; undefined outside Pkg. */
export function pkgRelative(pkgRoot: string, input: string): string | undefined {
	const trimmed = input.trim();
	let abs: string;
	if (path.isAbsolute(trimmed)) {
		abs = path.resolve(trimmed);
	} else {
		let rel = trimmed.replace(/\\/g, "/");
		const marker = rel.indexOf(STAND_PKG_MARKER);
		if (marker >= 0) {
			rel = rel.slice(marker + STAND_PKG_MARKER.length);
		}
		abs = path.resolve(pkgRoot, ...rel.split("/").filter((part) => part !== ""));
	}
	const rel = path.relative(pkgRoot, abs);
	return rel === "" || rel.startsWith("..") || path.isAbsolute(rel) ? undefined : rel;
}

/** Changed files inside the task paths; a Schemas/<Name> path also takes Resources/<Name>.* of the same package. */
export function selectTaskFiles(pkgRoot: string, files: string[], relPaths: string[]): string[] {
	const dirs = relPaths.map((rel) => path.join(pkgRoot, rel));
	const resourcePrefixes: string[] = [];
	for (const rel of relPaths) {
		const parts = rel.split(path.sep);
		if (parts.length === 3 && parts[1] === "Schemas") {
			resourcePrefixes.push(path.join(pkgRoot, parts[0], "Resources", `${parts[2]}.`));
		}
	}
	return files.filter(
		(file) => dirs.some((dir) => file === dir || file.startsWith(dir + path.sep)) || resourcePrefixes.some((prefix) => file.startsWith(prefix)),
	);
}

/** Plan for one repository. */
interface RepoPlan {
	dir: string;
	files: string[];
	current: string;
	target: string;
	ahead: string[];
	aheadCount: number;
	fetchError?: string;
}

/** Pushes the branch with GitLab push options; without their support pushes plainly. */
async function pushBranch(dir: string, branch: string, target: string, subject: string): Promise<{ ok: boolean; text: string }> {
	const base = ["push", "-u", "origin", branch];
	let out = await runGit(dir, [...base, "-o", "merge_request.create", "-o", `merge_request.target=${target}`, "-o", `merge_request.title=${subject}`], GIT_REMOTE_TIMEOUT_MS);
	let withOptions = true;
	if (out.code !== 0 && /push options/i.test(out.stderr)) {
		withOptions = false;
		out = await runGit(dir, base, GIT_REMOTE_TIMEOUT_MS);
	}
	if (out.code !== 0) {
		return { ok: false, text: `push не прошёл: ${lastLine(out.stderr || out.stdout)}. Ветка ${branch} с коммитом осталась локально — повтори git_create_mr с теми же параметрами.` };
	}
	const output = `${out.stdout}\n${out.stderr}`;
	const mr = MR_URL.exec(output);
	if (mr) {
		return { ok: true, text: `MR: ${mr[0]}` };
	}
	const url = ANY_URL.exec(output);
	const reason = withOptions ? "" : " (сервер не поддерживает push-опции)";
	return { ok: true, text: `ветка отправлена, MR не создан${reason}; ${url ? `создай вручную: ${url[0]}` : "создай его вручную"}` };
}

/** Error result. */
function fail(text: string): AppToolResult {
	return { text, isError: true };
}

/** Branch, commit of the task files, push and MR in every repository the task touches; asks confirm first when given. */
export async function gitCreateMr(pkgDir: string, input: CreateMrInput, confirm?: (text: string) => Promise<boolean>): Promise<AppToolResult> {
	const pkgRoot = path.resolve(pkgDir);
	const issueKey = input.issueKey.trim();
	if (!ISSUE_KEY_PATTERN.test(issueKey)) {
		return fail(`Ключ задачи должен быть вида PRJ-123: ${input.issueKey}`);
	}
	const title = input.title.trim().replace(/\s+/g, " ");
	const description = input.description.trim();
	if (title === "" || description === "" || input.paths.length === 0) {
		return fail("Нужны title, description (из плана) и paths (папки схем задачи).");
	}
	const rels: string[] = [];
	const bad: string[] = [];
	for (const item of input.paths) {
		const rel = pkgRelative(pkgRoot, item);
		if (rel === undefined) {
			bad.push(item);
		} else {
			rels.push(rel);
		}
	}
	if (bad.length > 0) {
		return fail(`Пути вне Pkg: ${bad.join(", ")}`);
	}
	if (await gitMissing(pkgRoot)) {
		return fail(GIT_MISSING);
	}
	let layout: PkgGitLayout;
	try {
		layout = findPkgGitRepos(pkgRoot);
	} catch (e) {
		return fail(`Ошибка git: ${errorText(e)}`);
	}
	const branch = branchName(issueKey, title);
	const subject = `${issueKey} ${title}`;
	const taskPackages = [...new Set(rels.map((rel) => rel.split(path.sep)[0]))];
	const outside = taskPackages.filter((name) => layout.withoutGit.includes(name));
	const plans: RepoPlan[] = [];
	const problems: string[] = [];
	for (const repo of layout.repos) {
		if (!taskPackages.some((name) => repoDirOfPackage(layout, pkgRoot, name) === repo.dir)) {
			continue;
		}
		const label = repoLabel(pkgRoot, repo.dir);
		const files = selectTaskFiles(pkgRoot, repo.files, rels);
		let current: string;
		try {
			current = await currentBranch(repo.dir);
		} catch (e) {
			problems.push(`${label}: ${errorText(e)}`);
			continue;
		}
		const onBranch = current === branch;
		if (files.length === 0 && !onBranch) {
			continue;
		}
		if (!onBranch && (await refExists(repo.dir, `refs/heads/${branch}`))) {
			problems.push(`${label}: ветка ${branch} уже есть — переключись на неё или измени title`);
			continue;
		}
		const fetchError = await fetchOrigin(repo.dir);
		const target = await targetBranch(repo.dir, input.target);
		if (target === undefined) {
			problems.push(`${label}: целевая ветка не определена (нет origin/HEAD) — передай target`);
			continue;
		}
		const ref = onBranch ? undefined : await targetRef(repo.dir, target);
		const ahead = ref ? await aheadOf(repo.dir, ref) : { count: 0, commits: [] };
		plans.push({ dir: repo.dir, files, current, target, ahead: ahead.commits, aheadCount: ahead.count, fetchError });
	}
	if (problems.length > 0) {
		return fail(problems.join("\n"));
	}
	if (plans.length === 0) {
		return fail(`Изменённых файлов задачи в git нет.${outside.length > 0 ? ` Пакеты вне git: ${outside.join(", ")} — MR для них не создать.` : ""}`);
	}
	const card = [`Создать ветку и MR: ${subject}`];
	for (const plan of plans) {
		card.push("", `Репозиторий: ${repoLabel(pkgRoot, plan.dir)}`, `Ветка: ${branch} (от ${plan.current}) → MR в ${plan.target}`);
		if (plan.files.length > 0) {
			card.push("Файлы:", ...plan.files.map((file) => `  ${path.relative(pkgRoot, file)}`));
		} else {
			card.push("Повтор: ветка с коммитом уже есть, только отправка");
		}
		if (plan.aheadCount > 0) {
			card.push(`ВНИМАНИЕ: в MR попадут ещё ${plan.aheadCount} коммит(ов), которых нет в ${plan.target}:`, ...plan.ahead.map((commit) => `  ${commit}`));
		}
		if (plan.fetchError) {
			card.push(`git fetch не прошёл (${plan.fetchError}): сравнение по данным последнего fetch`);
		}
	}
	if (outside.length > 0) {
		card.push("", `Пакеты вне git: ${outside.join(", ")} — MR для них не будет`);
	}
	card.push("", "Описание MR:", description.length > DESCRIPTION_PREVIEW_CHARS ? `${description.slice(0, DESCRIPTION_PREVIEW_CHARS)}…` : description);
	if (confirm && !(await confirm(card.join("\n")))) {
		return fail("Пользователь отклонил создание ветки и MR.");
	}
	const report: string[] = [];
	let ok = true;
	for (const plan of plans) {
		const label = repoLabel(pkgRoot, plan.dir);
		const steps: string[][] = [];
		if (plan.current !== branch) {
			steps.push(["switch", "-c", branch]);
		}
		if (plan.files.length > 0) {
			steps.push(["add", "--", ...plan.files.map((file) => path.relative(plan.dir, file))], ["commit", "-m", subject, "-m", description]);
		}
		let failed: string | undefined;
		for (const args of steps) {
			const out = await runGit(plan.dir, args);
			if (out.code !== 0) {
				failed = `git ${args[0]}: ${lastLine(out.stderr || out.stdout)}`;
				break;
			}
		}
		if (failed !== undefined) {
			ok = false;
			report.push(`${label}: ${failed}`);
			continue;
		}
		const pushed = await pushBranch(plan.dir, branch, plan.target, subject);
		ok = ok && pushed.ok;
		report.push(`${label}: ${pushed.text}`);
	}
	report.push("", `Рабочая копия теперь на ветке ${branch}.`);
	if (outside.length > 0) {
		report.push(`Пакеты вне git: ${outside.join(", ")} — MR не создан.`);
	}
	return { text: report.join("\n"), isError: !ok };
}
```

- [ ] **Step 4: тесты `test/gitTools.test.ts`**

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { branchName, gitCreateMr, pkgRelative, selectTaskFiles } from "../src/git/gitCreateMr";
import { gitBranchStatus, gitSwitchBranch } from "../src/git/gitBranches";

describe("git tools", () => {
	let tmp: string;
	let remote: string;
	let pkg: string;
	let optionsFile: string;

	/** Runs git in the folder and returns stdout. */
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

	/** Writes a file under Pkg, creating parent folders. */
	const write = (rel: string, content: string): void => {
		const file = path.join(pkg, ...rel.split("/"));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-tools-")));
		remote = path.join(tmp, "remote.git");
		optionsFile = path.join(tmp, "push-options.txt");
		execFileSync("git", ["init", "--bare", "-b", "develop", remote]);
		git(remote, "config", "receive.advertisePushOptions", "true");
		const hook = path.join(remote, "hooks", "pre-receive");
		fs.writeFileSync(
			hook,
			[
				"#!/bin/sh",
				`out="${optionsFile.replace(/\\/g, "/")}"`,
				': > "$out"',
				"i=0",
				'while [ $i -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do',
				'  eval "echo \\$GIT_PUSH_OPTION_$i" >> "$out"',
				"  i=$((i+1))",
				"done",
				'echo "View merge request: https://gitlab.test/group/project/-/merge_requests/7"',
				"",
			].join("\n"),
		);
		fs.chmodSync(hook, 0o755);
		pkg = path.join(tmp, "Pkg");
		fs.mkdirSync(pkg);
		git(pkg, "init", "-b", "develop");
		git(pkg, "config", "user.email", "test@example.com");
		git(pkg, "config", "user.name", "test");
		write("P1/Schemas/TestA/metadata.json", "{}");
		write("P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "<a/>");
		git(pkg, "add", "-A");
		git(pkg, "commit", "-m", "init");
		git(pkg, "remote", "add", "origin", remote);
		git(pkg, "push", "-u", "origin", "develop");
		git(pkg, "remote", "set-head", "origin", "develop");
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("branchName transliterates the title", () => {
		expect(branchName("PRJ-1", "Добавить поле «Статус»")).toBe("PRJ-1-dobavit-pole-status");
	});

	it("pkgRelative accepts stand-relative and Pkg-relative paths and rejects others", () => {
		expect(pkgRelative(pkg, "BPMSoft.Configuration/Pkg/P1/Schemas/TestA")).toBe(path.join("P1", "Schemas", "TestA"));
		expect(pkgRelative(pkg, "P1/Schemas/TestA")).toBe(path.join("P1", "Schemas", "TestA"));
		expect(pkgRelative(pkg, "../x")).toBeUndefined();
	});

	it("selectTaskFiles takes the schema folder and its resources", () => {
		const files = [
			path.join(pkg, "P1", "Schemas", "TestA", "metadata.json"),
			path.join(pkg, "P1", "Resources", "TestA.ClientUnit", "resource.ru-RU.xml"),
			path.join(pkg, "P1", "Resources", "TestAB.ClientUnit", "resource.ru-RU.xml"),
			path.join(pkg, "P1", "Schemas", "TestB", "metadata.json"),
		];
		expect(selectTaskFiles(pkg, files, [path.join("P1", "Schemas", "TestA")])).toEqual(files.slice(0, 2));
	});

	it("status: the target branch is fine", async () => {
		const result = await gitBranchStatus(pkg, { packages: ["P1"] });
		expect(result.text).toContain("текущая ветка: develop");
		expect(result.text).toContain("итог: ветка подходит");
	});

	it("status: a feature branch with its own commit, candidates with the issue key first", async () => {
		git(pkg, "switch", "-c", "PRJ-5-old");
		git(pkg, "push", "-u", "origin", "PRJ-5-old");
		git(pkg, "switch", "develop");
		git(pkg, "switch", "-c", "feature/x");
		write("P1/Schemas/TestA/metadata.json", '{"x":1}');
		git(pkg, "commit", "-am", "wip");
		const result = await gitBranchStatus(pkg, { packages: ["P1"], issueKey: "PRJ-5" });
		expect(result.text).toContain("1 коммит");
		expect(result.text).toContain("кандидаты на переключение: PRJ-5-old, develop");
		expect(result.text).toContain("спроси пользователя");
	});

	it("switch refuses with uncommitted changes and switches to a branch that exists only on origin", async () => {
		git(pkg, "switch", "-c", "release/1");
		git(pkg, "push", "-u", "origin", "release/1");
		git(pkg, "switch", "develop");
		git(pkg, "branch", "-D", "release/1");
		write("P1/Schemas/TestA/metadata.json", '{"dirty":1}');
		const refused = await gitSwitchBranch(pkg, "P1", "release/1");
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain("незакоммиченные");
		git(pkg, "checkout", "--", ".");
		const switched = await gitSwitchBranch(pkg, "P1", "release/1");
		expect(switched.isError).toBe(false);
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("release/1");
	});

	it("create MR commits only the task files and passes push options", async () => {
		write("P1/Schemas/TestA/metadata.json", '{"a":1}');
		write("P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "<b/>");
		write("P1/Schemas/Other/metadata.json", "{}");
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-7", title: "Поле статус", paths: ["P1/Schemas/TestA"], description: "AC-1: Дано форма\nAC-2: Когда" });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("MR: https://gitlab.test/group/project/-/merge_requests/7");
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("PRJ-7-pole-status");
		const committed = git(pkg, "show", "--name-only", "--format=", "HEAD").trim().split("\n").sort();
		expect(committed).toEqual(["P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "P1/Schemas/TestA/metadata.json"]);
		expect(git(pkg, "status", "--porcelain")).toContain("P1/Schemas/Other/");
		const options = fs.readFileSync(optionsFile, "utf8");
		expect(options).toContain("merge_request.create");
		expect(options).toContain("merge_request.target=develop");
		expect(options).toContain("merge_request.title=PRJ-7 Поле статус");
		expect(git(pkg, "log", "-1", "--format=%B")).toContain("AC-1: Дано форма");
	});

	it("create MR without push options support pushes the branch and says the MR is not created", async () => {
		git(remote, "config", "receive.advertisePushOptions", "false");
		fs.rmSync(path.join(remote, "hooks", "pre-receive"));
		write("P1/Schemas/TestA/metadata.json", '{"a":2}');
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-8", title: "x", paths: ["P1/Schemas/TestA"], description: "d" });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("ветка отправлена, MR не создан");
		expect(git(remote, "branch", "--list", "PRJ-8-x")).toContain("PRJ-8-x");
	});

	it("a failed push keeps the commit and a retry only pushes", async () => {
		git(pkg, "remote", "set-url", "origin", path.join(tmp, "missing.git"));
		write("P1/Schemas/TestA/metadata.json", '{"a":3}');
		const input = { issueKey: "PRJ-9", title: "retry", paths: ["P1/Schemas/TestA"], description: "d", target: "develop" };
		const failed = await gitCreateMr(pkg, input);
		expect(failed.isError).toBe(true);
		expect(failed.text).toContain("push не прошёл");
		git(pkg, "remote", "set-url", "origin", remote);
		const retried = await gitCreateMr(pkg, input);
		expect(retried.isError).toBe(false);
		expect(git(pkg, "rev-list", "--count", "develop..PRJ-9-retry").trim()).toBe("1");
	});

	it("a declined confirmation changes nothing", async () => {
		write("P1/Schemas/TestA/metadata.json", '{"a":4}');
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-10", title: "no", paths: ["P1/Schemas/TestA"], description: "d" }, async () => false);
		expect(result.isError).toBe(true);
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("develop");
	});
});
```

- [ ] **Step 5:** `cd packages/agent-runtime && npx vitest run test/gitTools.test.ts` — PASS; `npx tsc -p tsconfig.json --noEmit` — без ошибок.

### Task 2: инструменты в desktop и MCP

**Files:**
- Create: `packages/agent-runtime/src/git/gitTools.ts`, `packages/agent-runtime/src/git/index.ts`, `packages/agent-runtime/src/tools/appToolZod.ts`
- Modify: `packages/agent-runtime/src/index.ts`, `src/tools/index.ts`, `src/provider/anthropicProvider.ts` (zodShape → appToolZodShape), `src/mcp/bpmsoftMcpServer.ts`, `src/claudeExport/standIntegration.ts` (MCP_PERMISSIONS), `apps/desktop/src/main/agentSession.ts`, `apps/desktop/src/renderer/src/chatFormat.ts`
- Test: `packages/agent-runtime/test/bpmsoftMcpServer.test.ts` и тесты, где перечислены MCP_TOOL_NAMES / MCP_PERMISSIONS

**Interfaces:**
- Produces: `createGitTools({ pkgRoot, confirm? }): AppTool[]`, константы `GIT_BRANCH_STATUS_TOOL = "git_branch_status"`, `GIT_SWITCH_BRANCH_TOOL = "git_switch_branch"`, `GIT_CREATE_MR_TOOL = "git_create_mr"`; `appToolZodShape(tool): Record<string, z.ZodType>`.

- [ ] **Step 1: gitTools.ts**

```ts
import type { AppTool } from "../tools/appTool";
import { gitBranchStatus, gitSwitchBranch } from "./gitBranches";
import { gitCreateMr } from "./gitCreateMr";

export const GIT_BRANCH_STATUS_TOOL = "git_branch_status";
export const GIT_SWITCH_BRANCH_TOOL = "git_switch_branch";
export const GIT_CREATE_MR_TOOL = "git_create_mr";

/** Options of the git tools: Pkg folder and the confirmation of changing actions (none — the host asks itself). */
export interface GitToolsOptions {
	pkgRoot: string;
	confirm?: (text: string) => Promise<boolean>;
}

/** String argument or "". */
function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Non-empty string argument or undefined. */
function optStr(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Non-empty strings of a list argument. */
function list(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

/** Branch status, branch switch and branch-with-MR tools over the git repositories of the Pkg packages. */
export function createGitTools(options: GitToolsOptions): AppTool[] {
	return [
		{
			name: GIT_BRANCH_STATUS_TOOL,
			description: "Ветка git для пакетов задачи: текущая и целевая ветка, коммиты текущей, которых нет в целевой, отставание, кандидаты на переключение. Перед этим делает git fetch, больше ничего не меняет.",
			params: {
				packages: { type: "string[]", description: "Пакеты задачи — имена папок в Pkg" },
				issueKey: { type: "string", optional: true, description: "Ключ задачи Jira (PRJ-123): ветки с ним — первые кандидаты" },
				target: { type: "string", optional: true, description: "Целевая ветка MR, если пользователь её назвал; иначе — основная ветка origin" },
			},
			execute: (args) => gitBranchStatus(options.pkgRoot, { packages: list(args.packages), issueKey: optStr(args.issueKey), target: optStr(args.target) }),
		},
		{
			name: GIT_SWITCH_BRANCH_TOOL,
			description: "Переключает репозиторий пакета на ветку (локальную или с origin) с подтверждения пользователя. При незакоммиченных правках не переключает. После переключения файлы Pkg другие — нужно «Обновить из файловой системы».",
			params: {
				package: { type: "string", description: "Пакет — имя папки в Pkg" },
				branch: { type: "string", description: "Имя ветки без origin/" },
			},
			execute: (args) => gitSwitchBranch(options.pkgRoot, str(args.package), str(args.branch), options.confirm),
		},
		{
			name: GIT_CREATE_MR_TOOL,
			description: "Ветка <ключ>-<кратко> от текущей, коммит только файлов задачи, push и MR (GitLab, push-опции) в каждом затронутом репозитории; с подтверждения пользователя. Возвращает ссылки на MR.",
			params: {
				issueKey: { type: "string", description: "Ключ задачи Jira, например PRJ-123" },
				title: { type: "string", description: "Суть задачи коротко — заголовок MR и имя ветки" },
				paths: { type: "string[]", description: "Папки изменённых схем относительно Pkg: <Пакет>/Schemas/<Имя>, <Пакет>/SqlScripts/<Имя>, <Пакет>/Data/<Имя>; ресурсы схемы берутся сами" },
				description: { type: "string", description: "Описание MR из плана: AC, CC, DoD, решения без вопроса, риски, итог pkg_lint и проверки" },
				target: { type: "string", optional: true, description: "Целевая ветка MR; по умолчанию основная ветка origin" },
			},
			execute: (args) =>
				gitCreateMr(options.pkgRoot, { issueKey: str(args.issueKey), title: str(args.title), paths: list(args.paths), description: str(args.description), target: optStr(args.target) }, options.confirm),
		},
	];
}
```

`src/git/index.ts`: `export * from "./gitRun"; export * from "./gitBranches"; export * from "./gitCreateMr"; export * from "./gitTools";` (по строке на модуль). `src/index.ts`: добавить `export * from "./git";`.

- [ ] **Step 2: appToolZod.ts** — перенести `zodShape` из `anthropicProvider.ts` без изменений тела, переименовав в экспортируемую `appToolZodShape(appTool: AppTool): Record<string, z.ZodType>`; `anthropicProvider.ts` импортирует её; `src/tools/index.ts` экспортирует модуль.

- [ ] **Step 3: MCP-сервер** (`bpmsoftMcpServer.ts`): после блока `if (config.db) {…}` всегда регистрировать git-инструменты; удалить блок `if (!crm && !config.db)` с пустым списком (инструменты теперь есть всегда); в `MCP_TOOL_NAMES` добавить три имени.

```ts
	const pkgRoot = path.join(deps.root, "BPMSoft.Configuration", "Pkg");
	// Changing git tools are confirmed by the host (Claude Code / Cursor permissions), so no confirm here.
	for (const gitTool of createGitTools({ pkgRoot })) {
		server.registerTool(gitTool.name, { description: gitTool.description, inputSchema: appToolZodShape(gitTool) }, async (args) => {
			const result = await gitTool.execute(args as Record<string, unknown>);
			return { content: [{ type: "text" as const, text: result.text }], isError: result.isError };
		});
	}
```

`standIntegration.ts`: в `MCP_PERMISSIONS` добавить `"mcp__bpmsoft__git_branch_status"` (только чтение и fetch). `git_switch_branch`, `git_create_mr` остаются с подтверждением.

Тесты `bpmsoftMcpServer.test.ts`: «has no tools when nothing is configured» → ожидать ровно `["git_branch_status", "git_create_mr", "git_switch_branch"]` (отсортировано); в остальных ожиданиях списков имён добавить эти три. Поправить тесты, где сравнивается `MCP_PERMISSIONS` или `permissions.allow`.

- [ ] **Step 4: desktop** — `agentSession.ts`: импорт `createGitTools` из `@bpmsoft-agent/agent-runtime`; в `appTools` добавить
```ts
...createGitTools({ pkgRoot: projectPath, confirm: (text) => requestToolPermission({ toolName: 'git_action', input: { action: text } }) })
```
`chatFormat.ts`: в `describeToolCall` — `name === 'git_action'` → `'Действие с git'`; `bare` `git_branch_status` → `'Смотрит ветки git'`, `git_switch_branch` → `` `Переключает ветку git на ${String(field(input, 'branch') ?? '')}`.trim() ``, `git_create_mr` → `'Создаёт ветку и MR'`; имена из MCP экспорта (`…__git_*`) тоже — сравнивать через `endsWith('__git_…')` как у `crm_*`. В `permissionSubject` условие `name === 'crm_action' || name === 'crm_browser_click'` дополнить `|| name === 'git_action'`.

- [ ] **Step 5:** `npx vitest run` и `npx tsc -p tsconfig.json --noEmit` в `packages/agent-runtime`; `npx tsc --noEmit -p tsconfig.json` (или скрипт typecheck) в `apps/desktop`.

### Task 3: правила в промпте и экспорте

**Files:**
- Modify: `packages/agent-runtime/src/provider/systemPrompt.ts`, `src/provider/anthropicProvider.ts`, `src/provider/cursorProvider.ts`, `packages/agent-runtime/claude-export/AGENTS.md`, `packages/agent-runtime/claude-export/skills/bpm-develop/SKILL.md`

- [ ] **Step 1: systemPrompt.ts** — опция `gitMr?: boolean` в `buildBpmsoftSystemPrompt`; секция вставляется после `CRM_REQUEST_SECTION` тем же способом:

```ts
/** Prompt section added when the git tools are available (git_branch_status, git_switch_branch, git_create_mr). */
const GIT_MR_SECTION = [
	"ВЕТКА И MR. Инструменты git_branch_status, git_switch_branch и git_create_mr работают с git-репозиториями пакетов: репозиторий — вся папка Pkg (или папка выше) либо отдельный пакет.",
	"- Ветка: после выбора пакета, до вопросов по требованиям, вызови git_branch_status с пакетами задачи и ключом задачи Jira, если пользователь его назвал. Итог «ветка подходит» — не спрашивай. Иначе покажи, что сказал инструмент (текущая и целевая ветка, чужие коммиты), и закончи ход блоком <choices> с вопросом «В какой ветке работать?» и вариантами «Переключись в <ветка>» для каждого кандидата из ответа (рекомендуемый — ветка с ключом задачи, иначе целевая), «Работать от текущей», «Переключусь сам». На «Переключись» вызови git_switch_branch, затем предложи обновить CRM: файлы Pkg изменились.",
	"- В плане (шаг 4) — строка «Ветка: от <текущая>, MR в <целевая>, репозиториев N»; если репозиториев несколько — «будет N MR».",
	"- После проверки (pkg_lint без ошибок, изменения загружены на стенд, AC проверены тобой или пользователем) предложи блоком <choices> с вопросом «Создать ветку и MR?» и вариантами «Создай MR» и «Сделаю сам». Без ответа не вызывай. На «Создай MR» вызови git_create_mr: issueKey — ключ задачи (нет ключа — спроси), title — суть задачи коротко, paths — папки изменённых в чате схем относительно Pkg (<Пакет>/Schemas/<Имя>, <Пакет>/SqlScripts/<Имя>, <Пакет>/Data/<Имя>), description — из плана: AC, CC, DoD, решения без вопроса, риски, итог pkg_lint и проверки. Ссылки на MR из ответа приведи пользователю.",
	"- «git не найден» или «вне git» — MR не создать: скажи об этом; ветку, коммит и push через Bash не делай. Push не прошёл — локальная ветка с коммитом осталась: повтори git_create_mr с теми же параметрами, когда пользователь скажет."
].join("\n");
```

В обоих провайдерах в вызов `buildBpmsoftSystemPrompt` добавить `gitMr: Boolean(options.appTools?.some((t) => t.name === "git_create_mr"))`.

- [ ] **Step 2: AGENTS.md экспорта** — после раздела действий на стенде CRM добавить раздел `## Ветка и MR` с теми же правилами для инструментов `mcp__bpmsoft__git_*` (они есть, когда подключён MCP-сервер `bpmsoft`); вместо `<choices>` — встроенный инструмент вопросов. `bpm-develop/SKILL.md`: шаг 1 — в конце предложение «Затем проверь ветку (`AGENTS.md`, «Ветка и MR»)»; шаг 4 — пункт «ветка: от какой, MR в какую, сколько репозиториев»; шаг 6 — пункт «после проверки — вопрос «Создать ветку и MR?» и `git_create_mr` (`AGENTS.md`, «Ветка и MR»)».

- [ ] **Step 3:** `npm run build` в `packages/agent-runtime`; `npx vitest run` — PASS (в том числе `claudeExportTexts.test.ts`).

### После этапа 1

Предложить пользователю эвал-кейс «ветка не та» и ручную проверку на стенде с реальным GitLab (этап 0 спеки): `git_create_mr` в тестовом пакете.
