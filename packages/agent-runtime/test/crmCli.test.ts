import * as net from "net";
import * as os from "os";
import { describe, it, expect } from "vitest";
import { CrmCliDeps, runCrmCli } from "../src/crm/crmCli";
import { FetchLike } from "../src/crm";

const env = { BPMSOFT_CRM_URL: "http://crm.test/", BPMSOFT_CRM_USER: "tester", BPMSOFT_CRM_PASSWORD: "s3cret-pass" };
const baseDeps: CrmCliDeps = { cwd: os.tmpdir(), scriptDir: os.tmpdir() };

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

describe("crm.js CLI", () => {
	it("missing credentials return code 2 and never print the password", async () => {
		const result = await runCrmCli(["update", "--no-lint"], { BPMSOFT_CRM_URL: "http://crm.test/" }, baseDeps);
		expect(result.code).toBe(2);
		expect(result.text).toContain("BPMSOFT_CRM_URL, BPMSOFT_CRM_USER, BPMSOFT_CRM_PASSWORD");
		expect(result.text).not.toContain("s3cret-pass");
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

		let response: Response | undefined;
		for (let attempt = 0; attempt < 100 && response === undefined; attempt++) {
			try {
				response = await fetch(`http://127.0.0.1:${port}/`);
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		}
		expect(response).toBeDefined();
		expect(await response!.text()).toBe("s3cret-pass");
		expect(response!.headers.get("access-control-allow-origin")).toBe("http://crm.test");

		const result = await pending;
		expect(result.code).toBe(0);
		expect(result.text).toBe("Пароль передан странице");
		expect(lines.join("\n")).toContain(`http://127.0.0.1:${port}/`);
		expect(lines.join("\n")).not.toContain("s3cret-pass");
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
