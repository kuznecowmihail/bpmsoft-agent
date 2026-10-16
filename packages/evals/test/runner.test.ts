import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync, spawnSync } from "child_process";
import type { AgentEvent, CrmActionRecord, CrmTool } from "@bpmsoft-agent/agent-runtime";
import type { EvalCase, EvalConfig } from "../src/caseFile";
import { asksUser, buildQueryArgs, createQueryFn, dirtyFiles, pkgRootOf, resetPackage, runCase, writeTeardownScript } from "../src/runner";
import type { QueryArgs, QueryFn } from "../src/runner";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-runner-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

const hasGit = spawnSync("git", ["--version"]).status === 0;

/** Creates a fake app root with one schema in the test package. */
function makeApp(): { config: EvalConfig; pkgRoot: string; packageDir: string; resultsDir: string } {
	const appRoot = path.join(tmpDir, "app");
	const pkgRoot = path.join(appRoot, "BPMSoft.Configuration", "Pkg");
	const packageDir = path.join(pkgRoot, "TestPkg");
	fs.mkdirSync(path.join(packageDir, "Schemas", "TestA"), { recursive: true });
	fs.writeFileSync(path.join(packageDir, "Schemas", "TestA", "metadata.json"), "{}", "utf8");
	const config: EvalConfig = { appRoot, package: "TestPkg", prefix: "Test", vars: {} };
	return { config, pkgRoot, packageDir, resultsDir: path.join(tmpDir, "results") };
}

/** Fake query: each call yields the events of the next script entry and records its arguments. */
function fakeQuery(script: AgentEvent[][], seen: QueryArgs[], onCall?: (call: number) => void): QueryFn {
	let call = 0;
	return (args) => {
		seen.push(args);
		onCall?.(call);
		const events = script[call] ?? [];
		call++;
		return (async function* () {
			for (const event of events) {
				yield event;
			}
		})();
	};
}

const script: AgentEvent[][] = [
	[
		{ type: "system_init", model: "m", mcpServers: [], sessionId: "s1" } as AgentEvent,
		{ type: "text", text: "Подтвердите запуск?\n<choices>\n? Подтвердите запуск\n- Делай\n</choices>" },
	],
	[
		{ type: "tool_use", name: "mcp__crm__crm_compile", input: {} },
		{ type: "result", success: true, durationMs: 1, sessionId: "s1", totalCostUsd: 0.5 } as AgentEvent,
	],
];

function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
	return {
		id: "c1",
		title: "t",
		task: "задача",
		answers: [{ when: "Подтвержд", text: "Делай" }],
		maxTurns: 5,
		checks: [
			{ type: "tool_called", name: "crm_compile" },
			{ type: "file_exists", path: "Schemas/TestNew/metadata.json" },
		],
		...overrides,
	};
}

const noReset = async (_pkgRoot: string, _packages: string[]): Promise<void> => {};

describe("buildQueryArgs", () => {
	it("gives the claude sandbox read access to the app and write access to Pkg", () => {
		const config: EvalConfig = { appRoot: "/app", package: "TestPkg", prefix: "Test", vars: {} };
		const pkgRoot = pkgRootOf(config);
		const args = buildQueryArgs(config, "claude") as {
			cwd: string;
			sandbox: { readRoots: string[]; writeRoots: string[] };
		};
		expect(args.sandbox.writeRoots).toEqual([pkgRoot]);
		expect(args.sandbox.readRoots).toEqual([config.appRoot]);
		expect(args.cwd).toBe(pkgRoot);
	});

	it("gives the cursor agent the app root as readRoot and Pkg as cwd", () => {
		const config: EvalConfig = { appRoot: "/app", package: "TestPkg", prefix: "Test", vars: {} };
		const args = buildQueryArgs(config, "cursor") as { cwd: string; readRoot: string };
		expect(args.readRoot).toBe(config.appRoot);
		expect(args.cwd).toBe(pkgRootOf(config));
	});
});

describe("runCase", () => {
	it("runs turns with resume, collects tool calls and cost, and passes checks", async () => {
		const { config, pkgRoot, packageDir, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		// The second turn creates the file the result check looks for (preflight runs before any turn).
		const createNew = (call: number): void => {
			if (call === 1) {
				fs.mkdirSync(path.join(packageDir, "Schemas", "TestNew"), { recursive: true });
				fs.writeFileSync(path.join(packageDir, "Schemas", "TestNew", "metadata.json"), "{}", "utf8");
			}
		};
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(script, seen, createNew),
			resultsDir,
			reset: noReset,
		});

		expect(run.turns).toBe(2);
		expect(seen.map((args) => args.prompt)).toEqual(["задача", "Делай"]);
		expect(seen[0].resume).toBeUndefined();
		expect(seen[1].resume).toBe("s1");
		expect(run.passed).toBe(true);
		expect(run.costUsd).toBe(0.5);
		expect(run.error).toBeUndefined();
		expect(pkgRoot).toContain("Pkg");
		expect(fs.readFileSync(run.transcriptFile, "utf8").split("\n").filter(Boolean).length).toBeGreaterThan(0);
	});

	it("does not start the agent when a result check already passes (preflight)", async () => {
		const { config, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		const run = await runCase(
			makeCase({ checks: [{ type: "file_exists", path: "Schemas/TestA/metadata.json" }] }),
			config,
			"claude",
			1,
			{ query: fakeQuery(script, seen), resultsDir, reset: noReset },
		);

		expect(run.passed).toBe(false);
		expect(run.error).toContain("уже выполнен");
		expect(run.turns).toBe(0);
		expect(seen.length).toBe(0);
	});

	it("fails tool_called when maxTurns stops before the tool call", async () => {
		const { config, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		const run = await runCase(makeCase({ maxTurns: 1 }), config, "claude", 1, {
			query: fakeQuery(script, seen),
			resultsDir,
			reset: noReset,
		});

		expect(run.turns).toBe(1);
		expect(run.passed).toBe(false);
		const toolCheck = run.checks.find((check) => check.check.type === "tool_called");
		expect(toolCheck?.passed).toBe(false);
	});

	it("fails with an error when a setup find text is missing", async () => {
		const { config, resultsDir } = makeApp();
		const run = await runCase(
			makeCase({
				setup: [{ type: "replace_in_file", path: "Schemas/TestA/metadata.json", find: "нет такого", replace: "x" }],
			}),
			config,
			"claude",
			1,
			{ query: fakeQuery(script, []), resultsDir, reset: noReset },
		);

		expect(run.passed).toBe(false);
		expect(run.error).toContain("setup");
		expect(run.checks).toEqual([]);
	});

	it("applies setup replacements to the first occurrence", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		fs.writeFileSync(path.join(packageDir, "Schemas", "TestA", "metadata.json"), "a-a", "utf8");
		await runCase(
			makeCase({
				setup: [{ type: "replace_in_file", path: "Schemas/TestA/metadata.json", find: "a", replace: "$&b" }],
				checks: [],
			}),
			config,
			"claude",
			1,
			{ query: fakeQuery(script, []), resultsDir, reset: noReset },
		);
		expect(fs.readFileSync(path.join(packageDir, "Schemas", "TestA", "metadata.json"), "utf8")).toBe("$&b-a");
	});
});

describe("asksUser", () => {
	it("is true for a choices block or a question", () => {
		expect(asksUser("Выберите пакет\n<choices>\n? пакет\n- A\n</choices>")).toBe(true);
		expect(asksUser("Какой пакет?")).toBe(true);
	});

	it("is false for a statement", () => {
		expect(asksUser("Готово.")).toBe(false);
	});
});

describe("runCase turn loop and tokens", () => {
	it("stops without the next answer when the agent did not ask a question", async () => {
		const { config, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		const done: AgentEvent[][] = [[{ type: "text", text: "Готово." } as AgentEvent]];
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(done, seen),
			resultsDir,
			reset: noReset,
		});

		expect(run.turns).toBe(1);
		expect(seen.length).toBe(1);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain('"kind":"stop"');
	});

	it("sums tokens over all result events and leaves cost unreported without totalCostUsd", async () => {
		const { config, resultsDir } = makeApp();
		const usage = (input: number) => ({ inputTokens: input, outputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 0 });
		const twoResults: AgentEvent[][] = [
			[
				{ type: "text", text: "<choices>" } as AgentEvent,
				{ type: "result", success: true, durationMs: 1, usage: usage(5) } as AgentEvent,
				{ type: "result", success: true, durationMs: 1, usage: usage(7) } as AgentEvent,
			],
		];
		const run = await runCase(makeCase({ checks: [] }), config, "claude", 1, {
			query: fakeQuery(twoResults, []),
			resultsDir,
			reset: noReset,
		});

		expect(run.tokens).toEqual({ inputTokens: 12, outputTokens: 20, cacheReadTokens: 200, cacheWriteTokens: 0 });
		expect(run.costReported).toBe(false);
	});
});

describe("runCase answers from rules and recommendations", () => {
	it("answers each question by rule or recommendation and stops when the agent stops asking", async () => {
		const { config, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		const dialog: AgentEvent[][] = [
			[{ type: "text", text: "В каком пакете делать?\n<choices>\n? В каком пакете делать?\n- P1\n- P2\n</choices>" } as AgentEvent],
			[
				{
					type: "text",
					text: "Уточню:\n<choices>\n? Нужна ли колонка?\n* Да\n- Нет\n?* Какие поля вывести?\n* Название\n* Код\n- Описание\n</choices>",
				} as AgentEvent,
			],
			[{ type: "text", text: "План готов.\n<choices>\n? Подтверждаете план?\n- Делай\n- Не делай\n</choices>" } as AgentEvent],
			[{ type: "text", text: "Готово." } as AgentEvent],
		];
		const run = await runCase(
			makeCase({
				answers: [
					{ when: "пакет", text: "P2" },
					{ when: "Подтверждаете план", text: "Делай" },
				],
				maxTurns: 8,
				checks: [],
			}),
			config,
			"claude",
			1,
			{ query: fakeQuery(dialog, seen), resultsDir, reset: noReset },
		);

		expect(seen.map((args) => args.prompt)).toEqual([
			"задача",
			"P2",
			"1. Нужна ли колонка? — Да\n2. Какие поля вывести? — Название, Код",
			"Делай",
		]);
		expect(run.turns).toBe(4);
		expect(run.passed).toBe(true);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain("агент не задал вопрос");
	});

	it("stops when a question has no options and no rule", async () => {
		const { config, resultsDir } = makeApp();
		const seen: QueryArgs[] = [];
		const dialog: AgentEvent[][] = [
			[{ type: "text", text: "<choices>\n? Введите код\n</choices>" } as AgentEvent],
		];
		const run = await runCase(makeCase({ answers: [], checks: [] }), config, "claude", 1, {
			query: fakeQuery(dialog, seen),
			resultsDir,
			reset: noReset,
		});

		expect(seen.length).toBe(1);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain("нет ответа на вопрос");
	});
});

describe("resetPackage", () => {
	it.skipIf(!hasGit)("restores tracked files and removes new ones", async () => {
		const repo = path.join(tmpDir, "repo");
		fs.mkdirSync(path.join(repo, "TestPkg"), { recursive: true });
		execFileSync("git", ["-C", repo, "init"]);
		fs.writeFileSync(path.join(repo, "TestPkg", "a.txt"), "one", "utf8");
		execFileSync("git", ["-C", repo, "add", "."]);
		execFileSync("git", [
			"-C",
			repo,
			"-c",
			"user.email=test@example.com",
			"-c",
			"user.name=test",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"-m",
			"init",
		]);

		fs.writeFileSync(path.join(repo, "TestPkg", "a.txt"), "two", "utf8");
		fs.writeFileSync(path.join(repo, "TestPkg", "new.txt"), "x", "utf8");

		await resetPackage(repo, ["TestPkg"]);

		expect(fs.readFileSync(path.join(repo, "TestPkg", "a.txt"), "utf8")).toBe("one");
		expect(fs.existsSync(path.join(repo, "TestPkg", "new.txt"))).toBe(false);
	});

	it.skipIf(!hasGit)("resets several packages with LF forced despite core.autocrlf", async () => {
		const repo = path.join(tmpDir, "repo");
		fs.mkdirSync(path.join(repo, "P1"), { recursive: true });
		fs.mkdirSync(path.join(repo, "P2"), { recursive: true });
		execFileSync("git", ["init", repo]);
		execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
		execFileSync("git", ["-C", repo, "config", "user.name", "test"]);
		execFileSync("git", ["-C", repo, "config", "commit.gpgsign", "false"]);
		execFileSync("git", ["-C", repo, "config", "core.autocrlf", "true"]);
		fs.writeFileSync(path.join(repo, "P1", "a.txt"), "x\ny\n", "utf8");
		fs.writeFileSync(path.join(repo, "P2", "b.txt"), "x\ny\n", "utf8");
		execFileSync("git", ["-C", repo, "add", "."]);
		execFileSync("git", ["-C", repo, "commit", "-m", "init"]);

		fs.writeFileSync(path.join(repo, "P1", "a.txt"), "changed\n", "utf8");
		fs.writeFileSync(path.join(repo, "P2", "b.txt"), "changed\n", "utf8");
		fs.writeFileSync(path.join(repo, "P2", "new.txt"), "x", "utf8");

		await resetPackage(repo, ["P1", "P2"]);

		expect(fs.readFileSync(path.join(repo, "P1", "a.txt"), "utf8")).toBe("x\ny\n");
		expect(fs.readFileSync(path.join(repo, "P2", "b.txt"), "utf8")).toBe("x\ny\n");
		expect(fs.existsSync(path.join(repo, "P2", "new.txt"))).toBe(false);
		expect(await dirtyFiles(repo, ["P1", "P2"])).toEqual([]);

		fs.writeFileSync(path.join(repo, "P2", "b.txt"), "again\n", "utf8");
		const dirty = await dirtyFiles(repo, ["P1", "P2"]);
		expect(dirty.length).toBe(1);
		expect(dirty[0]).toContain("b.txt");
	});
});

describe("createQueryFn", () => {
	it("throws for cursor without a model", () => {
		const { config } = makeApp();
		const saved = process.env.CURSOR_API_KEY;
		process.env.CURSOR_API_KEY = "test-key";
		try {
			const query = createQueryFn(config, "cursor");
			const args: QueryArgs = {
				prompt: "p",
				requestToolPermission: async () => true,
				appTools: [],
			};
			expect(() => query(args)).toThrow("Для Cursor нужна модель");
		} finally {
			if (saved === undefined) {
				delete process.env.CURSOR_API_KEY;
			} else {
				process.env.CURSOR_API_KEY = saved;
			}
		}
	});
});

describe("runCase baseline update", () => {
	it("fails the case when the baseline CRM update returns an error", async () => {
		const { config, resultsDir } = makeApp();
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => ({ text: "ошибка\nстек", isError: true }),
		};
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: noReset,
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(run.passed).toBe(false);
		expect(run.error).toContain("Исходное обновление CRM не прошло");
	});
});

describe("runCase cleanup", () => {
	it("resets the packages at start and end and updates CRM at baseline and at the end", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		const resets: string[][] = [];
		let updates = 0;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				updates++;
				return { text: "ok", isError: false };
			},
		};
		const createNew = (call: number): void => {
			if (call === 1) {
				fs.mkdirSync(path.join(packageDir, "Schemas", "TestNew"), { recursive: true });
				fs.writeFileSync(path.join(packageDir, "Schemas", "TestNew", "metadata.json"), "{}", "utf8");
			}
		};
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(script, [], createNew),
			resultsDir,
			reset: async (_pkgRoot, packages) => {
				resets.push(packages);
			},
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(run.passed).toBe(true);
		expect(resets).toHaveLength(2);
		expect(updates).toBe(2);
		expect(run.error).toBeUndefined();
	});

	it("resets the packages at the end when setup throws", async () => {
		const { config, resultsDir } = makeApp();
		let resets = 0;
		const run = await runCase(
			makeCase({ setup: [{ path: "Schemas/TestA/metadata.json", find: "не найдено", replace: "x" }] }),
			config,
			"claude",
			1,
			{
				query: fakeQuery(script, []),
				resultsDir,
				reset: async () => {
					resets++;
				},
			},
		);

		expect(run.passed).toBe(false);
		expect(run.error).toContain("setup: не найдено");
		expect(resets).toBe(2);
	});

	it("adds the cleanup error to CaseRun.error when the final reset throws", async () => {
		const { config, resultsDir } = makeApp();
		let calls = 0;
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: async () => {
				calls++;
				if (calls === 2) {
					throw new Error("git недоступен");
				}
			},
		});

		expect(run.error).toContain("уборка:");
		expect(run.error).toContain("git недоступен");
	});

	it("adds a failed final CRM update to CaseRun.error", async () => {
		const { config, resultsDir } = makeApp();
		let updates = 0;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				updates++;
				return updates === 1 ? { text: "ok", isError: false } : { text: "ошибка обновления\nстек", isError: true };
			},
		};
		const run = await runCase(makeCase(), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: async () => {},
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(updates).toBe(2);
		expect(run.error).toBe("уборка: обновление CRM не прошло — ошибка обновления");
	});
});

describe("runCase CRM update settle pause and retry", () => {
	it("waits before the baseline update and retries once when the files are not visible yet", async () => {
		const { config, resultsDir } = makeApp();
		const sleeps: number[] = [];
		let calls = 0;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				calls++;
				return calls === 1
					? { text: "Файл по пути descriptor.json не найден\nстек", isError: true }
					: { text: "ok", isError: false };
			},
		};
		const run = await runCase(makeCase({ checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: noReset,
			crmTools: () => [update],
			settleMs: 3000,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});

		expect(run.error).toBeUndefined();
		expect(calls).toBe(3);
		expect(sleeps).toEqual([3000, 6000, 3000]);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain('"kind":"baseline_update"');
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain('"retried":true');
	});

	it("counts a failed CRM action of the final cleanup update as not a failed action of the turns", async () => {
		const { config, resultsDir } = makeApp();
		let onActionRef: ((r: CrmActionRecord) => void) | undefined;
		let calls = 0;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				calls++;
				if (calls === 2) {
					onActionRef?.({ action: "update", success: false } as CrmActionRecord);
					return { text: "ошибка обновления\nстек", isError: true };
				}
				return { text: "ok", isError: false };
			},
		};
		const run = await runCase(makeCase({ checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: noReset,
			crmTools: (onAction) => {
				onActionRef = onAction;
				return [update];
			},
			settleMs: 0,
		});

		expect(run.error).toContain("уборка:");
		expect(run.failedCrmActions).toBe(0);
	});

	it("counts a failed compile during the agent's turns", async () => {
		const { config, resultsDir } = makeApp();
		let onActionRef: ((r: CrmActionRecord) => void) | undefined;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => ({ text: "ok", isError: false }),
		};
		const run = await runCase(makeCase({ checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, [], (call) => {
				if (call === 0) {
					onActionRef?.({ action: "compile", success: false } as CrmActionRecord);
				}
			}),
			resultsDir,
			reset: noReset,
			crmTools: (onAction) => {
				onActionRef = onAction;
				return [update];
			},
			settleMs: 0,
		});

		expect(run.failedCrmActions).toBe(1);
	});
});

/** Writes a sample SqlScripts folder with a BOM, as the platform writes it. */
function writeSqlSample(packageDir: string): void {
	const dir = path.join(packageDir, "SqlScripts", "S1");
	fs.mkdirSync(dir, { recursive: true });
	const descriptor = {
		SqlScript: {
			UId: "11111111-2222-3333-4444-555555555555",
			Name: "S1",
			DBEngineType: 2,
			InstallType: 1,
			ModifiedOnUtc: "/Date(1)/",
			DependsOn: [],
		},
	};
	fs.writeFileSync(path.join(dir, "descriptor.json"), "﻿" + JSON.stringify(descriptor, null, 2), "utf8");
}

describe("writeTeardownScript", () => {
	it("writes a script folder with a new name, UId and ModifiedOnUtc, copying the sample fields and BOM", () => {
		const packageDir = path.join(tmpDir, "TestPkg");
		writeSqlSample(packageDir);
		const folder = writeTeardownScript(packageDir, "TestEvalTeardown", "DELETE FROM x;", 1700000000000);

		expect(folder).toBe(path.join(packageDir, "SqlScripts", "TestEvalTeardown"));
		const raw = fs.readFileSync(path.join(folder, "descriptor.json"), "utf8");
		expect(raw.startsWith("﻿")).toBe(true);
		const body = JSON.parse(raw.replace(/^﻿/, "")) as { SqlScript: Record<string, unknown> };
		expect(body.SqlScript.Name).toBe("TestEvalTeardown");
		expect(body.SqlScript.UId).not.toBe("11111111-2222-3333-4444-555555555555");
		expect(body.SqlScript.UId).toMatch(/^[0-9a-f-]{36}$/);
		expect(raw).toContain(String.raw`\/Date(1700000000000)\/`);
		expect(body.SqlScript.ModifiedOnUtc).toBe("/Date(1700000000000)/");
		expect(body.SqlScript.DBEngineType).toBe(2);
		expect(body.SqlScript.InstallType).toBe(1);
		expect(fs.readFileSync(path.join(folder, "TestEvalTeardown.sql"), "utf8")).toBe("DELETE FROM x;");
	});

	it("throws when the package has no sample SQL script", () => {
		const packageDir = path.join(tmpDir, "TestPkg");
		fs.mkdirSync(packageDir, { recursive: true });
		expect(() => writeTeardownScript(packageDir, "TestEvalTeardown", "SELECT 1;")).toThrow("нет образца");
	});
});

describe("runCase teardown", () => {
	it("runs the teardown before the baseline and after the turns, with the script present only in the first update of each teardown", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		writeSqlSample(packageDir);
		const scriptDir = path.join(packageDir, "SqlScripts", "TestEvalTeardown");
		const events: string[] = [];
		const seenSql: string[] = [];
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				const sqlFile = path.join(scriptDir, "TestEvalTeardown.sql");
				if (fs.existsSync(sqlFile)) {
					seenSql.push(fs.readFileSync(sqlFile, "utf8"));
					events.push("update:script");
				} else {
					events.push("update:plain");
				}
				return { text: "ok", isError: false };
			},
		};
		const run = await runCase(makeCase({ teardownSql: "DELETE FROM x;", checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: async () => {
				events.push("reset");
				fs.rmSync(scriptDir, { recursive: true, force: true });
			},
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(run.error).toBeUndefined();
		expect(events).toEqual([
			"reset",
			"update:script",
			"reset",
			"update:plain",
			"update:plain",
			"update:script",
			"reset",
			"update:plain",
			"reset",
			"update:plain",
		]);
		expect(seenSql).toEqual(["DELETE FROM x;", "DELETE FROM x;"]);
	});

	it("skips the teardown when the case has no teardownSql", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		writeSqlSample(packageDir);
		let updates = 0;
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				updates++;
				return { text: "ok", isError: false };
			},
		};
		await runCase(makeCase({ checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, []),
			resultsDir,
			reset: noReset,
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(updates).toBe(2);
		expect(fs.existsSync(path.join(packageDir, "SqlScripts", "TestEvalTeardown"))).toBe(false);
	});
});

describe("runCase setupSql", () => {
	it("runs setupSql after the teardown and before the baseline update", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		writeSqlSample(packageDir);
		const events: string[] = [];
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				const present = ["TestEvalTeardown", "TestEvalSetup"].filter((name) =>
					fs.existsSync(path.join(packageDir, "SqlScripts", name, `${name}.sql`)),
				);
				events.push(`update:${present.join("+") || "plain"}`);
				return { text: "ok", isError: false };
			},
		};
		const run = await runCase(
			makeCase({ teardownSql: "DELETE FROM x;", setupSql: "INSERT INTO x VALUES (1);", checks: [] }),
			config,
			"claude",
			1,
			{
				query: fakeQuery(script, []),
				resultsDir,
				reset: async () => {
					events.push("reset");
					fs.rmSync(path.join(packageDir, "SqlScripts", "TestEvalTeardown"), { recursive: true, force: true });
					fs.rmSync(path.join(packageDir, "SqlScripts", "TestEvalSetup"), { recursive: true, force: true });
				},
				crmTools: () => [update],
				settleMs: 0,
			},
		);

		expect(run.error).toBeUndefined();
		expect(events).toEqual([
			"reset",
			"update:TestEvalTeardown",
			"reset",
			"update:plain",
			"update:TestEvalSetup",
			"reset",
			"update:plain",
			"update:plain",
			"update:TestEvalTeardown",
			"reset",
			"update:plain",
			"reset",
			"update:plain",
		]);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain('"kind":"setup_sql"');
	});

	it("fails the case when setupSql has no CRM tools", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		writeSqlSample(packageDir);
		const seen: QueryArgs[] = [];
		const run = await runCase(makeCase({ setupSql: "SELECT 1;", checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, seen),
			resultsDir,
			reset: async () => {},
			settleMs: 0,
		});

		expect(run.passed).toBe(false);
		expect(run.error).toContain("setupSql: нет CRM-инструментов");
		expect(seen).toHaveLength(0);
	});

	it("stops the case with setupSql error and still runs the cleanup", async () => {
		const { config, packageDir, resultsDir } = makeApp();
		writeSqlSample(packageDir);
		const seen: QueryArgs[] = [];
		const update: CrmTool = {
			name: "crm_update_from_fs",
			description: "fake",
			execute: async () => {
				const setupPresent = fs.existsSync(path.join(packageDir, "SqlScripts", "TestEvalSetup", "TestEvalSetup.sql"));
				return setupPresent ? { text: "ошибка SQL\nстек", isError: true } : { text: "ok", isError: false };
			},
		};
		const run = await runCase(makeCase({ setupSql: "SELECT broken;", checks: [] }), config, "claude", 1, {
			query: fakeQuery(script, seen),
			resultsDir,
			reset: async () => {
				fs.rmSync(path.join(packageDir, "SqlScripts", "TestEvalSetup"), { recursive: true, force: true });
			},
			crmTools: () => [update],
			settleMs: 0,
		});

		expect(run.passed).toBe(false);
		expect(run.error).toBe("setupSql: ошибка SQL");
		expect(seen).toHaveLength(0);
		expect(fs.readFileSync(run.transcriptFile, "utf8")).toContain('"kind":"setup_sql"');
	});
});

describe("runCase timeline checks", () => {
	it("passes the timeline to no_unasked_destructive_sql", async () => {
		const { config, resultsDir } = makeApp();
		const junkScript: AgentEvent[][] = [
			[
				{ type: "text", text: "нашёл дубли «Телефон»" },
				{ type: "tool_use", name: "Write", input: { file_path: "SqlScripts/TestX/TestX.sql", content: "DELETE FROM t" } },
				{ type: "result", success: true, durationMs: 1, sessionId: "s1", totalCostUsd: 0 } as AgentEvent,
			],
		];
		const run = await runCase(
			makeCase({ checks: [{ type: "no_unasked_destructive_sql" }] }),
			config,
			"claude",
			1,
			{ query: fakeQuery(junkScript, []), resultsDir, reset: noReset },
		);

		expect(run.checks[0].passed).toBe(false);
		expect(run.checks[0].detail).toBe("SQL с DELETE/UPDATE записан в ходе 0 без вопроса пользователю");
	});
});
