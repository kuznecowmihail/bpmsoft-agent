import * as fs from "fs";
import * as path from "path";

/** Package the runner creates and resets when local.json has no "package". */
export const DEFAULT_PACKAGE = "EvalPackage";
/** Prefix of the runner's SQL scripts and case names when local.json has no "prefix". */
export const DEFAULT_PREFIX = "Test";

/** Local eval configuration as written in packages/evals/local.json (not committed). */
export interface EvalConfigFile {
	appRoot: string;
	/** Package the runner creates and resets; default "EvalPackage". */
	package?: string;
	/** Prefix for names of the runner's SQL scripts and case data; default "Test". */
	prefix?: string;
	crm?: { url: string; user: string };
	/**
	 * true — connection from ConnectionStrings.config; object — same with overrides (password from BPMSOFT_EVAL_DB_PASSWORD).
	 */
	db?: boolean | { host?: string; port?: number; user?: string };
	/** Default model per provider; --model overrides it. */
	models?: { claude?: string; cursor?: string };
	/**
	 * Variant of the Cursor model (id/value pairs from listCursorModels, e.g. reasoning_effort); applies to models.cursor.
	 * Without it the model runs in its default variant.
	 */
	cursorModelParams?: Array<{ id: string; value: string }>;
	/** Packages the eval package depends on; default ProductCore. */
	dependsOn?: Array<{ UId: string; PackageVersion?: string; Name: string }>;
}

/** Resolved config: package and prefix always have values. */
export interface EvalConfig extends EvalConfigFile {
	package: string;
	prefix: string;
}

export type EvalCheck =
	| { type: "file_exists"; path: string }
	| { type: "file_contains"; path: string; pattern: string }
	| { type: "file_not_contains"; path: string; pattern: string }
	| { type: "file_changed"; path: string }
	| { type: "lint_clean" }
	| { type: "crm_update_ok" }
	| { type: "crm_compile_ok" }
	| { type: "db_rows"; sql: string; min: number }
	| { type: "crm_request_ok"; pathPattern?: string }
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
	/** Names of folders in packages/evals/fixtures/ copied into the eval package before the agent starts. */
	fixtures?: string[];
}

/** Reads a JSON file, dropping a leading BOM. */
function readJson(file: string): Record<string, unknown> {
	const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
	return JSON.parse(text) as Record<string, unknown>;
}

/** True for an array of { id, value } with a non-empty string id and a string value. */
function isModelParams(value: unknown): value is Array<{ id: string; value: string }> {
	return Array.isArray(value) && value.every((item) => {
		const r = item as Record<string, unknown> | null;
		return r !== null && typeof r === "object" && typeof r.id === "string" && r.id !== "" && typeof r.value === "string";
	});
}

/** Loads and checks the local config; fills package and prefix with defaults. */
export function loadConfig(file: string): EvalConfig {
	const raw = readJson(file);
	if (typeof raw.appRoot !== "string" || raw.appRoot === "") {
		throw new Error(`Нет поля appRoot в ${file}`);
	}
	if (raw.cursorModelParams !== undefined && !isModelParams(raw.cursorModelParams)) {
		throw new Error(`Поле cursorModelParams в ${file} — массив объектов { "id": "...", "value": "..." } со строками`);
	}
	const config = raw as unknown as EvalConfigFile;
	return {
		...config,
		package: config.package || DEFAULT_PACKAGE,
		prefix: config.prefix || DEFAULT_PREFIX,
	};
}

/** Replaces {{package}} and {{prefix}}. Unknown names throw. */
export function substitute(text: string, config: EvalConfig): string {
	const values: Record<string, string> = { package: config.package, prefix: config.prefix };
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
