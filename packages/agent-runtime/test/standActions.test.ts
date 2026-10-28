import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, it, expect } from "vitest";
import { FetchLike, standCompile, standRequest, startBrowserLogin, StandDeps } from "../src/crm";

const connection = { url: "http://crm.test/", user: "tester", password: "s3cret-pass" };
const tempDirs: string[] = [];

/** Deps with a root and knowledge folder; overrides win. */
function deps(extra: Partial<StandDeps> = {}): StandDeps {
	return { root: os.tmpdir(), knowledgeDir: os.tmpdir(), ...extra };
}

/** Temp stand root without a Pkg folder (pkg-lint is skipped there). */
function emptyStand(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stand-actions-"));
	tempDirs.push(dir);
	return dir;
}

afterAll(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

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

/** Port that is free at the moment of the call. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address !== null ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

interface HttpResult { status: number; body: string; headers: http.IncomingHttpHeaders }

/** GET to the browser-login server on 127.0.0.1 with the given headers (node:http keeps Origin as sent). */
function httpGet(port: number, headers: Record<string, string>): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const req = http.get({ host: "127.0.0.1", port, path: "/", headers }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk: string) => { body += chunk; });
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
		});
		req.on("error", reject);
	});
}

/** First request once the browser-login server is listening (retries while the port is not open yet). */
async function httpGetWhenUp(port: number, headers: Record<string, string>): Promise<HttpResult> {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			return await httpGet(port, headers);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}
	throw new Error("сервер browser-login не поднялся");
}

describe("stand actions", () => {
	it("request rejects a path outside the stand", async () => {
		const result = await standRequest(connection, deps(), { method: "GET", path: "http://evil.test/x" });
		expect(result.ok).toBe(false);
	});

	it("request GET logs in, sends the CSRF cookie and no body", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("{\"a\":1}", { status: 200 }));
		const result = await standRequest(connection, deps({ fetchImpl }), { method: "GET", path: "/0/odata/Contact/$count" });
		expect(result).toMatchObject({ ok: true });
		const call = requests[requests.length - 1];
		expect(call.method).toBe("GET");
		expect(call.headers.BPMCSRF).toBe("csrf123");
		expect(call.body).toBe("");
	});

	it("request POST without a body sends {}", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("{}", { status: 200 }));
		const result = await standRequest(connection, deps({ fetchImpl }), { method: "POST", path: "/ServiceModel/Test/Post" });
		expect(result.ok).toBe(true);
		expect(requests[requests.length - 1].body).toBe("{}");
	});

	it("request truncates the body to maxChars", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("0123456789", { status: 200 }));
		const result = await standRequest(connection, deps({ fetchImpl }), { method: "GET", path: "/x", maxChars: 5 });
		expect(result.ok).toBe(true);
		expect(result.text).toBe("HTTP 200\n01234\n… (обрезано, всего 10 символов)");
	});

	it("request with an HTTP error status is not ok", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("bad", { status: 500 }));
		expect((await standRequest(connection, deps({ fetchImpl }), { method: "GET", path: "/x" })).ok).toBe(false);
	});

	it("GET with a body is refused", async () => {
		expect((await standRequest(connection, deps(), { method: "GET", path: "/x", body: "{}" })).ok).toBe(false);
	});

	it("browser-login serves the password once with CORS for the CRM origin", async () => {
		const port = await freePort();
		const handle = await startBrowserLogin(connection, deps(), port);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}

		const response = await httpGetWhenUp(port, { Origin: "http://crm.test" });
		expect(response.status).toBe(200);
		expect(response.body).toBe("s3cret-pass");
		expect(response.headers["access-control-allow-origin"]).toBe("http://crm.test");

		const result = await handle.done;
		expect(result).toEqual({ ok: true, text: "Пароль передан странице" });
		expect(handle.text).toContain("http://crm.test/Login/Login.html");
		expect(handle.text).not.toContain("s3cret-pass");
	});

	it("browser-login refuses requests without the CRM origin and keeps the password for the right one", async () => {
		const port = await freePort();
		const handle = await startBrowserLogin(connection, deps({ browserLoginTimeoutMs: 5000 }), port);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}

		const noOrigin = await httpGetWhenUp(port, {});
		expect(noOrigin.status).toBe(403);
		expect(noOrigin.body).toBe("Пароль отдаётся только странице CRM");
		expect(noOrigin.body).not.toContain("s3cret-pass");

		const evil = await httpGet(port, { Origin: "http://evil.test" });
		expect(evil.status).toBe(403);
		expect(evil.body).not.toContain("s3cret-pass");

		let settled = false;
		void handle.done.then(() => { settled = true; });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(settled).toBe(false);

		const page = await httpGet(port, { Origin: "http://crm.test" });
		expect(page.status).toBe(200);
		expect(page.body).toBe("s3cret-pass");

		const result = await handle.done;
		expect(result.ok).toBe(true);
		expect(handle.text).not.toContain("s3cret-pass");
	});

	it("browser-login text holds one async IIFE that the run step asks Runtime.evaluate to await", async () => {
		const handle = await startBrowserLogin(connection, deps({ browserLoginTimeoutMs: 50 }), 0);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}
		const lines = handle.text.split("\n");
		const fragment = lines[lines.indexOf("Фрагмент JavaScript для этой страницы:") + 1] ?? "";
		expect(fragment.startsWith("(async () =>")).toBe(true);
		expect(fragment.endsWith("})()")).toBe(true);
		expect(lines.find((line) => line.includes("Выполни фрагмент"))).toContain("awaitPromise");
		await handle.done;
	});

	it("browser-login resolves not ok when the page does not take the password", async () => {
		const handle = await startBrowserLogin(connection, deps({ browserLoginTimeoutMs: 50 }), 0);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}
		const result = await handle.done;
		expect(result.ok).toBe(false);
		expect(result.text).toContain("не забрала пароль");
	});

	it("browser-login close() before a request closes the port and resolves not ok", async () => {
		const port = await freePort();
		const handle = await startBrowserLogin(connection, deps(), port);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}
		handle.close();
		const result = await handle.done;
		expect(result).toEqual({ ok: false, text: "Вход отменён" });
	});

	it("browser-login text never contains the password", async () => {
		const handle = await startBrowserLogin(connection, deps({ browserLoginTimeoutMs: 50 }), 0);
		expect(handle.ok).toBe(true);
		if (!handle.ok) {
			return;
		}
		expect(handle.text).toContain("Выполни фрагмент в этой странице");
		expect(handle.text).not.toContain("s3cret-pass");
		await handle.done;
	});

	it("compile runs the update before Build", async () => {
		const { fetchImpl, requests } = fakeFetch((request) => {
			if (request.url.endsWith("/LoadPackagesToDB")) {
				return new Response(JSON.stringify({ success: true, changes: [], errors: [] }), { status: 200 });
			}
			return new Response(JSON.stringify({ success: false, message: "сбой сборки", errors: [] }), { status: 200 });
		});
		const result = await standCompile(connection, deps({ root: emptyStand(), fetchImpl }));

		const calls = requests.map((request) => request.url).filter((url) => !url.endsWith("/AuthService.svc/Login"));
		expect(calls).toEqual([
			"http://crm.test/ServiceModel/AppInstallerService.svc/LoadPackagesToDB",
			"http://crm.test/ServiceModel/WorkspaceExplorerService.svc/Build",
		]);
		expect(result.ok).toBe(false);
		expect(result.text).toContain("Обновление из файловой системы выполнено.");
		expect(result.text).toContain("Компиляция завершилась с ошибками");
	});

	it("compile does not start Build when the update fails", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("внутренняя ошибка", { status: 500 }));
		const result = await standCompile(connection, deps({ root: emptyStand(), fetchImpl }));

		expect(result.ok).toBe(false);
		expect(result.text.startsWith("Компиляция не запускалась")).toBe(true);
		expect(requests.some((request) => request.url.endsWith("/Build"))).toBe(false);
	});
});
