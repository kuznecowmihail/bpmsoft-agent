import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import { sdkToolResultsDirectory, foregroundToolInput } from "../src/provider/anthropicProvider";

describe("sdkToolResultsDirectory", () => {
	it("computes the SDK tool results directory path correctly", () => {
		const cwd = "/Users/a/crm/BPMSoft.Configuration/Pkg";
		const result = sdkToolResultsDirectory(cwd);
		const expected = path.join(os.homedir(), ".claude", "projects", "-Users-a-crm-BPMSoft-Configuration-Pkg");
		expect(result).toBe(expected);
	});

	it("replaces all non-alphanumeric characters with hyphens", () => {
		const cwd = "/path/with@special#chars$/folder";
		const result = sdkToolResultsDirectory(cwd);
		const resolved = path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-");
		const expected = path.join(os.homedir(), ".claude", "projects", resolved);
		expect(result).toBe(expected);
	});

	it("handles paths with only alphanumeric characters", () => {
		const cwd = "/home/user/myproject";
		const result = sdkToolResultsDirectory(cwd);
		// Path.resolve and the regex replace will convert "/" to "-"
		const normalized = path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-");
		const expected = path.join(os.homedir(), ".claude", "projects", normalized);
		expect(result).toBe(expected);
	});
});

describe("foregroundToolInput", () => {
	it("forces Agent without run_in_background to foreground and keeps other fields", () => {
		const input = { description: "研究", prompt: "найди файлы", subagent_type: "Explore" };
		expect(foregroundToolInput("Agent", input)).toEqual({ ...input, run_in_background: false });
	});

	it("forces Agent with run_in_background: true to foreground", () => {
		expect(foregroundToolInput("Agent", { prompt: "x", run_in_background: true })).toEqual({ prompt: "x", run_in_background: false });
	});

	it("leaves Agent with run_in_background: false unchanged", () => {
		expect(foregroundToolInput("Agent", { prompt: "x", run_in_background: false })).toBeUndefined();
	});

	it("handles the older Task name the same way as Agent", () => {
		expect(foregroundToolInput("Task", { prompt: "x" })).toEqual({ prompt: "x", run_in_background: false });
	});

	it("leaves Bash without the flag unchanged", () => {
		expect(foregroundToolInput("Bash", { command: "ls" })).toBeUndefined();
	});

	it("forces Bash with run_in_background: true to foreground", () => {
		expect(foregroundToolInput("Bash", { command: "ls", run_in_background: true })).toEqual({ command: "ls", run_in_background: false });
	});

	it("leaves other tools unchanged", () => {
		expect(foregroundToolInput("Read", { file_path: "/a/b.txt" })).toBeUndefined();
	});
});
