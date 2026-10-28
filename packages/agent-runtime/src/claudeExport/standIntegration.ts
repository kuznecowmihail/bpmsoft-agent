import * as fs from "fs";
import * as path from "path";
import type { CrmConnection } from "../crm/crmSession";
import { MCP_SERVER_NAME } from "../mcp/bpmsoftMcpServer";
import { STAND_CONFIG_REL, type StandDbConfig } from "../mcp/standConfig";
import { isInsideRoots } from "../safety/sandboxGuard";

/** Permissions that Claude Code allows for the tools of the bpmsoft server. */
export const MCP_PERMISSIONS = ["mcp__bpmsoft__crm_db_query", "mcp__bpmsoft__crm_update_from_fs", "mcp__bpmsoft__crm_browser_login"];

/** MCP config files that list the server, relative to the stand root. */
const MCP_FILES_REL = [".mcp.json", ".cursor/mcp.json"];

/** Claude Code settings that enable the server and allow its tools, relative to the stand root. */
const SETTINGS_REL = ".claude/settings.local.json";

/** CRM variables of the removed crm.js CLI; they are dropped from settings env. */
const LEGACY_ENV = ["BPMSOFT_CRM_URL", "BPMSOFT_CRM_USER", "BPMSOFT_CRM_PASSWORD"];

/** Inputs for writing or removing the server registration in the stand. */
export interface StandIntegrationOptions {
	crm?: CrmConnection;
	db?: StandDbConfig;
	/** Absolute path to the bundle in the stand. */
	mcpBundle: string;
}

/** Outcome: registered or removed, and the rel paths left untouched because they are not valid. */
export interface StandIntegrationResult {
	state: "registered" | "removed";
	invalid: string[];
}

/** A parsed JSON object with the text traits to keep on write. */
interface JsonFile {
	value: Record<string, unknown>;
	bom: boolean;
	crlf: boolean;
}

/** Converts a "/"-separated rel path to a path under the stand root. */
function toDisk(appRoot: string, rel: string): string {
	return path.join(appRoot, ...rel.split("/"));
}

/** Throws when a path resolves outside the stand root. */
function assertInsideStand(appRoot: string, dest: string): void {
	if (!isInsideRoots(dest, [appRoot])) {
		throw new Error(`Путь выходит за пределы папки проекта: ${dest}`);
	}
}

/** Returns true when the value is a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a JSON object file; undefined when absent, "invalid" when it is not a JSON object. */
function readJson(dest: string): JsonFile | "invalid" | undefined {
	if (!fs.existsSync(dest)) {
		return undefined;
	}
	const text = fs.readFileSync(dest, "utf8");
	let value: unknown;
	try {
		value = JSON.parse(text.replace(/^﻿/, ""));
	} catch {
		return "invalid";
	}
	if (!isRecord(value)) {
		return "invalid";
	}
	return { value, bom: text.startsWith("﻿"), crlf: text.includes("\r\n") };
}

/** Writes a JSON object, keeping BOM and CRLF of the file it replaces when given. */
function writeJson(dest: string, value: Record<string, unknown>, like?: { bom: boolean; crlf: boolean }): void {
	let text = JSON.stringify(value, null, 2) + "\n";
	if (like?.crlf) {
		text = text.replace(/\n/g, "\r\n");
	}
	if (like?.bom) {
		text = "﻿" + text;
	}
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, text);
}

/** Writes a JSON object under the stand root only when its content differs from the current one. */
function saveJson(appRoot: string, rel: string, next: Record<string, unknown>, current: JsonFile | undefined): void {
	if (current && JSON.stringify(next) === JSON.stringify(current.value)) {
		return;
	}
	const dest = toDisk(appRoot, rel);
	assertInsideStand(appRoot, dest);
	writeJson(dest, next, current);
}

/** Returns the list with the missing items appended in order, without duplicates. */
function withItems(list: unknown[], items: string[]): unknown[] {
	return [...list, ...items.filter((item) => !list.includes(item))];
}

/** Returns true when the settings keys this module edits have the expected shape. */
function settingsShapeOk(value: Record<string, unknown>): boolean {
	const permissions = value.permissions;
	const envOk = value.env === undefined || isRecord(value.env);
	const permissionsOk = permissions === undefined || (isRecord(permissions) && (permissions.allow === undefined || Array.isArray(permissions.allow)));
	const enabledOk = value.enabledMcpjsonServers === undefined || Array.isArray(value.enabledMcpjsonServers);
	return envOk && permissionsOk && enabledOk;
}

/** Registers the bpmsoft server in the MCP files and settings, and writes the access file; removes them when nothing is configured. */
export function writeStandIntegration(appRoot: string, options: StandIntegrationOptions): StandIntegrationResult {
	const register = Boolean(options.crm || options.db);
	const invalid: string[] = [];
	const entry = { command: "node", args: [options.mcpBundle, "--root", appRoot] };

	for (const rel of MCP_FILES_REL) {
		const file = readJson(toDisk(appRoot, rel));
		if (file === "invalid" || (file && file.value.mcpServers !== undefined && !isRecord(file.value.mcpServers))) {
			invalid.push(rel);
			continue;
		}
		if (!file) {
			if (register) {
				saveJson(appRoot, rel, { mcpServers: { [MCP_SERVER_NAME]: entry } }, undefined);
			}
			continue;
		}
		const servers = isRecord(file.value.mcpServers) ? { ...file.value.mcpServers } : undefined;
		if (register) {
			saveJson(appRoot, rel, { ...file.value, mcpServers: { ...servers, [MCP_SERVER_NAME]: entry } }, file);
		} else if (servers && MCP_SERVER_NAME in servers) {
			delete servers[MCP_SERVER_NAME];
			saveJson(appRoot, rel, { ...file.value, mcpServers: servers }, file);
		}
	}

	const settingsFile = readJson(toDisk(appRoot, SETTINGS_REL));
	if (settingsFile === "invalid" || (settingsFile && !settingsShapeOk(settingsFile.value))) {
		invalid.push(SETTINGS_REL);
	} else if (settingsFile !== undefined || register) {
		const current = settingsFile?.value ?? {};
		const env: Record<string, unknown> = { ...(isRecord(current.env) ? current.env : {}) };
		for (const key of LEGACY_ENV) {
			delete env[key];
		}
		const permissions = isRecord(current.permissions) ? current.permissions : {};
		const allow: unknown[] = Array.isArray(permissions.allow) ? permissions.allow : [];
		const enabled: unknown[] = Array.isArray(current.enabledMcpjsonServers) ? current.enabledMcpjsonServers : [];

		const next: Record<string, unknown> = { ...current };
		if (Object.keys(env).length > 0) {
			next.env = env;
		} else {
			delete next.env;
		}
		if (register || permissions.allow !== undefined) {
			const nextAllow = register
				? withItems(allow, MCP_PERMISSIONS)
				: allow.filter((item) => !MCP_PERMISSIONS.includes(item as string));
			next.permissions = { ...permissions, allow: nextAllow };
		}
		if (register || current.enabledMcpjsonServers !== undefined) {
			next.enabledMcpjsonServers = register
				? withItems(enabled, [MCP_SERVER_NAME])
				: enabled.filter((item) => item !== MCP_SERVER_NAME);
		}
		saveJson(appRoot, SETTINGS_REL, next, settingsFile);
	}

	const accessDest = toDisk(appRoot, STAND_CONFIG_REL);
	if (register) {
		assertInsideStand(appRoot, accessDest);
		writeJson(accessDest, { version: 1, ...(options.crm && { crm: options.crm }), ...(options.db && { db: options.db }) });
	} else if (fs.existsSync(accessDest)) {
		assertInsideStand(appRoot, accessDest);
		fs.unlinkSync(accessDest);
	}

	return { state: register ? "registered" : "removed", invalid };
}
