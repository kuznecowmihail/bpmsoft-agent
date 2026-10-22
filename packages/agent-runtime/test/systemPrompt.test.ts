import { describe, it, expect } from "vitest";
import { buildBpmsoftSystemPrompt } from "../src/provider/systemPrompt";

describe("buildBpmsoftSystemPrompt", () => {
	it("adds the CRM database section when dbQuery is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { dbQuery: true });
		expect(prompt).toContain("crm_db_query");
		expect(prompt).toContain("ДОСТУП К БД CRM");
	});

	it("tells the agent to fall back to the user when the database is unavailable", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { dbQuery: true });
		expect(prompt).toContain("БД CRM недоступна");
	});

	it("does not mention the CRM database tool by default", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).not.toContain("crm_db_query");
	});

	it("adds the CRM stand actions section when crmActions is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmActions: true });
		expect(prompt).toContain("crm_update_from_fs");
		expect(prompt).toContain("Обновить CRM сейчас?");
	});

	it("does not mention the CRM stand tools by default", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).not.toContain("crm_update_from_fs");
	});

	it("adds the CRM browser section when crmBrowser is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmBrowser: true });
		expect(prompt).toContain("БРАУЗЕР CRM");
		expect(prompt).toContain("crm_browser_open");
	});

	it("does not mention the CRM browser by default", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).not.toContain("БРАУЗЕР CRM");
		expect(prompt).not.toContain("crm_browser_");
	});

	it("adds the REST section when crmRequest is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmRequest: true });
		expect(prompt).toContain("crm_request");
		expect(prompt).toContain("REST-ЗАПРОСЫ К CRM");
	});

	it("does not mention crm_request by default", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).not.toContain("crm_request");
	});

	it("asks the user to verify the implementation in the browser when crmBrowser is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmBrowser: true });
		expect(prompt).toContain("Проверить реализацию в браузере?");
		expect(prompt).toContain("Проверь сам");
	});

	it("points the agent to browser-check.md when crmBrowser is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmBrowser: true });
		expect(prompt).toContain("browser-check.md");
	});

	it("lists browser-check.md in the knowledge index by default", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).toContain("browser-check.md");
	});

	it("tells the agent to report data anomalies instead of hiding them", () => {
		expect(buildBpmsoftSystemPrompt("/kn")).toContain("Аномалии в данных, найденные по ходу работы");
	});

	it("contains no backtick characters in any variant", () => {
		expect(buildBpmsoftSystemPrompt("/kn")).not.toContain("`");
		expect(buildBpmsoftSystemPrompt("/kn", { dbQuery: true })).not.toContain("`");
		expect(buildBpmsoftSystemPrompt("/kn", { crmActions: true })).not.toContain("`");
		expect(buildBpmsoftSystemPrompt("/kn", { crmBrowser: true })).not.toContain("`");
	});
});

describe("buildBpmsoftSystemPrompt pkg_lint and fix loop", () => {
	it("describes the fix loop and checkpoint when crmActions is enabled", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn", { crmActions: true });
		expect(prompt).toContain("Продолжай исправлять");
		expect(prompt).toContain("контрольной точке");
	});

	it("does not describe the fix loop without crmActions", () => {
		const prompt = buildBpmsoftSystemPrompt("/kn");
		expect(prompt).not.toContain("Продолжай исправлять");
	});

	it("always mentions pkg_lint", () => {
		expect(buildBpmsoftSystemPrompt("/kn")).toContain("pkg_lint");
		expect(buildBpmsoftSystemPrompt("/kn", { crmActions: true })).toContain("pkg_lint");
	});

	it("requires confirmation before deleting or mass-changing data, including extra duplicates", () => {
		expect(buildBpmsoftSystemPrompt("/kn")).toContain("в том числе «лишних» записей и дублей");
	});
});
