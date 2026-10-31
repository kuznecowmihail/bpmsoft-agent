import type { AppTool } from "../tools/appTool";
import { gitBranchStatus, gitSwitchBranch } from "./gitBranches";
import { gitCreateMr } from "./gitCreateMr";

export const GIT_BRANCH_STATUS_TOOL = "git_branch_status";
export const GIT_SWITCH_BRANCH_TOOL = "git_switch_branch";
export const GIT_CREATE_MR_TOOL = "git_create_mr";

/** Description of the target param shared by the status and MR tools. */
const GIT_TARGET_DESCRIPTION = "Ветка для MR, если пользователь назвал другую; по умолчанию — текущая ветка, если она есть на origin (develop, release, ветка спринта), иначе основная ветка origin";

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
				issueKey: { type: "string", optional: true, description: "Ключ задачи Jira (PRJ-123): ветки с ним — первые кандидаты. Только ключ, который назвал пользователь; не бери его из имени ветки." },
				target: { type: "string", optional: true, description: GIT_TARGET_DESCRIPTION },
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
			description: "Ветка <ключ>-<кратко> от текущей, коммит только файлов задачи, push и MR (GitLab, push-опции) в каждом затронутом репозитории; с подтверждения пользователя. Если текущая ветка уже содержит ключ задачи (ветка открытого MR), новая ветка не создаётся: коммит и push идут в неё, открытый MR получает коммит — так дописывают правки в MR. Возвращает ссылки на MR.",
			params: {
				issueKey: { type: "string", description: "Ключ задачи Jira, например PRJ-123. Только ключ, который назвал пользователь; не бери его из имени ветки." },
				title: { type: "string", description: "Суть задачи коротко — заголовок MR и имя ветки; в ветке открытого MR — суть доработки (сообщение коммита)" },
				paths: { type: "string[]", description: "Папки изменённых схем относительно Pkg: <Пакет>/Schemas/<Имя>, <Пакет>/SqlScripts/<Имя>, <Пакет>/Data/<Имя>; ресурсы схемы берутся сами" },
				description: { type: "string", description: "Описание MR из плана: AC, CC, DoD, решения без вопроса, риски, итог pkg_lint и проверки. Без подписей и ссылок на инструменты («Generated with …»)." },
				target: { type: "string", optional: true, description: GIT_TARGET_DESCRIPTION },
			},
			execute: (args) =>
				gitCreateMr(options.pkgRoot, { issueKey: str(args.issueKey), title: str(args.title), paths: list(args.paths), description: str(args.description), target: optStr(args.target) }, options.confirm),
		},
	];
}
