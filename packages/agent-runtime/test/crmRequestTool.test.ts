import { describe, it, expect, vi } from "vitest";
import { createCrmRequestTool } from "../src/crm/crmRequestTool";
import { FetchLike } from "../src/crm/crmSession";

const connection = { url: "http://crm.test/", user: "tester", password: "s3cret-pass" };

interface RecordedRequest { url: string; method: string; headers: Record<string, string>; body: string }

/** Fake CRM: login succeeds with a BPMCSRF cookie; every other request goes to respond(). */
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

describe("crm_request tool", () => {
	it("refuses paths that leave the stand", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("ok", { status: 200 }));
		const tool = createCrmRequestTool({ connection, fetchImpl });
		for (const path of ["https://evil.test/x", "//evil.test/x"]) {
			const result = await tool.execute({ method: "GET", path });
			expect(result.isError).toBe(true);
			expect(result.text).toContain("Путь должен начинаться с /");
		}
		expect(requests).toHaveLength(0);
	});

	it("sends a GET without confirmation and reports the status", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("pong", { status: 200 }));
		const tool = createCrmRequestTool({ connection, fetchImpl });
		const result = await tool.execute({ method: "GET", path: "/rest/TestService/Ping" });
		expect(requests[1].url).toBe("http://crm.test/rest/TestService/Ping");
		expect(requests[1].method).toBe("GET");
		expect(requests[1].headers.BPMCSRF).toBe("csrf123");
		expect(requests[1].body).toBe("");
		expect(result.text.startsWith("HTTP 200")).toBe(true);
		expect(result.isError).toBe(false);
		expect(result.text).not.toContain("s3cret-pass");
	});

	it("runs a SelectQuery POST without asking the user", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("{}", { status: 200 }));
		const confirm = vi.fn(async () => true);
		const tool = createCrmRequestTool({ connection, fetchImpl, confirm });
		const body = '{"rootSchemaName":"Contact"}';
		await tool.execute({ method: "POST", path: "/DataService/json/SyncReply/SelectQuery", body });
		expect(confirm).not.toHaveBeenCalled();
		expect(requests[1].method).toBe("POST");
		expect(requests[1].body).toBe(body);
		expect(requests[1].headers.BPMCSRF).toBe("csrf123");
	});

	it("does not send a changing POST when the user declines", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("{}", { status: 200 }));
		const confirm = vi.fn(async () => false);
		const tool = createCrmRequestTool({ connection, fetchImpl, confirm });
		const result = await tool.execute({ method: "POST", path: "/rest/TestService/Save", body: "{}" });
		expect(result.isError).toBe(true);
		expect(result.text).toBe("Пользователь отклонил запрос");
		expect(requests).toHaveLength(0);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(String(confirm.mock.calls[0][0])).toContain("POST /rest/TestService/Save");
	});

	it("sends a changing POST when the user approves, and refuses it without a confirm option", async () => {
		const approved = fakeFetch(() => new Response("{}", { status: 200 }));
		const approvingTool = createCrmRequestTool({ connection, fetchImpl: approved.fetchImpl, confirm: async () => true });
		await approvingTool.execute({ method: "POST", path: "/rest/TestService/Save", body: "{}" });
		expect(approved.requests[1].method).toBe("POST");

		const noConfirm = fakeFetch(() => new Response("{}", { status: 200 }));
		const tool = createCrmRequestTool({ connection, fetchImpl: noConfirm.fetchImpl });
		const result = await tool.execute({ method: "POST", path: "/rest/TestService/Save", body: "{}" });
		expect(result.isError).toBe(true);
		expect(noConfirm.requests).toHaveLength(0);
	});

	it("cuts the body to maxChars and notes the full length", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("x".repeat(100), { status: 200 }));
		const tool = createCrmRequestTool({ connection, fetchImpl });
		const result = await tool.execute({ method: "GET", path: "/rest/TestService/Ping", maxChars: 10 });
		expect(result.text).toBe("HTTP 200\n" + "x".repeat(10) + "\n… (обрезано, всего 100 символов)");
	});

	it("marks a 500 response as an error", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("boom", { status: 500 }));
		const tool = createCrmRequestTool({ connection, fetchImpl });
		const result = await tool.execute({ method: "GET", path: "/rest/TestService/Ping" });
		expect(result.isError).toBe(true);
		expect(result.text.startsWith("HTTP 500")).toBe(true);
	});

	it("refuses a POST body that is not JSON without sending anything", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("{}", { status: 200 }));
		const tool = createCrmRequestTool({ connection, fetchImpl });
		const result = await tool.execute({ method: "POST", path: "/DataService/json/SyncReply/SelectQuery", body: "{bad" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("не является JSON");
		expect(requests).toHaveLength(0);
	});

	it("does not reveal the password when the login fails", async () => {
		const requests: string[] = [];
		const fetchImpl = (async (url: string | URL | Request) => {
			requests.push(String(url));
			return new Response(JSON.stringify({ Code: 1, Message: "Неверный пароль" }), { status: 200 });
		}) as unknown as FetchLike;
		const tool = createCrmRequestTool({ connection, fetchImpl });
		const result = await tool.execute({ method: "GET", path: "/rest/TestService/Ping" });
		expect(result.isError).toBe(true);
		expect(result.text.startsWith("Вход в CRM не выполнен")).toBe(true);
		expect(result.text).not.toContain("s3cret-pass");
	});
});
