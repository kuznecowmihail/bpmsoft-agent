import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseStandConfig, readStandConfig, STAND_CONFIG_REL } from "../src/mcp/standConfig";

describe("standConfig", () => {
	it("reads crm and db", () => {
		const text = JSON.stringify({ version: 1, crm: { url: "http://c/", user: "u", password: "p" }, db: { port: 5433 } });
		expect(parseStandConfig(text)).toEqual({ version: 1, crm: { url: "http://c/", user: "u", password: "p" }, db: { port: 5433 } });
	});
	it("strips a BOM", () => {
		expect(parseStandConfig("﻿" + JSON.stringify({ version: 1 }))).toEqual({ version: 1 });
	});
	it("an incomplete crm block is an error", () => {
		expect(parseStandConfig(JSON.stringify({ version: 1, crm: { url: "http://c/" } }))).toHaveProperty("error");
	});
	it("invalid JSON is an error without the file text", () => {
		const result = parseStandConfig("{ password: secret");
		expect(result).toHaveProperty("error");
		expect(JSON.stringify(result)).not.toContain("secret");
	});
	it("a missing file means nothing configured", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "stand-config-"));
		expect(readStandConfig(root)).toEqual({ version: 1 });
		fs.rmSync(root, { recursive: true, force: true });
	});
	it("reads the file under the stand root", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "stand-config-"));
		const file = path.join(root, ...STAND_CONFIG_REL.split("/"));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ version: 1, db: {} }));
		expect(readStandConfig(root)).toEqual({ version: 1, db: {} });
		fs.rmSync(root, { recursive: true, force: true });
	});
	it("reads jira and confluence", () => {
		const text = JSON.stringify({
			version: 1,
			jira: { url: "https://jira.test", token: "jt", email: "a@test", acceptanceField: "customfield_10100" },
			confluence: { url: "https://wiki.test", token: "ct" },
		});
		expect(parseStandConfig(text)).toEqual({
			version: 1,
			jira: { url: "https://jira.test", token: "jt", email: "a@test", acceptanceField: "customfield_10100" },
			confluence: { url: "https://wiki.test", token: "ct" },
		});
	});
	it("a jira block without token is an error", () => {
		const result = parseStandConfig(JSON.stringify({ version: 1, jira: { url: "https://jira.test" } }));
		expect(result).toEqual({ error: "В файле доступов неполный блок jira" });
	});
});
