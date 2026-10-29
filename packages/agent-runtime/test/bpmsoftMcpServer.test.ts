import { describe, it, expect } from "vitest";
import * as os from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBpmsoftMcpServer, BpmsoftMcpOptions } from "../src/mcp/bpmsoftMcpServer";
import type { FetchLike } from "../src/crm";

interface RecordedRequest { url: string; method: string; headers: Record<string, string>; body: string }

/** Fake fetch: answers the login call itself and passes every other request to respond. */
function fakeFetch(respond: (request: RecordedRequest) => Response): { fetchImpl: FetchLike; requests: RecordedRequest[] } {
	const requests: RecordedRequest[] = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const request: RecordedRequest = {
			url: String(url),
			method: init?.method ?? "GET",
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: String(init?.body ?? ""),
		};
		requests.push(request);
		if (request.url.endsWith("/ServiceModel/AuthService.svc/Login")) {
			const headers = new Headers();
			headers.append("set-cookie", "BPMCSRF=csrf123; path=/");
			return new Response(JSON.stringify({ Code: 0, Message: null }), { status: 200, headers });
		}
		return respond(request);
	}) as unknown as FetchLike;
	return { fetchImpl, requests };
}

async function connect(options: Partial<BpmsoftMcpOptions> & Pick<BpmsoftMcpOptions, "config">) {
	const server = createBpmsoftMcpServer({ root: os.tmpdir(), knowledgeDir: os.tmpdir(), ...options });
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "test", version: "1" });
	await client.connect(clientSide);
	return client;
}
const crm = { url: "http://crm.test/", user: "tester", password: "s3cret-pass" };

describe("bpmsoft MCP server", () => {
	it("has only the git tools when nothing is configured", async () => {
		const client = await connect({ config: { version: 1 } });
		expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["git_branch_status", "git_create_mr", "git_switch_branch"]);
	});
	it("has CRM tools without the database tool", async () => {
		const client = await connect({ config: { version: 1, crm } });
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(["crm_browser_login", "crm_compile", "crm_request", "crm_restart", "crm_update_from_fs", "git_branch_status", "git_create_mr", "git_switch_branch"]);
	});
	it("has the database tool and the git tools when only db is configured", async () => {
		const client = await connect({ config: { version: 1, db: {} } });
		expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["crm_db_query", "git_branch_status", "git_create_mr", "git_switch_branch"]);
	});
	it("crm_request returns the stand answer as text", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("{\"value\":5}", { status: 200 }));
		const client = await connect({ config: { version: 1, crm }, fetchImpl });
		const result = await client.callTool({ name: "crm_request", arguments: { method: "GET", path: "/0/odata/Contact/$count" } });
		expect(result.isError).toBeFalsy();
		expect(JSON.stringify(result.content)).toContain("5");
	});
	it("crm_db_query refuses a write", async () => {
		const client = await connect({ config: { version: 1, db: {} }, dbClientFactory: () => { throw new Error("must not connect"); } });
		const result = await client.callTool({ name: "crm_db_query", arguments: { sql: "DELETE FROM \"Contact\"" } });
		expect(result.isError).toBe(true);
	});
	it("crm_browser_login returns the login page and no password", async () => {
		const client = await connect({ config: { version: 1, crm }, browserLoginTimeoutMs: 200 });
		const result = await client.callTool({ name: "crm_browser_login", arguments: { port: 0 } });
		const text = JSON.stringify(result.content);
		expect(text).toContain("http://crm.test/Login/Login.html");
		expect(text).not.toContain("s3cret-pass");
	});
});
