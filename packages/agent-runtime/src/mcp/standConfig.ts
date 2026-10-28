import * as fs from "fs";
import * as path from "path";
import type { CrmConnection } from "../crm/crmSession";

/** Stand access file location, relative to the stand root. */
export const STAND_CONFIG_REL = ".claude/bpmsoft-agent.local.json";

/** Database access from the stand access file. */
export interface StandDbConfig { host?: string; port?: number; user?: string; password?: string }

/** Parsed stand access file. */
export interface StandConfig { version: 1; crm?: CrmConnection; db?: StandDbConfig }

const NOT_JSON_ERROR = "Файл доступов .claude/bpmsoft-agent.local.json не разбирается как JSON";
const INCOMPLETE_CRM_ERROR = "В файле доступов неполный блок crm";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse the stand access file text; errors never include the file text. */
export function parseStandConfig(text: string): StandConfig | { error: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text.replace(/^\uFEFF/, ""));
	} catch {
		return { error: NOT_JSON_ERROR };
	}
	if (!isRecord(raw)) return { error: NOT_JSON_ERROR };

	let crm: CrmConnection | undefined;
	if (raw.crm !== undefined) {
		const c = raw.crm;
		if (!isRecord(c)
			|| typeof c.url !== "string" || c.url === ""
			|| typeof c.user !== "string" || c.user === ""
			|| typeof c.password !== "string" || c.password === "") {
			return { error: INCOMPLETE_CRM_ERROR };
		}
		crm = { url: c.url, user: c.user, password: c.password };
	}

	let db: StandDbConfig | undefined;
	if (isRecord(raw.db)) {
		const d = raw.db;
		db = {};
		if (typeof d.host === "string") db.host = d.host;
		if (typeof d.port === "number") db.port = d.port;
		if (typeof d.user === "string") db.user = d.user;
		if (typeof d.password === "string") db.password = d.password;
	}

	return { version: 1, ...(crm && { crm }), ...(db && { db }) };
}

/** Read the stand access file under the stand root; a missing file means nothing configured. */
export function readStandConfig(root: string): StandConfig | { error: string } {
	const file = path.join(root, ...STAND_CONFIG_REL.split("/"));
	if (!fs.existsSync(file)) return { version: 1 };
	return parseStandConfig(fs.readFileSync(file, "utf8"));
}
