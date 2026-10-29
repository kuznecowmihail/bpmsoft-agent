import type { FetchLike } from "../crm/crmSession";
import { atlassianJson, baseUrl, JiraConnection } from "./atlassianHttp";
import { field, textOf } from "./json";

/** Limit of the issue text given to the agent. */
export const JIRA_ISSUE_MAX_CHARS = 40000;
/** Last comments shown with an issue. */
export const JIRA_COMMENTS_SHOWN = 30;

const ISSUE_FIELDS = ["summary", "description", "status", "issuetype", "priority", "labels", "fixVersions", "comment", "issuelinks", "attachment", "parent", "subtasks"];
const KEY_IN_LINK = /(?:\/browse\/|selectedIssue=|\/issues\/)([A-Za-z][A-Za-z0-9_]+-\d+)/;
const BARE_KEY = /^[A-Za-z][A-Za-z0-9_]+-\d+$/;
const URL_PATTERN = /https?:\/\/[^\s|\]\)"'<>]+/g;

/** The value as an array, or an empty one. */
function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** Issue key from a key or a link to the issue, upper-cased; undefined when none is found. */
export function parseIssueKey(input: string): string | undefined {
	const trimmed = input.trim();
	const fromLink = KEY_IN_LINK.exec(trimmed);
	const key = fromLink ? fromLink[1] : BARE_KEY.test(trimmed) ? trimmed : undefined;
	return key?.toUpperCase();
}

/** Loads the issue with its remote links and returns the Markdown text and the links found in it. */
export async function fetchJiraIssue(conn: JiraConnection, key: string, fetchImpl?: FetchLike): Promise<{ text: string; links: string[] }> {
	const fields = conn.acceptanceField ? [...ISSUE_FIELDS, conn.acceptanceField] : ISSUE_FIELDS;
	const id = encodeURIComponent(key);
	const issue = await atlassianJson("Jira", conn, `/rest/api/2/issue/${id}?fields=${fields.join(",")}`, { fetchImpl });
	const remote = await atlassianJson("Jira", conn, `/rest/api/2/issue/${id}/remotelink`, { fetchImpl }).catch((): unknown[] => []);
	return formatJiraIssue(conn, issue, remote);
}

/** Key, summary and status of an issue as one line. */
function issueLine(issue: unknown): string {
	const fields = field(issue, "fields");
	const status = textOf(field(field(fields, "status"), "name"));
	const line = [textOf(field(issue, "key")), textOf(field(fields, "summary"))].filter(Boolean).join(" ");
	return status ? `${line} (${status})` : line;
}

/** Markdown text of a Jira issue and the unique links from its description, criteria, comments and remote links. */
export function formatJiraIssue(conn: JiraConnection, issue: unknown, remoteLinks: unknown): { text: string; links: string[] } {
	const fields = field(issue, "fields");
	const base = baseUrl(conn);
	const key = textOf(field(issue, "key")) ?? "";
	const summary = textOf(field(fields, "summary")) ?? "";

	const meta: string[] = [];
	const issueType = textOf(field(field(fields, "issuetype"), "name"));
	const status = textOf(field(field(fields, "status"), "name"));
	const priority = textOf(field(field(fields, "priority"), "name"));
	const labels = asArray(field(fields, "labels")).map(textOf).filter((v): v is string => v !== undefined);
	const versions = asArray(field(fields, "fixVersions")).map((v) => textOf(field(v, "name"))).filter((v): v is string => v !== undefined);
	if (issueType) meta.push(`Тип: ${issueType}`);
	if (status) meta.push(`Статус: ${status}`);
	if (priority) meta.push(`Приоритет: ${priority}`);
	if (labels.length) meta.push(`Метки: ${labels.join(", ")}`);
	if (versions.length) meta.push(`Версии: ${versions.join(", ")}`);

	const parent = field(fields, "parent");
	const parentLine = textOf(field(parent, "key"))
		? `Родитель: ${[textOf(field(parent, "key")), textOf(field(field(parent, "fields"), "summary"))].filter(Boolean).join(" ")}`
		: undefined;

	const head = [`# ${key} ${summary}`.trimEnd(), meta.length ? meta.join(" · ") : undefined, `Ссылка: ${base}/browse/${key}`, parentLine]
		.filter((v): v is string => v !== undefined)
		.join("\n");

	const description = textOf(field(fields, "description"));
	const rawAcceptance = conn.acceptanceField ? field(fields, conn.acceptanceField) : undefined;
	const acceptance = typeof rawAcceptance === "string"
		? textOf(rawAcceptance)
		: rawAcceptance !== null && rawAcceptance !== undefined ? JSON.stringify(rawAcceptance) : undefined;

	const subtasks = asArray(field(fields, "subtasks")).map((s) => `- ${issueLine(s)}`);

	const relations = asArray(field(fields, "issuelinks")).flatMap((link) => {
		const outward = field(link, "outwardIssue");
		const inward = field(link, "inwardIssue");
		const other = outward ?? inward;
		if (!other) {
			return [];
		}
		const relation = textOf(field(field(link, "type"), outward ? "outward" : "inward"));
		return [`- ${[relation, issueLine(other)].filter(Boolean).join(" ")}`];
	});

	const commentObject = field(fields, "comment");
	const comments = asArray(field(commentObject, "comments"));
	const total = typeof field(commentObject, "total") === "number" ? field(commentObject, "total") : comments.length;
	const shownComments = comments.slice(-JIRA_COMMENTS_SHOWN);
	const commentBlocks = shownComments.map((c) => {
		const author = textOf(field(field(c, "author"), "displayName")) ?? "автор не указан";
		const created = textOf(field(c, "created"));
		const when = created ? `, ${created.slice(0, 16).replace("T", " ")}` : "";
		return `### ${author}${when}\n${textOf(field(c, "body")) ?? ""}`;
	});
	const commentSection = comments.length
		? [`## Комментарии (${String(total)})`, ...(comments.length > JIRA_COMMENTS_SHOWN ? [`Показаны последние ${JIRA_COMMENTS_SHOWN}.`] : []), ...commentBlocks].join("\n\n")
		: undefined;

	const attachments = asArray(field(fields, "attachment")).map((a) => `- ${textOf(field(a, "filename")) ?? "файл"} (${textOf(field(a, "size")) ?? "?"} байт)`);

	const remotes = asArray(remoteLinks).map((r) => field(r, "object"));
	const remoteLines = remotes
		.filter((o) => textOf(field(o, "url")))
		.map((o) => `- ${textOf(field(o, "title")) ?? "ссылка"}: ${textOf(field(o, "url"))}`);

	const sections: Array<string | undefined> = [
		head,
		description ? `## Описание\n${description}` : undefined,
		acceptance ? `## Критерии приёмки\n${acceptance}` : undefined,
		subtasks.length ? `## Подзадачи\n${subtasks.join("\n")}` : undefined,
		relations.length ? `## Связанные задачи\n${relations.join("\n")}` : undefined,
		commentSection,
		attachments.length ? `## Вложения\n${attachments.join("\n")}` : undefined,
		remoteLines.length ? `## Ссылки\n${remoteLines.join("\n")}` : undefined,
	];
	const full = sections.filter((s): s is string => s !== undefined).join("\n\n");

	const linkSource = [
		description ?? "",
		acceptance ?? "",
		...comments.map((c) => textOf(field(c, "body")) ?? ""),
		...remotes.map((o) => textOf(field(o, "url")) ?? ""),
	].join("\n");
	const links = [...new Set(linkSource.match(URL_PATTERN) ?? [])];

	const text = full.length > JIRA_ISSUE_MAX_CHARS ? `${full.slice(0, JIRA_ISSUE_MAX_CHARS)}\n…(текст задачи обрезан)` : full;
	return { text, links };
}

/** Adds a comment to the issue and returns the link to it. */
export async function jiraAddComment(conn: JiraConnection, key: string, body: string, fetchImpl?: FetchLike): Promise<string> {
	await atlassianJson("Jira", conn, `/rest/api/2/issue/${encodeURIComponent(key)}/comment`, { method: "POST", body: { body }, fetchImpl });
	return `${baseUrl(conn)}/browse/${key}`;
}

/** Checks the login: returns the name of the user the token belongs to. */
export async function testJira(conn: JiraConnection, fetchImpl?: FetchLike): Promise<string> {
	const me = await atlassianJson("Jira", conn, "/rest/api/2/myself", { fetchImpl });
	return `Вход в Jira выполнен: ${textOf(field(me, "displayName")) ?? textOf(field(me, "name")) ?? "пользователь"}`;
}
