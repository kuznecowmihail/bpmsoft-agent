import * as fs from "fs";
import * as path from "path";
import type { CrmConnection } from "../crm/crmSession";
import type { AtlassianConnection, JiraConnection } from "../tracker/atlassianHttp";

/** Stand access file location, relative to the stand root. */
export const STAND_CONFIG_REL = ".claude/bpmsoft-agent.local.json";

/** Database access from the stand access file. */
export interface StandDbConfig { host?: string; port?: number; user?: string; password?: string }

/** Parsed stand access file. */
export interface StandConfig { version: 1; crm?: CrmConnection; db?: StandDbConfig; jira?: JiraConnection; confluence?: AtlassianConnection }

const NOT_JSON_ERROR = "Файл доступов .claude/bpmsoft-agent.local.json не разбирается как JSON";
const INCOMPLETE_CRM_ERROR = "В файле доступов неполный блок crm";
const INCOMPLETE_JIRA_ERROR = "В файле доступов неполный блок jira";
const INCOMPLETE_CONFLUENCE_ERROR = "В файле доступов неполный блок confluence";

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

	let jira: JiraConnection | undefined;
	if (raw.jira !== undefined) {
		const j = raw.jira;
		if (!isRecord(j)
			|| typeof j.url !== "string" || j.url === ""
			|| typeof j.token !== "string" || j.token === ""
			|| (j.email !== undefined && typeof j.email !== "string")
			|| (j.acceptanceField !== undefined && typeof j.acceptanceField !== "string")) {
			return { error: INCOMPLETE_JIRA_ERROR };
		}
		const { url, token, email, acceptanceField } = j as { url: string; token: string; email?: string; acceptanceField?: string };
		jira = { url, token, ...(email ? { email } : {}), ...(acceptanceField ? { acceptanceField } : {}) };
	}

	let confluence: AtlassianConnection | undefined;
	if (raw.confluence !== undefined) {
		const c = raw.confluence;
		if (!isRecord(c)
			|| typeof c.url !== "string" || c.url === ""
			|| typeof c.token !== "string" || c.token === ""
			|| (c.email !== undefined && typeof c.email !== "string")) {
			return { error: INCOMPLETE_CONFLUENCE_ERROR };
		}
		const { url, token, email } = c as { url: string; token: string; email?: string };
		confluence = { url, token, ...(email ? { email } : {}) };
	}

	return {
		version: 1,
		...(crm && { crm }),
		...(db && { db }),
		...(jira && { jira }),
		...(confluence && { confluence }),
	};
}

/** Read the stand access file under the stand root; a missing file means nothing configured. */
export function readStandConfig(root: string): StandConfig | { error: string } {
	const file = path.join(root, ...STAND_CONFIG_REL.split("/"));
	if (!fs.existsSync(file)) return { version: 1 };
	return parseStandConfig(fs.readFileSync(file, "utf8"));
}
