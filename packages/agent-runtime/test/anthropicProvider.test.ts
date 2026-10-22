import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import { sdkToolResultsDirectory, foregroundToolInput, agentEnv, NONESSENTIAL_TRAFFIC_OFF } from "../src/provider/anthropicProvider";

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

describe("agentEnv", () => {
	it("turns off non-essential traffic of Claude Code", () => {
		const env = agentEnv("key", {});
		expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
		expect(env.DISABLE_TELEMETRY).toBe("1");
		expect(env.DISABLE_ERROR_REPORTING).toBe("1");
		expect(env.DISABLE_FEEDBACK_COMMAND).toBe("1");
	});

	it("passes the API key and keeps the rest of the environment", () => {
		const env = agentEnv("key", { PATH: "/bin" });
		expect(env.ANTHROPIC_API_KEY).toBe("key");
		expect(env.PATH).toBe("/bin");
	});

	it("overrides switches that were turned back on in the environment", () => {
		const env = agentEnv("key", { DISABLE_TELEMETRY: "0", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "" });
		expect(env).toMatchObject(NONESSENTIAL_TRAFFIC_OFF);
	});
});
