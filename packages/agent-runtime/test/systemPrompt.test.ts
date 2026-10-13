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

	it("contains no backtick characters in either variant", () => {
		expect(buildBpmsoftSystemPrompt("/kn")).not.toContain("`");
		expect(buildBpmsoftSystemPrompt("/kn", { dbQuery: true })).not.toContain("`");
		expect(buildBpmsoftSystemPrompt("/kn", { crmActions: true })).not.toContain("`");
	});
});
