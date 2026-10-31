import { describe, it, expect } from "vitest";
import { createTrackerTools } from "@bpmsoft-agent/agent-runtime";
import type { AppTool } from "@bpmsoft-agent/agent-runtime";
import { createEvalJira } from "../src/evalJira";

const ISSUES = {
	"PRJ-201": { fields: { summary: "Тестовая задача", description: "Описание задачи" } },
};

function toolNamed(tools: AppTool[], name: string): AppTool {
	const tool = tools.find((item) => item.name === name);
	if (!tool) {
		throw new Error(`нет инструмента ${name}`);
	}
	return tool;
}

describe("createEvalJira", () => {
	it("jira_get_issue returns the summary and the description of the case issue", async () => {
		const jira = createEvalJira({ issues: ISSUES });
		const tools = createTrackerTools({ jira: jira.connection, fetchImpl: jira.fetchImpl });

		const result = await toolNamed(tools, "jira_get_issue").execute({ key: "prj-201" });

		expect(result.isError).toBe(false);
		expect(result.text).toContain("PRJ-201");
		expect(result.text).toContain("Тестовая задача");
		expect(result.text).toContain("Описание задачи");
	});

	it("jira_get_issue returns an error for an unknown key", async () => {
		const jira = createEvalJira({ issues: ISSUES });
		const tools = createTrackerTools({ jira: jira.connection, fetchImpl: jira.fetchImpl });

		const result = await toolNamed(tools, "jira_get_issue").execute({ key: "PRJ-999" });

		expect(result.isError).toBe(true);
	});

	it("jira_add_comment records the comment in the fake Jira", async () => {
		const jira = createEvalJira({ issues: ISSUES });
		const tools = createTrackerTools({ jira: jira.connection, fetchImpl: jira.fetchImpl });

		const result = await toolNamed(tools, "jira_add_comment").execute({ key: "prj-201", text: "Готово" });

		expect(result.isError).toBe(false);
		expect(jira.comments).toEqual([{ key: "PRJ-201", body: "Готово" }]);
	});
});
