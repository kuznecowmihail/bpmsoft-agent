import { describe, it, expect } from "vitest";
import { findOnPath, missingSandboxTools, osShellSandboxAvailable } from "../src/safety/shellSandbox";
import { isMsysRoot, checkBashCommand } from "../src/safety/sandboxGuard";
import { resolveWindowsBash } from "../src/tools/localTools";
import { promptPath } from "../src/provider/systemPrompt";

describe("findOnPath", () => {
	it("finds the first folder of the PATH that has the file", () => {
		const present = new Set(["/b/tool"]);
		expect(findOnPath("tool", "/a:/b:/c", "linux", (file) => present.has(file))).toBe("/b/tool");
	});

	it("returns undefined when no folder has the file", () => {
		expect(findOnPath("tool", "/a:/b", "linux", () => false)).toBeUndefined();
	});

	it("tries Windows extensions and splits the PATH by semicolons on win32", () => {
		const present = new Set(["C:\\Git\\cmd\\git.exe"]);
		expect(findOnPath("git", "C:\\Windows;C:\\Git\\cmd", "win32", (file) => present.has(file))).toBe("C:\\Git\\cmd\\git.exe");
	});
});

describe("Linux sandbox availability", () => {
	it("reports the tools missing from the PATH on Linux only", () => {
		expect(missingSandboxTools("linux", "/nonexistent-folder-for-test")).toEqual(["bwrap", "socat"]);
		expect(missingSandboxTools("darwin", "/nonexistent-folder-for-test")).toEqual([]);
		expect(missingSandboxTools("win32", "")).toEqual([]);
	});

	it("is false on Linux without bubblewrap and socat, without starting any program", () => {
		let probed = false;
		expect(osShellSandboxAvailable("linux", "/nonexistent-folder-for-test", () => ((probed = true), true))).toBe(false);
		expect(probed).toBe(false);
	});

	const installed = (file: string) => file === "/usr/bin/bwrap" || file === "/usr/bin/socat";

	it("is true on Linux when both tools are installed and bubblewrap starts", () => {
		expect(osShellSandboxAvailable("linux", "/usr/bin", () => true, installed)).toBe(true);
	});

	it("is false on Linux when bubblewrap is installed but cannot create namespaces", () => {
		expect(osShellSandboxAvailable("linux", "/usr/bin", () => false, installed)).toBe(false);
	});

	it("is false on Linux when only bubblewrap is installed", () => {
		expect(missingSandboxTools("linux", "/usr/bin", (file) => file === "/usr/bin/bwrap")).toEqual(["socat"]);
		expect(osShellSandboxAvailable("linux", "/usr/bin", () => true, (file) => file === "/usr/bin/bwrap")).toBe(false);
	});

	it("is true on macOS and false on Windows regardless of the PATH", () => {
		expect(osShellSandboxAvailable("darwin", "", () => false)).toBe(true);
		expect(osShellSandboxAvailable("win32", "C:\\Windows", () => true)).toBe(false);
	});
});

describe("resolveWindowsBash", () => {
	const exists = (...files: string[]) => {
		const set = new Set(files);
		return (file: string) => set.has(file);
	};

	it("takes CLAUDE_CODE_GIT_BASH_PATH first", () => {
		const bash = "D:\\tools\\git\\bin\\bash.exe";
		expect(resolveWindowsBash({ CLAUDE_CODE_GIT_BASH_PATH: bash, ProgramFiles: "C:\\Program Files" }, exists(bash, "C:\\Program Files\\Git\\bin\\bash.exe"))).toBe(bash);
	});

	it("finds Git for Windows in Program Files when bash is not on the PATH", () => {
		const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
		expect(resolveWindowsBash({ ProgramFiles: "C:\\Program Files", PATH: "C:\\Windows\\System32" }, exists(bash))).toBe(bash);
	});

	it("finds Git installed per user", () => {
		const bash = "C:\\Users\\u\\AppData\\Local\\Programs\\Git\\bin\\bash.exe";
		expect(resolveWindowsBash({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, exists(bash))).toBe(bash);
	});

	it("finds bash next to the git.exe found on the PATH", () => {
		const git = "E:\\scoop\\apps\\git\\current\\cmd\\git.exe";
		const bash = "E:\\scoop\\apps\\git\\current\\bin\\bash.exe";
		expect(resolveWindowsBash({ PATH: "C:\\Windows;E:\\scoop\\apps\\git\\current\\cmd" }, exists(git, bash))).toBe(bash);
	});

	it("never returns the WSL launcher", () => {
		const wsl = "C:\\Windows\\System32\\bash.exe";
		expect(resolveWindowsBash({ PATH: "C:\\Windows\\System32" }, exists(wsl))).toBe("bash");
		expect(resolveWindowsBash({ CLAUDE_CODE_GIT_BASH_PATH: wsl }, exists(wsl))).toBe("bash");
	});

	it("takes a bash.exe from the PATH when nothing else is found", () => {
		const bash = "D:\\msys64\\usr\\bin\\bash.exe";
		expect(resolveWindowsBash({ PATH: "C:\\Windows\\System32;D:\\msys64\\usr\\bin" }, exists(bash, "C:\\Windows\\System32\\bash.exe"))).toBe(bash);
	});

	it("falls back to a bare bash", () => {
		expect(resolveWindowsBash({}, () => false)).toBe("bash");
	});
});

describe("Git Bash roots on Windows", () => {
	it("treats POSIX top-level folders as filesystem paths on win32 only", () => {
		expect(isMsysRoot("etc", "win32")).toBe(true);
		expect(isMsysRoot("TMP", "win32")).toBe(true);
		expect(isMsysRoot("etc", "linux")).toBe(false);
		expect(isMsysRoot("Pkg", "win32")).toBe(false);
	});

	it("denies reading /etc from a command under any platform's rules", () => {
		const policy = { readRoots: ["/project"], writeRoots: ["/project/Pkg"] };
		const decision = checkBashCommand("cat /etc/passwd", "/project/Pkg", policy);
		expect(decision.allowed).toBe(false);
	});
});

describe("promptPath", () => {
	it("turns backslashes into slashes on Windows", () => {
		expect(promptPath("C:\\Users\\u\\knowledge", "win32")).toBe("C:/Users/u/knowledge");
	});

	it("leaves other platforms alone", () => {
		expect(promptPath("/home/u/knowledge", "linux")).toBe("/home/u/knowledge");
		expect(promptPath("/Users/u/knowledge", "darwin")).toBe("/Users/u/knowledge");
	});
});
