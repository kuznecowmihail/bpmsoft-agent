import { describe, it, expect } from "vitest";
import { findGitBash, GitBashLookup } from "../src/tools/gitBash";

/** Fake file system: only the listed win32 paths exist. */
function lookupWith(files: string[], env: NodeJS.ProcessEnv = {}, platform: NodeJS.Platform = "win32"): GitBashLookup {
	const existing = new Set(files.map((file) => file.toLowerCase()));
	return { platform, env, exists: (p: string) => existing.has(p.toLowerCase()) };
}

const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";

describe("findGitBash", () => {
	it("returns /bin/bash outside Windows", () => {
		expect(findGitBash(lookupWith([], {}, "darwin"))).toBe("/bin/bash");
	});

	it("uses the CLAUDE_CODE_GIT_BASH_PATH override", () => {
		const override = "D:\\tools\\git\\bin\\bash.exe";
		expect(findGitBash(lookupWith([override, GIT_BASH], { CLAUDE_CODE_GIT_BASH_PATH: override }))).toBe(override);
	});

	it("finds bash next to git.exe from a PATH entry in cmd", () => {
		const env = { PATH: "C:\\Windows;C:\\Program Files\\Git\\cmd" };
		expect(findGitBash(lookupWith(["C:\\Program Files\\Git\\cmd\\git.exe", GIT_BASH], env))).toBe(GIT_BASH);
	});

	it("finds bash from a PATH entry in mingw64\\bin", () => {
		const env = { PATH: "C:\\Program Files\\Git\\mingw64\\bin" };
		expect(findGitBash(lookupWith(["C:\\Program Files\\Git\\mingw64\\bin\\git.exe", GIT_BASH], env))).toBe(GIT_BASH);
	});

	it("ignores System32 in PATH and never returns the WSL bash", () => {
		const env = { PATH: "C:\\Windows\\System32;C:\\Windows\\system32\\wbem" };
		const files = ["C:\\Windows\\System32\\git.exe", "C:\\Windows\\System32\\bash.exe", "C:\\Windows\\bin\\bash.exe"];
		expect(findGitBash(lookupWith(files, env))).toBeNull();
	});

	it("falls back to ProgramFiles", () => {
		const env = { ProgramFiles: "C:\\Program Files" };
		expect(findGitBash(lookupWith([GIT_BASH], env))).toBe(GIT_BASH);
	});

	it("falls back to ProgramW6432", () => {
		const env = { ProgramW6432: "C:\\Program Files" };
		expect(findGitBash(lookupWith([GIT_BASH], env))).toBe(GIT_BASH);
	});

	it("falls back to LOCALAPPDATA", () => {
		const local = "C:\\Users\\user\\AppData\\Local";
		const bash = `${local}\\Programs\\Git\\bin\\bash.exe`;
		expect(findGitBash(lookupWith([bash], { LOCALAPPDATA: local }))).toBe(bash);
	});

	it("returns null when Git Bash is nowhere", () => {
		expect(findGitBash(lookupWith([], { ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local" }))).toBeNull();
	});
});
