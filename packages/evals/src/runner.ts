import * as fs from "fs";
import * as path from "path";
import {
	createPkgLintTool,
	listChangedFiles,
	lintChanged,
	runBpmsoftAgentQuery,
	runCursorAgentQuery,
} from "@bpmsoft-agent/agent-runtime";
import type {
	AgentEvent,
	AppTool,
	CrmActionRecord,
	CrmDbTool,
	CrmTool,
	RunBpmsoftAgentQueryOptions,
	RunCursorAgentQueryOptions,
	ToolPermissionRequest,
	TokenUsage,
} from "@bpmsoft-agent/agent-runtime";
import { chooseAnswer } from "./answers";
import type { EvalCase, EvalConfig } from "./caseFile";
import { RESULT_CHECK_TYPES, runChecks } from "./checks";
import type { CheckContext, CheckResult, TimelineEvent } from "./checks";
import {
	PRODUCT_CORE,
	applyFixtures,
	readPackageUid,
	resetEvalPackage,
	snapshotPackage,
	writeSqlScript,
} from "./evalPackage";

export type Provider = "claude" | "cursor";

/** Arguments of one agent turn. */
export interface QueryArgs {
	prompt: string;
	resume?: string;
	requestToolPermission: (request: ToolPermissionRequest) => Promise<boolean>;
	crmTools?: CrmTool[];
	dbTool?: CrmDbTool;
	appTools: AppTool[];
}

export type QueryFn = (args: QueryArgs) => AsyncIterable<AgentEvent>;

/** Result of one run of one case. */
export interface CaseRun {
	caseId: string;
	provider: Provider;
	run: number;
	passed: boolean;
	checks: CheckResult[];
	turns: number;
	failedCrmActions: number;
	costUsd: number;
	/** Tokens summed over all result events of the run. */
	tokens: TokenUsage;
	/** True when the runtime reported the cost (at least one result had totalCostUsd). */
	costReported: boolean;
	durationMs: number;
	transcriptFile: string;
	error?: string;
}

/** True when the agent's text asks the user something: a <choices> block or a question at the end. */
export function asksUser(text: string): boolean {
	return text.includes("<choices>") || /\?\s*$/.test(text.trim());
}

/** Pkg folder of the opened application: the agent's working area. */
export function pkgRootOf(config: EvalConfig): string {
	return path.join(config.appRoot, "BPMSoft.Configuration", "Pkg");
}

/** Sandbox and folder options identical to the desktop app. */
export function buildQueryArgs(config: EvalConfig, provider: Provider): Record<string, unknown> {
	const pkgRoot = pkgRootOf(config);
	if (provider === "claude") {
		return {
			cwd: pkgRoot,
			sandbox: { readRoots: [config.appRoot], writeRoots: [pkgRoot] },
			additionalDirectories: [config.appRoot],
		};
	}
	return { cwd: pkgRoot, readRoot: config.appRoot };
}

/** Builds the query function for a provider. API keys come from environment variables only. */
export function createQueryFn(config: EvalConfig, provider: Provider, model?: string): QueryFn {
	const chosen = model ?? config.models?.[provider];
	return (args) => {
		if (provider === "claude") {
			const apiKey = process.env.ANTHROPIC_API_KEY;
			if (!apiKey) {
				throw new Error("Нет переменной окружения ANTHROPIC_API_KEY");
			}
			return runBpmsoftAgentQuery({
				...buildQueryArgs(config, "claude"),
				apiKey,
				model: chosen,
				prompt: args.prompt,
				resume: args.resume,
				requestToolPermission: args.requestToolPermission,
				crmTools: args.crmTools,
				dbTool: args.dbTool,
				appTools: args.appTools,
			} as unknown as RunBpmsoftAgentQueryOptions);
		}
		const apiKey = process.env.CURSOR_API_KEY;
		if (!apiKey) {
			throw new Error("Нет переменной окружения CURSOR_API_KEY");
		}
		if (!chosen) {
			throw new Error("Для Cursor нужна модель: укажите models.cursor в local.json или --model");
		}
		return runCursorAgentQuery({
			...buildQueryArgs(config, "cursor"),
			apiKey,
			model: chosen,
			prompt: args.prompt,
			resume: args.resume,
			requestToolPermission: args.requestToolPermission,
			crmTools: args.crmTools,
			dbTool: args.dbTool,
			appTools: args.appTools,
		} as unknown as RunCursorAgentQueryOptions);
	};
}

/** Replaces the first occurrence, matching line endings of the file (CRLF or LF). */
function applySetup(text: string, find: string, replace: string): string | undefined {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const needle = find.replace(/\r?\n/g, eol);
	if (!text.includes(needle)) {
		return undefined;
	}
	const replacement = replace.replace(/\r?\n/g, eol);
	return text.replace(needle, () => replacement);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Pause before CRM update, so the shared folder of the stand catches up with the files. */
const DEFAULT_SETTLE_MS = 3000;

/** Errors of CRM update that mean the files are not visible to the stand yet. */
const NOT_VISIBLE_YET = /не найден|FileNotFound|InvalidDescriptorInFileSystem/i;

/**
 * Updates CRM from the file system after a settle pause. On a "file not found" error waits twice as long and retries once.
 */
async function updateWithRetry(
	tool: CrmTool,
	sleep: (ms: number) => Promise<void>,
	settleMs: number,
): Promise<{ text: string; isError: boolean; retried: boolean }> {
	await sleep(settleMs);
	let result = await tool.execute();
	if (result.isError && NOT_VISIBLE_YET.test(result.text)) {
		await sleep(settleMs * 2);
		result = await tool.execute();
		return { text: result.text, isError: result.isError, retried: true };
	}
	return { text: result.text, isError: result.isError, retried: false };
}

/** First line of CRM text, for logs and errors. */
function firstLine(text: string): string {
	return text.split("\n")[0];
}

/** Runs one case once: resets the package, applies setup, runs turns, then checks. */
export async function runCase(
	evalCase: EvalCase,
	config: EvalConfig,
	provider: Provider,
	run: number,
	deps: {
		query: QueryFn;
		resultsDir: string;
		crmTools?: (onAction: (r: CrmActionRecord) => void, ownSince: () => number) => CrmTool[] | undefined;
		dbTool?: CrmDbTool;
		/** Empties the eval package before and after the case. Default resetEvalPackage. */
		reset?: (packageDir: string) => void | Promise<void>;
		/** Folder with fixtures (packages/evals/fixtures). Default: fixtures next to src. */
		fixturesDir?: string;
		/** UId of the eval package for fixtures. Default: read from the package descriptor.json. */
		packageUId?: string;
		/** Pause before each CRM update, ms. Default 3000. */
		settleMs?: number;
		/** Pause implementation, for tests. Default: setTimeout. */
		sleep?: (ms: number) => Promise<void>;
	},
): Promise<CaseRun> {
	const started = Date.now();
	const transcriptFile = path.join(deps.resultsDir, `${evalCase.id}-${provider}-${run}.jsonl`);
	const pkgRoot = pkgRootOf(config);
	const packageDir = path.join(pkgRoot, config.package);
	const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS;
	const sleep = deps.sleep ?? defaultSleep;
	const reset = deps.reset ?? ((dir: string) => resetEvalPackage(dir, config.dependsOn ?? [PRODUCT_CORE]));
	const fixturesDir = deps.fixturesDir ?? path.join(__dirname, "..", "fixtures");
	const toolNames: string[] = [];
	/** Prompts, agent texts and tool calls of the turns in order, for checks. */
	const timeline: TimelineEvent[] = [];
	/** CRM actions of the agent's turns only: they count as failed CRM actions. */
	const turnActionRecords: CrmActionRecord[] = [];
	let inTurns = false;
	let checks: CheckResult[] = [];
	let turns = 0;
	let costUsd = 0;
	let costReported = false;
	const tokens: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
	let lastCompileOkAt: number | undefined;
	let resume: string | undefined;
	let passed = false;
	let error: string | undefined;
	let crmTools: CrmTool[] | undefined;

	fs.mkdirSync(deps.resultsDir, { recursive: true });
	const log = (kind: string, data: object): void => {
		fs.appendFileSync(transcriptFile, JSON.stringify({ t: Date.now(), kind, ...data }) + "\n", "utf8");
	};

	const onAction = (record: CrmActionRecord): void => {
		if (inTurns) {
			turnActionRecords.push(record);
		}
		log("crm_action", record);
		if (record.action === "compile" && record.success) {
			lastCompileOkAt = Date.now();
		}
	};
	let since = Date.now();

	/**
	 * Runs SQL through a temporary package SQL script: writes the script, updates CRM (the platform runs it),
	 * resets the package (removes the script) and updates CRM again. Teardowns are skipped without a CRM update tool;
	 * "before" and "after" are teardowns, "setup" is the case's setupSql and throws without a CRM update tool.
	 */
	const runSql = async (sql: string, label: "before" | "after" | "setup"): Promise<void> => {
		const update = crmTools?.find((tool) => tool.name === "crm_update_from_fs");
		const isSetup = label === "setup";
		if (!update) {
			if (isSetup) {
				throw new Error("setupSql: нет CRM-инструментов — данные кейса не подготовить");
			}
			return;
		}
		const scriptName = `${config.prefix}${isSetup ? "EvalSetup" : "EvalTeardown"}`;
		writeSqlScript(packageDir, scriptName, sql);
		const first = await updateWithRetry(update, sleep, settleMs);
		await reset(packageDir);
		const second = await updateWithRetry(update, sleep, settleMs);
		const isError = first.isError || second.isError;
		if (isSetup) {
			log("setup_sql", { scriptUpdate: firstLine(first.text), isError });
			if (first.isError) {
				throw new Error(`setupSql: ${firstLine(first.text)}`);
			}
			return;
		}
		log("teardown", { phase: label, scriptUpdate: firstLine(first.text), isError });
		if (first.isError) {
			throw new Error(`teardown (${label}): ${firstLine(first.text)}`);
		}
	};

	try {
		await reset(packageDir);
		crmTools = deps.crmTools?.(onAction, () => since);
		if (evalCase.teardownSql) {
			await runSql(evalCase.teardownSql, "before");
		}
		if (evalCase.setupSql) {
			await runSql(evalCase.setupSql, "setup");
		}
		if (evalCase.fixtures && evalCase.fixtures.length > 0) {
			const packageUId = deps.packageUId ?? readPackageUid(packageDir);
			applyFixtures(fixturesDir, evalCase.fixtures, packageDir, {
				package: config.package,
				prefix: config.prefix,
				packageUId,
				now: String(Date.now()),
			});
		}

		for (const setup of evalCase.setup ?? []) {
			const file = path.join(packageDir, ...setup.path.split("/"));
			const text = fs.readFileSync(file, "utf8");
			const updated = applySetup(text, setup.find, setup.replace);
			if (updated === undefined) {
				throw new Error(`setup: не найдено "${setup.find}" в ${setup.path}`);
			}
			fs.writeFileSync(file, updated, "utf8");
		}

		if (crmTools) {
			const update = crmTools.find((tool) => tool.name === "crm_update_from_fs");
			if (update) {
				const result = await updateWithRetry(update, sleep, settleMs);
				log("baseline_update", { text: result.text, isError: result.isError, retried: result.retried });
				if (result.isError) {
					throw new Error(
						`Исходное обновление CRM не прошло — стенд не в исходном состоянии: ${result.text.split("\n")[0]}`,
					);
				}
			}
			since = Date.now();
		}

		const baseline = snapshotPackage(packageDir);
		const ctx: CheckContext = {
			packageDir,
			toolNames,
			timeline,
			crmTools,
			dbTool: deps.dbTool,
			lint: () => lintChanged(pkgRoot, since),
			baseline,
			get compileVerifiedAt(): number | undefined {
				return lastCompileOkAt;
			},
			changedAfter: (ms: number) =>
				listChangedFiles(pkgRoot, ms + 1).filter((file) => file.startsWith(packageDir + path.sep)),
		};

		// Preflight: the case is an unimplemented task. A result check that already passes means the task is done on the stand.
		const preflight = await runChecks(
			evalCase.checks.filter((check) => (RESULT_CHECK_TYPES as readonly string[]).includes(check.type)),
			ctx,
		);
		log("preflight", { results: preflight });
		const alreadyDone = preflight.filter((result) => result.passed);
		if (alreadyDone.length > 0) {
			throw new Error(
				`Кейс уже выполнен на стенде до начала: ${alreadyDone.map((r) => `${r.check.type} — ${r.detail}`).join("; ")}`,
			);
		}

		const appTools: AppTool[] = [createPkgLintTool({ pkgRoot, since: () => since })];
		let prompt = evalCase.task;
		inTurns = true;
		for (;;) {
			log("user", { text: prompt });
			timeline.push({ turn: turns, kind: "user", text: prompt });
			let lastText = "";
			const events = deps.query({
				prompt,
				resume,
				requestToolPermission: async (request) => {
					log("permission", { request });
					return true;
				},
				crmTools,
				dbTool: deps.dbTool,
				appTools,
			});
			for await (const event of events) {
				log("event", { event });
				if ((event.type === "system_init" || event.type === "result") && event.sessionId) {
					resume = event.sessionId;
				}
				if (event.type === "text") {
					lastText = event.text;
					timeline.push({ turn: turns, kind: "text", text: event.text });
				}
				if (event.type === "tool_use") {
					toolNames.push(event.name);
					timeline.push({ turn: turns, kind: "tool", name: event.name, input: event.input });
				}
				if (event.type === "result") {
					// total_cost_usd is cumulative over the session: keep the latest total, do not sum.
					if (event.totalCostUsd !== undefined) costUsd = Math.max(costUsd, event.totalCostUsd);
					if (event.totalCostUsd !== undefined) {
						costReported = true;
					}
					if (event.usage) {
						tokens.inputTokens += event.usage.inputTokens;
						tokens.outputTokens += event.usage.outputTokens;
						tokens.cacheReadTokens += event.usage.cacheReadTokens;
						tokens.cacheWriteTokens += event.usage.cacheWriteTokens;
					}
				}
			}
			turns++;
			if (turns >= evalCase.maxTurns) {
				break;
			}
			if (!asksUser(lastText)) {
				log("stop", { reason: "агент не задал вопрос" });
				break;
			}
			const answer = chooseAnswer(lastText, evalCase.answers ?? []);
			if (answer === undefined) {
				log("stop", { reason: "нет ответа на вопрос" });
				break;
			}
			prompt = answer;
		}

		inTurns = false;
		checks = await runChecks(evalCase.checks, ctx);
		passed = checks.every((check) => check.passed);
	} catch (e) {
		inTurns = false;
		error = e instanceof Error ? e.message : String(e);
		passed = false;
		log("error", { message: error });
	}

	// Always runs: the eval package is emptied and CRM is updated (the agent's schemas go away), then the teardown removes the case's DB data.
	try {
		await reset(packageDir);
		const update = crmTools?.find((tool) => tool.name === "crm_update_from_fs");
		if (update) {
			const result = await updateWithRetry(update, sleep, settleMs);
			log("final_reset", { updateText: result.text.split("\n")[0], isError: result.isError, retried: result.retried });
			if (result.isError) {
				const message = `обновление CRM не прошло — ${result.text.split("\n")[0]}`;
				error = error ? `${error}; уборка: ${message}` : `уборка: ${message}`;
			}
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		log("final_reset_error", { message });
		error = error ? `${error}; уборка: ${message}` : `уборка: ${message}`;
	}
	try {
		if (evalCase.teardownSql) {
			await runSql(evalCase.teardownSql, "after");
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		log("teardown_error", { message });
		error = error ? `${error}; уборка: ${message}` : `уборка: ${message}`;
	}

	return {
		caseId: evalCase.id,
		provider,
		run,
		passed,
		checks,
		turns,
		failedCrmActions: turnActionRecords.filter((r) => !r.success && !r.blocked && !r.denied).length,
		costUsd,
		tokens,
		costReported,
		durationMs: Date.now() - started,
		transcriptFile,
		error,
	};
}
