import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeStandIntegration, MCP_PERMISSIONS } from "../src/claudeExport/standIntegration";

describe("standIntegration", () => {
	let root: string;

	/** Writes a file under the stand root, creating parent folders. */
	const put = (rel: string, content: string): void => {
		const file = path.join(root, ...rel.split("/"));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	};

	/** Reads a file under the stand root as text. */
	const read = (...parts: string[]): string => fs.readFileSync(path.join(root, ...parts), "utf8");

	/** Checks that a file exists under the stand root. */
	const exists = (...parts: string[]): boolean => fs.existsSync(path.join(root, ...parts));

	const crm = { url: "http://crm.test/", user: "u", password: "p" };
	const bundle = () => path.join(root, ".claude", "skills", "bpm-knowledge", "scripts", "bpmsoft-mcp.js");

	beforeEach(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stand-integration-")));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("registers the server in both MCP files, the settings and writes the access file", () => {
		const result = writeStandIntegration(root, { crm, db: { port: 5433 }, mcpBundle: bundle() });
		expect(result).toEqual({ state: "registered", invalid: [] });
		const entry = { command: "node", args: [bundle(), "--root", root] };
		expect(JSON.parse(read(".mcp.json")).mcpServers.bpmsoft).toEqual(entry);
		expect(JSON.parse(read(".cursor", "mcp.json")).mcpServers.bpmsoft).toEqual(entry);
		const settings = JSON.parse(read(".claude", "settings.local.json"));
		expect(settings.enabledMcpjsonServers).toEqual(["bpmsoft"]);
		expect(settings.permissions.allow).toEqual(MCP_PERMISSIONS);
		expect(JSON.parse(read(".claude", "bpmsoft-agent.local.json"))).toEqual({ version: 1, crm, db: { port: 5433 } });
		if (process.platform !== "win32") {
			expect(fs.statSync(path.join(root, ".claude", "bpmsoft-agent.local.json")).mode & 0o777).toBe(0o600);
		}
	});

	it("keeps foreign keys and servers and does not duplicate entries on reinstall", () => {
		put(".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
		put(".claude/settings.local.json", JSON.stringify({ model: "m", permissions: { allow: ["Bash(ls)"] }, enabledMcpjsonServers: ["other"] }));
		writeStandIntegration(root, { crm, mcpBundle: bundle() });
		writeStandIntegration(root, { crm, mcpBundle: bundle() });
		expect(Object.keys(JSON.parse(read(".mcp.json")).mcpServers)).toEqual(["other", "bpmsoft"]);
		const settings = JSON.parse(read(".claude", "settings.local.json"));
		expect(settings.model).toBe("m");
		expect(settings.permissions.allow).toEqual(["Bash(ls)", ...MCP_PERMISSIONS]);
		expect(settings.enabledMcpjsonServers).toEqual(["other", "bpmsoft"]);
	});

	it("removes the legacy CRM variables from env and drops an empty env", () => {
		put(".claude/settings.local.json", JSON.stringify({ env: { BPMSOFT_CRM_URL: "a", BPMSOFT_CRM_USER: "b", BPMSOFT_CRM_PASSWORD: "c" } }));
		writeStandIntegration(root, { crm, mcpBundle: bundle() });
		expect(JSON.parse(read(".claude", "settings.local.json"))).not.toHaveProperty("env");
	});

	it("unregisters everything when neither CRM nor database is configured", () => {
		put(".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
		writeStandIntegration(root, { crm, mcpBundle: bundle() });
		const result = writeStandIntegration(root, { mcpBundle: bundle() });
		expect(result.state).toBe("removed");
		expect(JSON.parse(read(".mcp.json")).mcpServers).toEqual({ other: { command: "x" } });
		expect(exists(".claude", "bpmsoft-agent.local.json")).toBe(false);
		const settings = JSON.parse(read(".claude", "settings.local.json"));
		expect(settings.permissions?.allow ?? []).toEqual([]);
		expect(settings.enabledMcpjsonServers ?? []).toEqual([]);
	});

	it("leaves a broken JSON file untouched and reports it", () => {
		put(".cursor/mcp.json", "{ broken");
		const result = writeStandIntegration(root, { crm, mcpBundle: bundle() });
		expect(result.invalid).toEqual([".cursor/mcp.json"]);
		expect(read(".cursor", "mcp.json")).toBe("{ broken");
	});

	it("keeps BOM and CRLF of an existing file", () => {
		put(".mcp.json", "\uFEFF{\r\n  \"mcpServers\": {}\r\n}\r\n");
		writeStandIntegration(root, { crm, mcpBundle: bundle() });
		const text = read(".mcp.json");
		expect(text.startsWith("\uFEFF")).toBe(true);
		expect(text).toContain("\r\n");
		expect(text.replace(/\r\n/g, "")).not.toContain("\n");
	});
});
