import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLocalTools, LOCAL_TOOL_NAMES, LocalToolsOptions, runShellCommand, shellEnv } from "../src/tools/localTools";
import type { AppTool, AppToolResult } from "../src/tools/appTool";
import { buildSeatbeltProfile } from "../src/safety/shellSandbox";

describe("localTools", () => {
	let tmp: string;
	let app: string;
	let pkg: string;
	let kn: string;
	let outside: string;
	let options: LocalToolsOptions;
	let tools: AppTool[];

	const toolsWith = (overrides: Partial<LocalToolsOptions> = {}): AppTool[] => createLocalTools({ ...options, ...overrides });

	const run = async (name: string, args: Record<string, unknown>): Promise<AppToolResult> => {
		const tool = tools.find((t) => t.name === name);
		if (!tool) {
			throw new Error(`Нет инструмента ${name}`);
		}
		return tool.execute(args);
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "local-tools-")));
		app = path.join(tmp, "app");
		pkg = path.join(app, "BPMSoft.Configuration", "Pkg");
		kn = path.join(tmp, "kn");
		outside = path.join(tmp, "outside.txt");

		fs.mkdirSync(path.join(pkg, "TestPkg"), { recursive: true });
		fs.mkdirSync(path.join(kn, "scripts"), { recursive: true });
		fs.writeFileSync(path.join(pkg, "TestPkg", "a.json"), "{\n  \"A\": 1\n}\n");
		fs.writeFileSync(path.join(app, "ConnectionStrings.config"), "password=x\n");
		fs.writeFileSync(path.join(app, "notes.txt"), "password in notes\n");
		fs.writeFileSync(path.join(kn, "scripts", "hello.js"), "console.log(\"hi\")");
		fs.writeFileSync(outside, "outside");

		options = {
			cwd: pkg,
			readRoots: [app],
			writeRoots: [pkg],
			knowledgeDir: kn
		};
		tools = toolsWith();
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("exposes the tools in the documented order", () => {
		expect(tools.map((t) => t.name)).toEqual(LOCAL_TOOL_NAMES);
	});

	describe("read_file", () => {
		it("reads a file with line numbers", async () => {
			const result = await run("read_file", { path: "TestPkg/a.json" });
			expect(result.isError).toBe(false);
			expect(result.text).toContain("     1\t{");
		});

		it("denies a file outside the application folder", async () => {
			const result = await run("read_file", { path: outside });
			expect(result.isError).toBe(true);
		});

		it("denies ConnectionStrings.config", async () => {
			const result = await run("read_file", { path: path.join(app, "ConnectionStrings.config") });
			expect(result.isError).toBe(true);
			expect(result.text).not.toContain("password");
		});

		it("cuts by characters with a hint to continue from the next line", async () => {
			const lines = Array.from({ length: 1000 }, () => "x".repeat(100));
			fs.writeFileSync(path.join(pkg, "TestPkg", "long.txt"), lines.join("\n") + "\n");
			const result = await run("read_file", { path: "TestPkg/long.txt" });
			expect(result.isError).toBe(false);
			expect(result.text.length).toBeLessThanOrEqual(30000);
			const match = result.text.match(/показаны строки 1–(\d+) из 1000 — читай с offset (\d+)/);
			expect(match).not.toBeNull();
			const last = Number(match![1]);
			expect(Number(match![2])).toBe(last + 1);
			expect(result.text).toContain(`${String(last).padStart(6)}\t`);
			expect(result.text).not.toContain(`${String(last + 1).padStart(6)}\t`);
			expect(result.text).not.toContain("[обрезано");
		});

		it("continues from the suggested offset", async () => {
			const lines = Array.from({ length: 1000 }, () => "x".repeat(100));
			fs.writeFileSync(path.join(pkg, "TestPkg", "long.txt"), lines.join("\n") + "\n");
			const first = await run("read_file", { path: "TestPkg/long.txt" });
			const next = Number(first.text.match(/читай с offset (\d+)/)![1]);
			const result = await run("read_file", { path: "TestPkg/long.txt", offset: next });
			expect(result.isError).toBe(false);
			expect(result.text.startsWith(`${String(next).padStart(6)}\t`)).toBe(true);
		});

		it("keeps the line limit hint", async () => {
			const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
			fs.writeFileSync(path.join(pkg, "TestPkg", "short.txt"), lines.join("\n") + "\n");
			const result = await run("read_file", { path: "TestPkg/short.txt", limit: 10 });
			expect(result.text).toContain("показаны строки 1–10 из 30 — читай с offset 11");
		});
	});

	describe("list_dir", () => {
		it("lists Pkg by default and marks folders with a slash", async () => {
			const result = await run("list_dir", {});
			expect(result.isError).toBe(false);
			expect(result.text).toContain("TestPkg/");
		});
	});

	describe("glob_files", () => {
		it("finds files by a pattern relative to Pkg", async () => {
			const result = await run("glob_files", { pattern: "**/*.json" });
			expect(result.isError).toBe(false);
			expect(result.text).toContain(path.join(pkg, "TestPkg", "a.json"));
		});

		it("refuses a pattern with .. or an absolute path", async () => {
			const result = await run("glob_files", { pattern: "../**/*.json" });
			expect(result.isError).toBe(true);
		});
	});

	describe("grep_files", () => {
		it("returns matching lines with line numbers", async () => {
			const result = await run("grep_files", { pattern: "\"A\"", output_mode: "content" });
			expect(result.isError).toBe(false);
			expect(result.text).toContain("a.json");
			expect(result.text).toContain(":2:");
		});

		it("never returns files with secrets", async () => {
			const result = await run("grep_files", { pattern: "password", path: app });
			expect(result.text).toContain("notes.txt");
			expect(result.text).not.toContain("ConnectionStrings.config");
		});
	});

	describe("write_file", () => {
		it("creates a new file inside Pkg", async () => {
			const result = await run("write_file", { path: "TestPkg/new/b.json", content: "{}" });
			expect(result.isError).toBe(false);
			expect(fs.readFileSync(path.join(pkg, "TestPkg", "new", "b.json"), "utf8")).toBe("{}");
		});

		it("refuses to write outside Pkg", async () => {
			const target = path.join(tmp, "outside-new.txt");
			const result = await run("write_file", { path: target, content: "x" });
			expect(result.isError).toBe(true);
			expect(fs.existsSync(target)).toBe(false);
		});
	});

	describe("edit_file", () => {
		it("replaces a unique fragment", async () => {
			const result = await run("edit_file", { path: "TestPkg/a.json", old_string: "\"A\": 1", new_string: "\"A\": 2" });
			expect(result.isError).toBe(false);
			expect(fs.readFileSync(path.join(pkg, "TestPkg", "a.json"), "utf8")).toContain("\"A\": 2");
		});

		it("reports a fragment that is not in the file", async () => {
			const result = await run("edit_file", { path: "TestPkg/a.json", old_string: "\"B\": 1", new_string: "\"B\": 2" });
			expect(result.isError).toBe(true);
		});

		it("refuses a fragment that occurs several times without replace_all", async () => {
			fs.writeFileSync(path.join(pkg, "dup.txt"), "x\nx\n");
			const result = await run("edit_file", { path: "dup.txt", old_string: "x", new_string: "y" });
			expect(result.isError).toBe(true);
			expect(fs.readFileSync(path.join(pkg, "dup.txt"), "utf8")).toBe("x\nx\n");
		});
	});

	describe("edit_file with CRLF files", () => {
		it("matches a multi-line fragment written with \\n in a CRLF file", async () => {
			fs.writeFileSync(path.join(pkg, "crlf.txt"), "a\r\nb\r\nc\r\n");
			const result = await run("edit_file", { path: "crlf.txt", old_string: "a\nb", new_string: "x\ny" });
			expect(result.isError).toBe(false);
			expect(fs.readFileSync(path.join(pkg, "crlf.txt"), "utf8")).toBe("x\r\ny\r\nc\r\n");
		});
	});

	describe("run_shell", () => {
		it.skipIf(process.platform === "win32")("stops a timed-out command with its background processes in time", async () => {
			const start = Date.now();
			const result = await run("run_shell", { command: "sleep 30 & sleep 30; echo done", timeout_ms: 500 });
			expect(result.isError).toBe(true);
			expect(result.text).toContain("таймауту");
			expect(Date.now() - start).toBeLessThan(5000);
		});

		it("runs a command and returns its output", async () => {
			const result = await run("run_shell", { command: "echo hi" });
			expect(result.isError).toBe(false);
			expect(result.text).toContain("hi");
		});

		it("runs a trusted knowledge script without asking", async () => {
			const result = await run("run_shell", { command: `node ${path.join(kn, "scripts", "hello.js")}` });
			expect(result.isError).toBe(false);
			expect(result.text).toContain("hi");
		});

		it("refuses a deletion when nobody can be asked", async () => {
			const result = await run("run_shell", { command: "rm TestPkg/a.json" });
			expect(result.isError).toBe(true);
			expect(fs.existsSync(path.join(pkg, "TestPkg", "a.json"))).toBe(true);
		});

		it("does not delete when the user refuses", async () => {
			const refusing = toolsWith({ requestPermission: async () => false });
			const tool = refusing.find((t) => t.name === "run_shell");
			const result = await tool!.execute({ command: "rm TestPkg/a.json" });
			expect(result.isError).toBe(true);
			expect(result.text).toContain("отклонил");
			expect(fs.existsSync(path.join(pkg, "TestPkg", "a.json"))).toBe(true);
		});

		it("deletes when the user approves", async () => {
			const approving = toolsWith({ requestPermission: async () => true });
			const tool = approving.find((t) => t.name === "run_shell");
			const result = await tool!.execute({ command: "rm TestPkg/a.json" });
			expect(result.isError).toBe(false);
			expect(fs.existsSync(path.join(pkg, "TestPkg", "a.json"))).toBe(false);
		});

		it.skipIf(process.platform !== "darwin")("OS sandbox denies writing to the home folder", async () => {
			const name = `.bpmsoft-agent-seatbelt-test-${process.pid}`;
			const target = path.join(os.homedir(), name);
			try {
				const command = `node -e "require('fs').writeFileSync(require('path').join(require('os').homedir(), '${name}'), '1')"`;
				const result = await run("run_shell", { command });
				expect(result.isError).toBe(true);
				expect(result.text).toContain("EPERM");
				expect(fs.existsSync(target)).toBe(false);
			} finally {
				if (fs.existsSync(target)) {
					fs.rmSync(target, { force: true });
				}
			}
		});

		it("refuses a command that needs approval when the platform has no OS sandbox and nobody can be asked", async () => {
			const windowsTools = toolsWith({ platform: "win32", requestPermission: undefined });
			const tool = windowsTools.find((t) => t.name === "run_shell");
			const result = await tool!.execute({ command: "node -e \"1\"" });
			expect(result.isError).toBe(true);
			expect(result.text).toContain("подтверждения");
		});
	});

	describe("buildSeatbeltProfile", () => {
		it.skipIf(process.platform !== "darwin")("denies network, writes outside the roots and credential folders", () => {
			const profile = buildSeatbeltProfile({ writeRoots: ["/x/Pkg"], readRoots: [], homeDir: "/Users/u", tempDirs: ["/tmp"] });
			expect(profile).toContain("(deny network*)");
			expect(profile).toContain("(subpath \"/x/Pkg\")");
			expect(profile).toContain("/Users/u/.ssh");
		});

		it.skipIf(process.platform !== "darwin")("really lets a command read only inside the read roots", async () => {
			const home = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-home-"));
			try {
				const proj = path.join(home, "proj");
				const pkgDir = path.join(proj, "Pkg");
				const insidePath = path.join(pkgDir, "a.txt");
				const outsidePath = path.join(home, "Documents", "b.txt");
				fs.mkdirSync(pkgDir, { recursive: true });
				fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
				fs.writeFileSync(insidePath, "inside");
				fs.writeFileSync(outsidePath, "outside");
				const profile = buildSeatbeltProfile({ writeRoots: [pkgDir], readRoots: [proj], homeDir: home, pathEnv: "/usr/bin:/bin" });

				const inside = await runShellCommand("cat " + insidePath, { cwd: pkgDir, platform: "darwin", seatbeltProfile: profile, timeoutMs: 10000 });
				expect(inside.output).toContain("inside");
				expect(inside.exitCode).toBe(0);

				const outside = await runShellCommand("cat " + outsidePath, { cwd: pkgDir, platform: "darwin", seatbeltProfile: profile, timeoutMs: 10000 });
				expect(outside.exitCode).not.toBe(0);
				expect(outside.output).not.toContain("outside");
			} finally {
				fs.rmSync(home, { recursive: true, force: true });
			}
		});
	});

	describe("shellEnv", () => {
		it("keeps only system variables", () => {
			expect(shellEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "k", GITHUB_TOKEN: "t", LANG: "ru" })).toEqual({ PATH: "/bin", LANG: "ru" });
		});
	});
});

describe("runShellCommand stop", () => {
	it.skipIf(process.platform === "win32")("kills a running command when the user stops it", async () => {
		const stop = new AbortController();
		setTimeout(() => stop.abort(), 100);
		const started = Date.now();
		const result = await runShellCommand("sleep 5", { cwd: os.tmpdir(), platform: process.platform, timeoutMs: 10000, signal: stop.signal });

		expect(Date.now() - started).toBeLessThan(2000);
		expect(result.stopped).toBe(true);
	});
});
