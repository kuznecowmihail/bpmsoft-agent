import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, it, expect } from "vitest";
import { CrmCliDeps, runCrmCli } from "../src/crm/crmCli";
import { FetchLike } from "../src/crm";

const env = { BPMSOFT_CRM_URL: "http://crm.test/", BPMSOFT_CRM_USER: "tester", BPMSOFT_CRM_PASSWORD: "s3cret-pass" };
const baseDeps: CrmCliDeps = { cwd: os.tmpdir(), scriptDir: os.tmpdir() };
const NOT_CONFIGURED_PREFIX = "Доступ к CRM не настроен";
const tempDirs: string[] = [];

/** Temp stand root with .claude/settings.local.json holding the given content. */
function standWithSettings(content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-cli-"));
	tempDirs.push(dir);
	fs.mkdirSync(path.join(dir, ".claude"));
	fs.writeFileSync(path.join(dir, ".claude", "settings.local.json"), content, "utf8");
	return dir;
}

const settingsWithCrm = JSON.stringify({
	env: { BPMSOFT_CRM_URL: "http://crm.test/", BPMSOFT_CRM_USER: "tester", BPMSOFT_CRM_PASSWORD: "s3cret-pass" },
});

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

describe("crm.js CLI", () => {
	it("missing credentials return code 2 and never print the password", async () => {
		const result = await runCrmCli(["update", "--no-lint"], { BPMSOFT_CRM_URL: "http://crm.test/" }, baseDeps);
		expect(result.code).toBe(2);
		expect(result.text).toContain("BPMSOFT_CRM_URL, BPMSOFT_CRM_USER, BPMSOFT_CRM_PASSWORD");
		expect(result.text).not.toContain("s3cret-pass");
	});

	it("reads the connection from .claude/settings.local.json when env has none", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response('{"ok":true}', { status: 200 }));
		const cwd = standWithSettings(settingsWithCrm);
		const result = await runCrmCli(["request", "GET", "/ServiceModel/Test/Get"], {}, { ...baseDeps, cwd, fetchImpl });

		expect(result.code).toBe(0);
		expect(requests[0].url).toBe("http://crm.test/ServiceModel/AuthService.svc/Login");
		expect(requests[0].body).toContain("tester");
		expect(requests[1].url).toBe("http://crm.test/ServiceModel/Test/Get");
	});

	it("a non-empty env variable wins over the settings file, an empty one does not", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response('{"ok":true}', { status: 200 }));
		const cwd = standWithSettings(settingsWithCrm);
		const result = await runCrmCli(
			["request", "GET", "/x"],
			{ BPMSOFT_CRM_URL: "http://other.test/", BPMSOFT_CRM_USER: "", BPMSOFT_CRM_PASSWORD: "" },
			{ ...baseDeps, cwd, fetchImpl },
		);

		expect(result.code).toBe(0);
		expect(requests[0].url).toBe("http://other.test/ServiceModel/AuthService.svc/Login");
		expect(requests[0].body).toContain("tester");
		expect(requests[0].body).not.toContain("BPMSOFT_CRM");
	});

	it("invalid settings file gives the not-configured text", async () => {
		const cwd = standWithSettings("{ not json");
		const result = await runCrmCli(["update", "--no-lint"], {}, { ...baseDeps, cwd });

		expect(result.code).toBe(2);
		expect(result.text.startsWith(NOT_CONFIGURED_PREFIX)).toBe(true);
		expect(result.text).toContain(".claude/settings.local.json");
	});

	it("settings file with a BOM is read", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response('{"ok":true}', { status: 200 }));
		const cwd = standWithSettings("\uFEFF" + settingsWithCrm);
		const result = await runCrmCli(["request", "GET", "/x"], {}, { ...baseDeps, cwd, fetchImpl });

		expect(result.code).toBe(0);
		expect(requests[1].url).toBe("http://crm.test/x");
	});

	it("request rejects a URL outside the stand", async () => {
		const result = await runCrmCli(["request", "GET", "http://evil/x"], env, baseDeps);
		expect(result.code).toBe(2);
		expect(result.text).toBe("Путь должен начинаться с / и вести на стенд CRM");
	});

	it("request GET logs in, sends the CSRF cookie and no body", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response('{"ok":true}', { status: 200 }));
		const result = await runCrmCli(["request", "GET", "/ServiceModel/Test/Get"], env, { ...baseDeps, fetchImpl });

		expect(result.code).toBe(0);
		expect(result.text.startsWith("HTTP 200")).toBe(true);
		const get = requests[1];
		expect(get.method).toBe("GET");
		expect(get.url).toBe("http://crm.test/ServiceModel/Test/Get");
		expect(get.headers.BPMCSRF).toBe("csrf123");
		expect(get.body).toBe("");
	});

	it("request truncates the body to --max characters", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("0123456789", { status: 200 }));
		const result = await runCrmCli(["request", "GET", "/x", "--max", "5"], env, { ...baseDeps, fetchImpl });
		expect(result.code).toBe(0);
		expect(result.text).toBe("HTTP 200\n01234\n… (обрезано, всего 10 символов)");
	});

	it("request with an HTTP error status returns code 1", async () => {
		const { fetchImpl } = fakeFetch(() => new Response("нет такой страницы", { status: 404 }));
		const result = await runCrmCli(["request", "GET", "/x"], env, { ...baseDeps, fetchImpl });
		expect(result.code).toBe(1);
		expect(result.text).toBe("HTTP 404\nнет такой страницы");
	});

	it("browser-login serves the password once with CORS for the CRM origin", async () => {
		const port = await freePort();
		const lines: string[] = [];
		const pending = runCrmCli(["browser-login", "--port", String(port)], env, {
			...baseDeps,
			log: (line) => lines.push(line),
		});

		const response = await httpGetWhenUp(port, { Origin: "http://crm.test" });
		expect(response.status).toBe(200);
		expect(response.body).toBe("s3cret-pass");
		expect(response.headers["access-control-allow-origin"]).toBe("http://crm.test");

		const result = await pending;
		expect(result.code).toBe(0);
		expect(result.text).toBe("Пароль передан странице");
		expect(lines.join("\n")).toContain(`http://127.0.0.1:${port}/`);
		expect(lines.join("\n")).not.toContain("s3cret-pass");
	});

	it("browser-login refuses requests without the CRM origin and keeps the password for the right one", async () => {
		const port = await freePort();
		const lines: string[] = [];
		const pending = runCrmCli(["browser-login", "--port", String(port)], env, {
			...baseDeps,
			browserLoginTimeoutMs: 5000,
			log: (line) => lines.push(line),
		});

		const noOrigin = await httpGetWhenUp(port, {});
		expect(noOrigin.status).toBe(403);
		expect(noOrigin.body).toBe("Пароль отдаётся только странице CRM");
		expect(noOrigin.body).not.toContain("s3cret-pass");

		const evil = await httpGet(port, { Origin: "http://evil.test" });
		expect(evil.status).toBe(403);
		expect(evil.body).not.toContain("s3cret-pass");

		let settled = false;
		void pending.then(() => { settled = true; });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(settled).toBe(false);

		const page = await httpGet(port, { Origin: "http://crm.test" });
		expect(page.status).toBe(200);
		expect(page.body).toBe("s3cret-pass");

		const result = await pending;
		expect(result.code).toBe(0);
		const refusals = lines.filter((line) => line.includes("пароль не отдан"));
		expect(refusals).toHaveLength(2);
		expect(refusals[0]).toContain("Origin: нет");
		expect(refusals[1]).toContain("Origin: http://evil.test");
		expect(refusals[0]).toContain("http://crm.test/Login/Login.html");
		expect(lines.join("\n")).not.toContain("s3cret-pass");
	});

	it("browser-login prints one async IIFE that the run step asks Runtime.evaluate to await", async () => {
		const lines: string[] = [];
		await runCrmCli(["browser-login", "--port", "0"], env, {
			...baseDeps,
			browserLoginTimeoutMs: 50,
			log: (line) => lines.push(line),
		});
		const fragment = lines[lines.indexOf("Фрагмент JavaScript для этой страницы:") + 1] ?? "";
		expect(fragment.startsWith("(async () =>")).toBe(true);
		expect(fragment.endsWith("})()")).toBe(true);
		expect(lines.find((line) => line.includes("Выполни фрагмент"))).toContain("awaitPromise");
	});

	it("browser-login returns code 1 when the page does not take the password", async () => {
		const result = await runCrmCli(["browser-login", "--port", "0"], env, {
			...baseDeps,
			browserLoginTimeoutMs: 50,
			log: () => undefined,
		});
		expect(result.code).toBe(1);
		expect(result.text).toContain("не забрала пароль");
	});

	it("browser-login logs the login page URL and the run step, never the password", async () => {
		const lines: string[] = [];
		await runCrmCli(["browser-login", "--port", "0"], env, {
			...baseDeps,
			browserLoginTimeoutMs: 50,
			log: (line) => lines.push(line),
		});
		const output = lines.join("\n");
		expect(lines).toContain("Открой в браузере страницу входа: http://crm.test/Login/Login.html");
		expect(output).toContain("Выполни фрагмент в этой странице");
		expect(output).not.toContain("s3cret-pass");
	});

	it("compile runs the update before Build", async () => {
		const { fetchImpl, requests } = fakeFetch((request) => {
			if (request.url.endsWith("/LoadPackagesToDB")) {
				return new Response(JSON.stringify({ success: true, changes: [], errors: [] }), { status: 200 });
			}
			return new Response(JSON.stringify({ success: false, message: "сбой сборки", errors: [] }), { status: 200 });
		});
		const result = await runCrmCli(["compile", "--no-lint"], env, { ...baseDeps, fetchImpl });

		const calls = requests.map((request) => request.url).filter((url) => !url.endsWith("/AuthService.svc/Login"));
		expect(calls).toEqual([
			"http://crm.test/ServiceModel/AppInstallerService.svc/LoadPackagesToDB",
			"http://crm.test/ServiceModel/WorkspaceExplorerService.svc/Build",
		]);
		expect(result.code).toBe(1);
		expect(result.text).toContain("Обновление из файловой системы выполнено.");
		expect(result.text).toContain("Компиляция завершилась с ошибками");
	});

	it("compile does not start Build when the update fails", async () => {
		const { fetchImpl, requests } = fakeFetch(() => new Response("внутренняя ошибка", { status: 500 }));
		const result = await runCrmCli(["compile", "--no-lint"], env, { ...baseDeps, fetchImpl });

		expect(result.code).toBe(1);
		expect(result.text.startsWith("Компиляция не запускалась")).toBe(true);
		expect(requests.some((request) => request.url.endsWith("/Build"))).toBe(false);
	});

	it("compile rejects unknown arguments", async () => {
		const result = await runCrmCli(["compile", "--fast"], env, baseDeps);
		expect(result.code).toBe(2);
		expect(result.text).toContain("compile: лишние аргументы: --fast");
	});

	it("unknown command returns code 2 with usage", async () => {
		const result = await runCrmCli(["bogus"], env, baseDeps);
		expect(result.code).toBe(2);
		expect(result.text).toContain("Неизвестная команда: bogus");
		expect(result.text).toContain("browser-login");
	});
});
