import * as fs from "fs";
import * as path from "path";

/** Local eval configuration (packages/evals/local.json, not committed). */
export interface EvalConfig {
	appRoot: string;
	package: string;
	prefix: string;
	vars: Record<string, string>;
	crm?: { url: string; user: string };
	/**
	 * true — connection from ConnectionStrings.config; object — same with overrides (password from BPMSOFT_EVAL_DB_PASSWORD).
	 */
	db?: boolean | { host?: string; port?: number; user?: string };
	/** Default model per provider; --model overrides it. */
	models?: { claude?: string; cursor?: string };
	/** Packages rolled back to the last commit before each case; default [package]. */
	resetPackages?: string[];
}

/** Packages the runner resets before each case and checks for uncommitted changes. */
export function packagesToReset(config: EvalConfig): string[] {
	return config.resetPackages?.length ? config.resetPackages : [config.package];
}

export type EvalCheck =
	| { type: "file_exists"; path: string }
	| { type: "file_contains"; path: string; pattern: string }
	| { type: "file_changed"; path: string }
	| { type: "lint_clean" }
	| { type: "crm_update_ok" }
	| { type: "crm_compile_ok" }
	| { type: "db_rows"; sql: string; min: number }
	| { type: "tool_called"; name: string }
	| { type: "tool_not_called"; name: string }
	| { type: "mentioned_before_write"; pattern: string }
	| { type: "no_unasked_destructive_sql"; pattern?: string };

export interface EvalSetup { type: "replace_in_file"; path: string; find: string; replace: string }

/** Answer to an agent question: used when `when` (case-insensitive regex) matches the question text. */
export interface EvalAnswerRule { when: string; text: string }

export interface EvalCase {
	id: string;
	title: string;
	provider?: "claude" | "cursor";
	setup?: EvalSetup[];
	task: string;
	/** Rules for questions where the answer matters; other questions get the recommended option. */
	answers?: EvalAnswerRule[];
	maxTurns: number;
	checks: EvalCheck[];
	/** PostgreSQL that removes the case's data from the stand DB; runs before and after the case through a temporary package SQL script. Must be idempotent. */
	teardownSql?: string;
	/** PostgreSQL that prepares stand data before the agent starts (after teardownSql); runs through a temporary package SQL script. */
	setupSql?: string;
}

/** Reads a JSON file, dropping a leading BOM. */
function readJson(file: string): Record<string, unknown> {
	const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
	return JSON.parse(text) as Record<string, unknown>;
}

/** Loads and checks the local config; vars default to an empty object. */
export function loadConfig(file: string): EvalConfig {
	const raw = readJson(file);
	for (const name of ["appRoot", "package", "prefix"] as const) {
		if (typeof raw[name] !== "string" || raw[name] === "") {
			throw new Error(`Нет поля ${name} в ${file}`);
		}
	}
	return { ...raw, vars: (raw.vars ?? {}) as Record<string, string> } as unknown as EvalConfig;
}

/** Replaces {{package}}, {{prefix}} and {{key}} from config.vars. Unknown names throw. */
export function substitute(text: string, config: EvalConfig): string {
	const values: Record<string, string> = { ...config.vars, package: config.package, prefix: config.prefix };
	return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
		if (Object.prototype.hasOwnProperty.call(values, name)) {
			return values[name];
		}
		throw new Error(`Неизвестная подстановка {{${name}}}`);
	});
}

function substituteDeep(value: unknown, config: EvalConfig): unknown {
	if (typeof value === "string") {
		return substitute(value, config);
	}
	if (Array.isArray(value)) {
		return value.map((item) => substituteDeep(item, config));
	}
	if (value !== null && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			result[key] = substituteDeep(item, config);
		}
		return result;
	}
	return value;
}

/** Loads a case file and substitutes placeholders in every string value. id defaults to the file name. */
export function loadCase(file: string, config: EvalConfig): EvalCase {
	const raw = substituteDeep(readJson(file), config) as Record<string, unknown>;
	if (typeof raw.id !== "string" || raw.id === "") {
		raw.id = path.basename(file, ".json");
	}
	return raw as unknown as EvalCase;
}
