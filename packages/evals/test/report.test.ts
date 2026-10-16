import { describe, it, expect } from "vitest";
import { formatTokens, renderReport } from "../src/report";
import type { CaseRun } from "../src/runner";

const passedRun: CaseRun = {
	caseId: "01-ok",
	provider: "claude",
	run: 1,
	passed: true,
	checks: [{ check: { type: "tool_called", name: "crm_compile" }, passed: true, detail: "вызван" }],
	turns: 2,
	failedCrmActions: 0,
	costUsd: 0.5,
	tokens: { inputTokens: 453_000, outputTokens: 8_000, cacheReadTokens: 333_000, cacheWriteTokens: 0 },
	costReported: true,
	durationMs: 12000,
	transcriptFile: "/tmp/x.jsonl",
};

const failedRun: CaseRun = {
	caseId: "02-bad",
	provider: "cursor",
	run: 2,
	passed: false,
	checks: [{ check: { type: "file_contains", path: "a", pattern: "X" }, passed: false, detail: "нет X" }],
	turns: 1,
	failedCrmActions: 1,
	costUsd: 0,
	tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
	costReported: false,
	durationMs: 3000,
	transcriptFile: "/tmp/y.jsonl",
};

describe("renderReport", () => {
	it("shows both runs, marks and failed check detail", () => {
		const text = renderReport([passedRun, failedRun]);
		expect(text).toContain("# Прогон эвалов");
		expect(text).toContain("01-ok");
		expect(text).toContain("02-bad");
		expect(text).toContain("✅");
		expect(text).toContain("❌");
		expect(text).toContain("нет X");
		expect(text).toContain("| 0.50 |");
		expect(text).toContain("### 02-bad (cursor, прогон 2)");
	});

	it("shows an em dash in the cost column when the cost is not reported", () => {
		const text = renderReport([failedRun]);
		expect(text).toContain("| — | 3 |");
	});

	it("formats tokens as input / cache / output", () => {
		const text = renderReport([passedRun]);
		expect(text).toContain("| 453 тыс. / 333 тыс. / 8 тыс. |");
	});

	it("reports success when all runs passed", () => {
		const text = renderReport([passedRun]);
		expect(text).toContain("Все кейсы прошли.");
		expect(text).not.toContain("## Не прошло");
	});

	it("lists notes of passed runs in a separate section", () => {
		const noted: CaseRun = { ...passedRun, error: "уборка: обновление CRM не прошло — ошибка" };
		const text = renderReport([noted]);
		expect(text).toContain("Все кейсы прошли, есть замечания.");
		expect(text).toContain("## Замечания");
		expect(text).toContain("### 01-ok (claude, прогон 1)");
		expect(text).toContain("- уборка: обновление CRM не прошло — ошибка");
		expect(text).not.toContain("## Не прошло");
	});
});

describe("formatTokens", () => {
	it("uses plain numbers below a thousand, thousands and millions", () => {
		expect(formatTokens(999)).toBe("999");
		expect(formatTokens(1_500)).toBe("2 тыс.");
		expect(formatTokens(1_250_000)).toBe("1,3 млн");
	});
});
