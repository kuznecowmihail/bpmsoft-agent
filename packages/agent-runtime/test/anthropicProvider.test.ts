import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import { sdkToolResultsDirectory } from "../src/provider/anthropicProvider";

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
