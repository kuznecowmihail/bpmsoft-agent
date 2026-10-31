import * as path from "path";
import type { AppToolResult } from "../tools/appTool";
import { findPkgGitRepos } from "../lint/pkgGitRepos";
import type { PkgGitLayout } from "../lint/pkgGitRepos";
import { aheadOf, countCommits, currentBranch, defaultTarget, fetchOrigin, mrTargetKey, refExists, repoDirOfPackage, repoLabel, targetRef } from "./gitBranches";
import { GIT_MISSING, GIT_REMOTE_TIMEOUT_MS, gitMissing, lastLine, runGit } from "./gitRun";
import { errorText } from "../tools/errorText";

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
	branch: string;
	files: string[];
	current: string;
	target: string;
	ahead: string[];
	aheadCount: number;
	behindTarget: number;
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
	const newBranch = branchName(issueKey, title);
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
		// A branch that already carries the issue key is the task branch: commit there instead of opening a second one.
		const branch = current.toLowerCase().includes(issueKey.toLowerCase()) ? current : newBranch;
		const onBranch = current === branch;
		if (files.length === 0 && !onBranch) {
			continue;
		}
		if (!onBranch && (await refExists(repo.dir, `refs/heads/${branch}`))) {
			problems.push(`${label}: ветка ${branch} уже есть — переключись на неё или измени title`);
			continue;
		}
		const fetchError = await fetchOrigin(repo.dir);
		const target = await defaultTarget(repo.dir, current, { target: input.target, issueKey });
		if (target === undefined) {
			problems.push(`${label}: целевая ветка не определена (нет origin/HEAD) — передай target`);
			continue;
		}
		const ref = onBranch ? undefined : await targetRef(repo.dir, target);
		const ahead = ref ? await aheadOf(repo.dir, ref) : { count: 0, commits: [] };
		const behindTarget = ref ? await countCommits(repo.dir, `HEAD..${ref}`) : 0;
		plans.push({ dir: repo.dir, branch, files, current, target, ahead: ahead.commits, aheadCount: ahead.count, behindTarget, fetchError });
	}
	if (problems.length > 0) {
		return fail(problems.join("\n"));
	}
	if (plans.length === 0) {
		return fail(`Изменённых файлов задачи в git нет.${outside.length > 0 ? ` Пакеты вне git: ${outside.join(", ")} — MR для них не создать.` : ""}`);
	}
	const warnings: string[] = [];
	for (const plan of plans) {
		const label = repoLabel(pkgRoot, plan.dir);
		if (plan.aheadCount > 0) {
			warnings.push(`ВНИМАНИЕ (${label}): в MR попадут ещё ${plan.aheadCount} коммит(ов), которых нет в ${plan.target} — список ниже`);
		}
		if (plan.behindTarget > 0) {
			warnings.push(`ВНИМАНИЕ (${label}): ветка отстаёт от ${plan.target} на ${plan.behindTarget} коммит(ов) — в MR возможны конфликты`);
		}
	}
	const card = [`${plans.every((plan) => plan.current === plan.branch) ? "Коммит и push в ветку открытого MR" : "Создать ветку и MR"}: ${subject}`, ...warnings];
	for (const plan of plans) {
		card.push("", `Репозиторий: ${repoLabel(pkgRoot, plan.dir)}`, plan.current === plan.branch ? `Ветка: ${plan.branch} (уже есть) → MR в ${plan.target}` : `Ветка: ${plan.branch} (от ${plan.current}) → MR в ${plan.target}`);
		if (plan.files.length > 0) {
			card.push("Файлы:", ...plan.files.map((file) => `  ${path.relative(pkgRoot, file)}`));
		} else {
			card.push("Повтор: ветка с коммитом уже есть, только отправка");
		}
		if (plan.aheadCount > 0) {
			card.push(`Коммиты, которых нет в ${plan.target}:`, ...plan.ahead.map((commit) => `  ${commit}`));
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
		if (plan.current !== plan.branch) {
			steps.push(["switch", "-c", plan.branch], ["config", mrTargetKey(plan.branch), plan.target]);
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
		const pushed = await pushBranch(plan.dir, plan.branch, plan.target, subject);
		ok = ok && pushed.ok;
		report.push(`${label}: ${pushed.text}`);
	}
	report.push("", `Рабочая копия теперь на ветке ${[...new Set(plans.map((plan) => plan.branch))].join(", ")}. Файлы задачи остаются в рабочей копии — теперь они в коммите, поэтому git status пустой.`);
	if (outside.length > 0) {
		report.push(`Пакеты вне git: ${outside.join(", ")} — MR не создан.`);
	}
	return { text: report.join("\n"), isError: !ok };
}
