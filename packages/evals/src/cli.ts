import * as fs from "fs";
import * as path from "path";
import {
	changedSchemaNames,
	createCrmDbTool,
	createCrmRequestTool,
	createCrmTools,
	lintChanged,
	listChangedFiles,
} from "@bpmsoft-agent/agent-runtime";
import type { CrmDbTool, CrmRequestRecord } from "@bpmsoft-agent/agent-runtime";
import { loadCase, loadConfig } from "./caseFile";
import { ensureEvalPackage } from "./evalPackage";
import { loadEnvFile } from "./envFile";
import { renderReport } from "./report";
import { createQueryFn, pkgRootOf, runCase } from "./runner";
import type { CaseRun, Provider } from "./runner";
import { formatTokens } from "./report";

export interface CliOptions {
	caseId?: string;
	provider?: Provider;
	runs: number;
	model?: string;
	allowUnsandboxedShell: boolean;
}

/** Returns the value of a flag at the given index or throws when it is missing. */
function valueAt(argv: string[], index: number, flag: string): string {
	const value = argv[index];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`Нет значения для ${flag}`);
	}
	return value;
}

/** Parses command-line flags of the eval runner. */
export function parseArgs(argv: string[], platform: NodeJS.Platform = process.platform): CliOptions {
	const options: CliOptions = { runs: 1, allowUnsandboxedShell: false };
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		switch (flag) {
			case "--case":
				options.caseId = valueAt(argv, ++i, flag);
				break;
			case "--provider": {
				const value = valueAt(argv, ++i, flag);
				if (value !== "claude" && value !== "cursor") {
					throw new Error(`Неизвестный провайдер ${value}`);
				}
				options.provider = value;
				break;
			}
			case "--runs": {
				const runs = Number(valueAt(argv, ++i, flag));
				if (!Number.isInteger(runs) || runs < 1) {
					throw new Error("--runs должен быть положительным целым числом");
				}
				options.runs = runs;
				break;
			}
			case "--model":
				options.model = valueAt(argv, ++i, flag);
				break;
			case "--allow-unsandboxed-shell":
				options.allowUnsandboxedShell = true;
				break;
			default:
				throw new Error(`Неизвестный параметр ${flag}`);
		}
	}
	if (options.model !== undefined && options.provider === undefined) {
		throw new Error("--model указывается вместе с --provider: у Claude и Cursor разные модели");
	}
	if (platform === "win32" && !options.allowUnsandboxedShell) {
		throw new Error(
			"На Windows у оболочки агента нет песочницы ОС, а раннер одобряет все действия. Запустите с --allow-unsandboxed-shell, если стенд тестовый.",
		);
	}
	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const evalsDir = path.join(__dirname, "..");
	const loaded = loadEnvFile(path.join(evalsDir, ".env"));
	if (loaded.length > 0) {
		console.log(`Переменные из .env: ${loaded.join(", ")}`);
	}
	const config = loadConfig(path.join(evalsDir, "local.json"));
	const casesDir = path.join(evalsDir, "cases");
	const files = fs
		.readdirSync(casesDir)
		.filter((file) => file.endsWith(".json"))
		.filter((file) => options.caseId === undefined || path.basename(file).startsWith(options.caseId))
		.sort();
	if (files.length === 0) {
		throw new Error("Нет кейсов для запуска");
	}
	const cases = files.map((file) => loadCase(path.join(casesDir, file), config));

	const pkgRoot = pkgRootOf(config);
	const runId = new Date().toISOString().replace(/[:.]/g, "-");
	const resultsDir = path.join(evalsDir, "results", runId);

	const password = process.env.BPMSOFT_EVAL_CRM_PASSWORD;
	const crm = config.crm;
	const crmTools =
		crm && password
			? (onAction: Parameters<typeof createCrmTools>[0]["onAction"], ownSince: () => number) =>
					createCrmTools({
						connection: { url: crm.url, user: crm.user, password },
						appRoot: config.appRoot,
						onAction,
						ownSchemas: () => changedSchemaNames(pkgRoot, ownSince()),
						lint: () => lintChanged(pkgRoot, ownSince()),
						changedSince: (ms: number) => listChangedFiles(pkgRoot, ms).length > 0,
						chatStartedAt: ownSince,
					})
			: undefined;
	const requestTool =
		crm && password
			? (onRequest: (record: CrmRequestRecord) => void) =>
					createCrmRequestTool({
						connection: { url: crm.url, user: crm.user, password },
						onRequest,
						// The runner approves every permission request, so it approves changing REST requests too.
						confirm: async () => true,
					})
			: undefined;
	if (!crmTools) {
		console.log("Предупреждение: CRM-действия не подключены (нужны поле crm в local.json и BPMSOFT_EVAL_CRM_PASSWORD).");
	}
	const dbPassword = process.env.BPMSOFT_EVAL_DB_PASSWORD || undefined;
	const dbTool: CrmDbTool | undefined = config.db
		? createCrmDbTool({
				connectionStringsPath: path.join(config.appRoot, "ConnectionStrings.config"),
				override:
					typeof config.db === "object"
						? {
								host: config.db.host || undefined,
								port: config.db.port || undefined,
								user: config.db.user || undefined,
								password: dbPassword,
							}
						: dbPassword
							? { password: dbPassword }
							: undefined,
			})
		: undefined;

	const { created } = ensureEvalPackage(pkgRoot, config);
	if (created) {
		console.log(`Создан пакет ${config.package} в Pkg`);
		const update = crmTools?.(() => {}, () => Date.now()).find((tool) => tool.name === "crm_update_from_fs");
		if (update) {
			const result = await update.execute();
			if (result.isError) {
				throw new Error(`Не удалось установить пакет ${config.package}: ${result.text.split("\n")[0]}`);
			}
		} else {
			console.log(
				`Предупреждение: CRM не подключена. Нажмите в CRM «Обновить из файловой системы», чтобы установить пакет ${config.package}.`,
			);
		}
	} else {
		console.log(`Пакет ${config.package} уже есть — запускаю кейсы`);
	}

	const runs: CaseRun[] = [];
	for (const evalCase of cases) {
		const provider: Provider = options.provider ?? evalCase.provider ?? "claude";
		for (let run = 1; run <= options.runs; run++) {
			const result = await runCase(evalCase, config, provider, run, {
				query: createQueryFn(config, provider, options.model),
				resultsDir,
				crmTools,
				requestTool,
				dbTool,
			});
			runs.push(result);
			const { tokens } = result;
			const tokenTotal = formatTokens(tokens.inputTokens + tokens.cacheReadTokens + tokens.outputTokens);
			const cost = result.costReported ? `, $${result.costUsd.toFixed(2)}` : "";
			console.log(
				`${evalCase.id} (${provider}, прогон ${run}): ${result.passed ? "прошёл" : "не прошёл"}, ходов ${result.turns}, токенов ${tokenTotal}${cost}`,
			);
		}
	}

	fs.mkdirSync(resultsDir, { recursive: true });
	const report = renderReport(runs);
	fs.writeFileSync(path.join(resultsDir, "report.md"), report, "utf8");
	console.log(report);
	process.exitCode = runs.some((run) => !run.passed) ? 1 : 0;
}

if (require.main === module) {
	main().catch((e: unknown) => {
		console.error(e instanceof Error ? e.message : String(e));
		process.exitCode = 2;
	});
}
