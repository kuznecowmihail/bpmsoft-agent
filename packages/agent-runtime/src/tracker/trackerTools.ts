import type { FetchLike } from "../crm/crmSession";
import type { AppTool, AppToolResult } from "../tools/appTool";
import { errorText, TrackerConfig } from "./atlassianHttp";
import { fetchConfluencePage, isConfluenceLink } from "./confluenceClient";
import { fetchJiraIssue, jiraAddComment, parseIssueKey } from "./jiraClient";

export const JIRA_GET_ISSUE_TOOL = "jira_get_issue";
export const JIRA_ADD_COMMENT_TOOL = "jira_add_comment";
export const CONFLUENCE_GET_PAGE_TOOL = "confluence_get_page";
/** Linked Confluence pages loaded with an issue and the size limit of each. */
const LINKED_PAGES = 3;
const LINKED_PAGE_CHARS = 20000;

/** Options of the tracker tools: configured connections, fetch for tests, confirmation of the comment (none — the host asks itself). */
export interface TrackerToolsOptions extends TrackerConfig {
	fetchImpl?: FetchLike;
	confirm?: (text: string) => Promise<boolean>;
}

const BAD_KEY = (keyOrUrl: string): string => `Не понял ключ задачи: ${keyOrUrl}. Нужен ключ вида PRJ-123 или ссылка на задачу.`;

/** Jira issue with the texts of the linked Confluence pages (up to LINKED_PAGES). */
export async function loadJiraTask(options: TrackerToolsOptions, keyOrUrl: string): Promise<AppToolResult> {
	const jira = options.jira;
	if (!jira) {
		return { text: "Jira не настроена в приложении.", isError: true };
	}
	const key = parseIssueKey(keyOrUrl);
	if (!key) {
		return { text: BAD_KEY(keyOrUrl), isError: true };
	}
	try {
		const issue = await fetchJiraIssue(jira, key, options.fetchImpl);
		const parts = [issue.text];
		const confluence = options.confluence;
		if (confluence) {
			const pages = issue.links.filter((link) => isConfluenceLink(confluence, link)).slice(0, LINKED_PAGES);
			for (const link of pages) {
				try {
					parts.push(await fetchConfluencePage(confluence, link, options.fetchImpl, LINKED_PAGE_CHARS));
				} catch (e) {
					parts.push(`## Страница Confluence ${link}\nне загружена: ${errorText(e)}`);
				}
			}
		}
		return { text: parts.join("\n\n---\n\n"), isError: false };
	} catch (e) {
		return { text: errorText(e), isError: true };
	}
}

/** Adds a comment to the Jira issue after the confirmation, when one is set. */
async function addJiraComment(options: TrackerToolsOptions, keyOrUrl: string, text: string): Promise<AppToolResult> {
	const jira = options.jira;
	if (!jira) {
		return { text: "Jira не настроена в приложении.", isError: true };
	}
	const key = parseIssueKey(keyOrUrl);
	if (!key) {
		return { text: BAD_KEY(keyOrUrl), isError: true };
	}
	try {
		if (options.confirm && !(await options.confirm(`Комментарий в задачу Jira ${key}:\n\n${text}`))) {
			return { text: "Пользователь отклонил комментарий.", isError: true };
		}
		const url = await jiraAddComment(jira, key, text, options.fetchImpl);
		return { text: `Комментарий добавлен: ${url}`, isError: false };
	} catch (e) {
		return { text: errorText(e), isError: true };
	}
}

/** Tools for the chat: Jira tools when Jira is configured, Confluence page tool when Confluence is configured. */
export function createTrackerTools(options: TrackerToolsOptions): AppTool[] {
	const tools: AppTool[] = [];
	if (options.jira) {
		tools.push({
			name: JIRA_GET_ISSUE_TOOL,
			description: "Задача Jira: описание, критерии приёмки, комментарии, связи, вложения, ссылки и тексты связанных страниц Confluence (до 3)",
			params: { key: { type: "string", description: "Ключ задачи (PRJ-123) или ссылка на неё" } },
			execute: (args) => loadJiraTask(options, String(args.key ?? "")),
		});
		tools.push({
			name: JIRA_ADD_COMMENT_TOOL,
			description: "Комментарий в задачу Jira с подтверждения пользователя",
			params: {
				key: { type: "string", description: "Ключ задачи (PRJ-123) или ссылка на неё" },
				text: { type: "string", description: "Текст комментария" },
			},
			execute: (args) => addJiraComment(options, String(args.key ?? ""), String(args.text ?? "")),
		});
	}
	const confluence = options.confluence;
	if (confluence) {
		tools.push({
			name: CONFLUENCE_GET_PAGE_TOOL,
			description: "Текст страницы Confluence по ссылке или Id",
			params: { page: { type: "string", description: "Ссылка на страницу Confluence или её Id" } },
			execute: async (args): Promise<AppToolResult> => {
				try {
					return { text: await fetchConfluencePage(confluence, String(args.page ?? ""), options.fetchImpl), isError: false };
				} catch (e) {
					return { text: errorText(e), isError: true };
				}
			},
		});
	}
	return tools;
}
