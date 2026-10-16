import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { loadCase, loadConfig } from "../src/caseFile";

const casesDir = path.join(__dirname, "..", "cases");
const config = loadConfig(path.join(__dirname, "..", "local.example.json"));
const caseFiles = fs.readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort();

describe("eval cases", () => {
	it("has case files", () => {
		expect(caseFiles.length).toBeGreaterThan(0);
	});

	for (const name of caseFiles) {
		it(`${name} loads`, () => {
			const result = loadCase(path.join(casesDir, name), config);
			expect(() => loadCase(path.join(casesDir, name), config)).not.toThrow();
			expect(result.task.trim()).not.toBe("");
			expect(result.maxTurns).toBeGreaterThan(0);
			expect(result.checks.length).toBeGreaterThan(0);
			for (const rule of result.answers ?? []) {
				expect(typeof rule.when).toBe("string");
				expect(typeof rule.text).toBe("string");
				expect(() => new RegExp(rule.when, "i")).not.toThrow();
			}
			expect(JSON.stringify(result)).not.toContain("{{");
		});
	}
});
