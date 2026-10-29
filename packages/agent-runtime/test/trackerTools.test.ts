import { describe, it, expect } from "vitest";
import type { FetchLike } from "../src/crm/crmSession";
import { atlassianJson, authHeader, createTrackerTools, parseConfluencePage, parseIssueKey, loadJiraTask } from "../src/tracker";

interface Call { url: string; init?: RequestInit }

/** Fake fetch: records every call and answers with route(). */
function fakeFetch(route: (url: string, init?: RequestInit) => Response): { fetchImpl: FetchLike; calls: Call[] } {
	const calls: Call[] = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return route(String(url), init);
	}) as unknown as FetchLike;
	return { fetchImpl, calls };
}

/** JSON response with the given status. */
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ISSUE = {
	key: "PRJ-1",
	fields: {
		summary: "Тестовая задача",
		description: "Смотри https://conf.example.com/pages/viewpage.action?pageId=42 и https://other.example.com/x",
		status: { name: "В работе" },
		issuetype: { name: "Задача" },
		priority: { name: "Средний" },
		labels: ["a"],
		fixVersions: [{ name: "1.0" }],
		customfield_1: "AC-1 текст",
		comment: {
			total: 2,
			comments: [
				{ author: { displayName: "Ann" }, created: "2026-10-01T10:00:00.000+0300", body: "первый" },
				{ author: { displayName: "Bob" }, created: "2026-10-02T11:00:00.000+0300", body: "второй" },
			],
		},
		issuelinks: [{ type: { outward: "блокирует", inward: "заблокирован" }, outwardIssue: { key: "PRJ-2", fields: { summary: "Связанная", status: { name: "Открыта" } } } }],
		attachment: [],
		subtasks: [],
	},
};

const PAGE = {
	title: "Страница",
	space: { key: "DEV" },
	version: { number: 3 },
	_links: { webui: "/spaces/DEV/pages/42/Страница" },
	body: { storage: { value: "<h1>Заголовок</h1><p>Текст &amp; ещё</p><ul><li>пункт</li></ul>" } },
};

const jiraConn = { url: "https://jira.example.com", token: "t1", acceptanceField: "customfield_1" };
const confluenceConn = { url: "https://conf.example.com", token: "c1" };

describe("parseIssueKey", () => {
	it("takes the key from a bare key and from links", () => {
		expect(parseIssueKey("prj-12")).toBe("PRJ-12");
		expect(parseIssueKey("https://jira.example.com/browse/ABC-7")).toBe("ABC-7");
		expect(parseIssueKey("https://x.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ABC-9")).toBe("ABC-9");
		expect(parseIssueKey("https://jira-2.example.com/browse/ABC-7")).toBe("ABC-7");
		expect(parseIssueKey("hello")).toBeUndefined();
	});
});

describe("authHeader", () => {
	it("uses Basic with email and Bearer without it", () => {
		const basic = authHeader({ url: "https://x", email: "a@b.c", token: "tok" });
		expect(basic.startsWith("Basic ")).toBe(true);
		expect(Buffer.from(basic.slice("Basic ".length), "base64").toString()).toBe("a@b.c:tok");
		expect(authHeader({ url: "https://x", token: "tok" })).toBe("Bearer tok");
	});
});

describe("loadJiraTask", () => {
	it("loads the issue, the acceptance criteria and the linked Confluence page", async () => {
		const { fetchImpl, calls } = fakeFetch((url) => {
			if (url.includes("/rest/api/2/issue/PRJ-1/remotelink")) return json([]);
			if (url.includes("/rest/api/2/issue/PRJ-1?")) return json(ISSUE);
			if (url.includes("/rest/api/content/42?")) return json(PAGE);
			return json({ message: "нет" }, 404);
		});
		const result = await loadJiraTask({ jira: jiraConn, confluence: confluenceConn, fetchImpl }, "PRJ-1");
		expect(result.isError).toBe(false);
		const text = result.text;
		expect(text).toContain("# PRJ-1 ");
		expect(text).toContain("## Критерии приёмки");
		expect(text).toContain("AC-1 текст");
		expect(text).toContain("## Комментарии (2)");
		expect(text).toContain("# Страница");
		expect(text).toContain("- пункт");
		expect(text).toContain("Текст & ещё");
		expect(calls.some((c) => c.url.includes("other.example.com"))).toBe(false);
		const issueCall = calls.find((c) => c.url.includes("/rest/api/2/issue/PRJ-1?"));
		expect((issueCall?.init?.headers as Record<string, string>).Authorization).toBe("Bearer t1");
	});

	it("keeps the issue when a linked Confluence page returns 404", async () => {
		const { fetchImpl } = fakeFetch((url) => {
			if (url.includes("/remotelink")) return json([]);
			if (url.includes("/rest/api/2/issue/PRJ-1?")) return json(ISSUE);
			return json({ message: "нет" }, 404);
		});
		const result = await loadJiraTask({ jira: jiraConn, confluence: confluenceConn, fetchImpl }, "PRJ-1");
		expect(result.text).toContain("не загружена");
		expect(result.isError).toBe(false);
	});

	it("reports a 401 from Jira without the token", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("", { status: 401 }));
		const result = await loadJiraTask({ jira: { url: "https://jira.example.com", token: "secret-xyz" }, fetchImpl }, "PRJ-1");
		expect(result.isError).toBe(true);
		expect(result.text).toContain("нет доступа");
		expect(result.text).not.toContain("secret-xyz");
	});

	it("aborts a request that does not answer in time", async () => {
		const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
		})) as unknown as FetchLike;
		await expect(atlassianJson("Jira", { url: "https://jira.example.com", token: "t" }, "/rest/api/2/myself", { fetchImpl, timeoutMs: 20 }))
			.rejects.toThrow("не ответила");
	});
});

describe("jira_add_comment", () => {
	it("posts only after confirmation", async () => {
		const declined = fakeFetch(() => json({ id: "1" }, 201));
		const toolsNo = createTrackerTools({ jira: { url: "https://jira.example.com", token: "t" }, fetchImpl: declined.fetchImpl, confirm: async () => false });
		const no = await toolsNo.find((t) => t.name === "jira_add_comment")!.execute({ key: "PRJ-1", text: "готово" });
		expect(no.isError).toBe(true);
		expect(declined.calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);

		const accepted = fakeFetch(() => json({ id: "1" }, 201));
		const toolsYes = createTrackerTools({ jira: { url: "https://jira.example.com", token: "t" }, fetchImpl: accepted.fetchImpl, confirm: async () => true });
		const yes = await toolsYes.find((t) => t.name === "jira_add_comment")!.execute({ key: "PRJ-1", text: "готово" });
		expect(yes.text).toContain("Комментарий добавлен");
		const posts = accepted.calls.filter((c) => c.init?.method === "POST");
		expect(posts).toHaveLength(1);
		expect(posts[0]?.url.endsWith("/rest/api/2/issue/PRJ-1/comment")).toBe(true);
		expect(JSON.parse(String(posts[0]?.init?.body))).toEqual({ body: "готово" });
	});
});

describe("parseConfluencePage", () => {
	it("reads an id, a page link and a display link", () => {
		expect(parseConfluencePage("42")).toEqual({ id: "42" });
		expect(parseConfluencePage("https://conf.example.com/spaces/DEV/pages/77/Title")).toEqual({ id: "77" });
		expect(parseConfluencePage("https://conf.example.com/display/DEV/My+Page")).toEqual({ space: "DEV", title: "My Page" });
	});
});

describe("createTrackerTools", () => {
	it("offers only the tools of the configured services", () => {
		expect(createTrackerTools({ confluence: confluenceConn }).map((t) => t.name)).toEqual(["confluence_get_page"]);
		expect(createTrackerTools({ jira: jiraConn }).map((t) => t.name)).toEqual(["jira_get_issue", "jira_add_comment"]);
	});
});
