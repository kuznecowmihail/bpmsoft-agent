import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli";

describe("parseArgs", () => {
	it("parses case, and runs", () => {
		const options = parseArgs(["--case", "01", "--runs", "2"], "darwin");
		expect(options.caseId).toBe("01");
		expect(options.runs).toBe(2);
		expect(options.allowUnsandboxedShell).toBe(false);
	});

	it("parses provider and model", () => {
		const options = parseArgs(["--provider", "cursor", "--model", "composer-2.5"], "darwin");
		expect(options.provider).toBe("cursor");
		expect(options.model).toBe("composer-2.5");
	});

	it("requires provider together with model", () => {
		expect(() => parseArgs(["--model", "x"], "darwin")).toThrow("--provider");
	});

	it("accepts model together with provider", () => {
		expect(() => parseArgs(["--provider", "cursor", "--model", "x"], "darwin")).not.toThrow();
	});

	it("rejects unknown flags", () => {
		expect(() => parseArgs(["--bad"], "darwin")).toThrow("Неизвестный параметр --bad");
	});

	it("rejects non-positive runs", () => {
		expect(() => parseArgs(["--runs", "0"], "darwin")).toThrow();
	});

	it("requires the unsandboxed flag on windows", () => {
		expect(() => parseArgs([], "win32")).toThrow("--allow-unsandboxed-shell");
	});

	it("accepts the unsandboxed flag on windows", () => {
		const options = parseArgs(["--allow-unsandboxed-shell"], "win32");
		expect(options.allowUnsandboxedShell).toBe(true);
	});

	it("rejects the removed discard-changes flag", () => {
		expect(() => parseArgs(["--discard-changes"], "darwin")).toThrow("Неизвестный параметр --discard-changes");
	});
});
