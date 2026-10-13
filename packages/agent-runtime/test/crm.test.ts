import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, afterAll } from "vitest";
import {
	CRM_COMPILE_TOOL,
	CRM_UPDATE_TOOL,
	CrmActionRecord,
	CrmConnection,
	CrmTool,
	CrmToolsOptions,
	FetchLike,
	createCrmTools,
	extractBuildErrors,
	markLog,
	readSince,
	utcDateFolder,
} from "../src/crm";

const tmpDirs: string[] = [];

afterAll(() => {
	for (const dir of tmpDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

const connection: CrmConnection = { url: "http://crm.test/", user: "tester", password: "s3cret-pass" };

interface RecordedRequest { url: string; method: string; headers: Record<string, string>; body: string }
type Handler = (request: RecordedRequest) => Response | Promise<Response>;

/** Fake CRM: a per-path script; every request is recorded. */
function fakeCrm(routes: Record<string, Handler>): { fetchImpl: FetchLike; requests: RecordedRequest[] } {
	const requests: RecordedRequest[] = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const request: RecordedRequest = {
			url: String(url),
			method: init?.method ?? "GET",
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: String(init?.body ?? ""),
		};
		requests.push(request);
		const handler = routes[new URL(request.url).pathname];
		if (!handler) {
			throw new Error(`no route for ${request.url}`);
		}
		return handler(request);
	}) as unknown as FetchLike;
	return { fetchImpl, requests };
}

function loginResponse(): Response {
	const headers = new Headers();
	headers.append("set-cookie", "BPMCSRF=csrf123; path=/");
	headers.append("set-cookie", ".ASPXAUTH=auth456; path=/");
	return new Response(JSON.stringify({ Code: 0, Message: null }), { status: 200, headers });
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeAppRoot(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-"));
	tmpDirs.push(dir);
	fs.mkdirSync(path.join(dir, "Logs", utcDateFolder(new Date())), { recursive: true });
	return dir;
}

function logFile(appRoot: string, name: string): string {
	return path.join(appRoot, "Logs", utcDateFolder(new Date()), name);
}

function getTool(name: string, options: CrmToolsOptions): CrmTool {
	const tool = createCrmTools(options).find((item) => item.name === name);
	if (!tool) {
		throw new Error(`no tool ${name}`);
	}
	return tool;
}

const emptyUpdate = { changes: [], errors: [], success: true, errorInfo: null };
const buildFailed = {
	message: null,
	errors: [
		{ line: 111, column: 15, errorNumber: "CS0029", errorText: "Cannot implicitly convert type 'string' to 'int'", warning: false, fileName: "TestTicketService.cs" },
		{ line: 1, column: 1, errorNumber: "MSB3243", errorText: "No way to resolve conflict", warning: true, fileName: "Test.csproj" },
	],
	buildResult: 1,
	success: false,
};
const buildOk = { message: "Конфигурация успешно скомпилирована", errors: null, buildResult: 0, success: true, errorInfo: null };

describe("CRM tools", () => {
	it("logs in with JSON credentials and sends cookies, BPMCSRF and a null body afterwards", async () => {
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse(emptyUpdate),
		});
		await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		const login = requests[0];
		expect(login.url).toBe("http://crm.test/ServiceModel/AuthService.svc/Login");
		expect(login.method).toBe("POST");
		expect(JSON.parse(login.body)).toEqual({ UserName: "tester", UserPassword: "s3cret-pass" });

		const update = requests[1];
		expect(update.headers.Cookie).toContain("BPMCSRF=csrf123");
		expect(update.headers.Cookie).toContain(".ASPXAUTH=auth456");
		expect(update.headers.BPMCSRF).toBe("csrf123");
		expect(update.headers["Content-Type"]).toBe("application/json; charset=utf-8");
		expect(update.headers.Accept).toBe("application/json");
		expect(update.body).toBe("null");
	});

	it("reports loaded schemas of a successful update", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse({
				changes: [{
					name: "TestPackage2",
					typeName: "Package",
					stateCaption: "Изменено",
					items: [{ name: "TestProc", typeName: "Schema", typeCaption: "Схема", stateCaption: "Изменено" }],
				}],
				errors: [],
				success: true,
				errorInfo: null,
			}),
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(false);
		expect(result.text).toContain("Загружено:");
		expect(result.text).toContain("TestPackage2: TestProc (Схема, Изменено)");
	});

	it("returns schema load errors with the excerpt of PackagesSynchronization.log", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => {
				fs.appendFileSync(logFile(appRoot, "PackagesSynchronization.log"), [
					"2026-10-13 10:40:00,000 [1] INFO --> PackageInstallUtilities.LoadPackagesToDB",
					"2026-10-13 10:40:01,000 [1] ERROR Terrasoft.Core.Packages System.FormatException: Input string was not in a correct format.",
					"   at System.Number.ThrowFormatException()",
					"2026-10-13 10:40:01,500 [1] INFO <-- PackageInstallUtilities.LoadPackagesToDB",
					"",
				].join("\n"));
				return jsonResponse({
					changes: [],
					errors: [{
						workspaceItem: { name: "TestProc", typeName: "Schema" },
						errorInfo: { errorCode: "FormatException", message: "Input string was not in a correct format." },
					}],
					success: true,
					errorInfo: null,
				});
			},
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl, appRoot }).execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("TestProc (Schema): FormatException: Input string was not in a correct format.");
		expect(result.text).toContain("Журнал PackagesSynchronization.log:");
		expect(result.text).toContain("System.FormatException");
		expect(result.text).not.toContain(connection.password);
	});

	it("reports no changes when nothing was loaded", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse(emptyUpdate),
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(false);
		expect(result.text).toContain("Изменений не было.");
	});

	it("reports compile errors, skips warnings and does not restart the application", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => {
				fs.appendFileSync(logFile(appRoot, "Build.log"), [
					"2026-10-13 10:40:27,583 [.NET TP Worker] ERROR supervisor Build CaptureOutput - /app/Pkg/TestTicketService.cs(111,15): error CS0029: Cannot implicitly convert type 'string' to 'int' [/app/Test.csproj]",
					"2026-10-13 10:40:28,000 [.NET TP Worker] ERROR supervisor Build CaptureOutput - Build FAILED.",
					"",
				].join("\n"));
				return jsonResponse(buildFailed);
			},
			"/ServiceModel/AppInstallerService.svc/RestartApp": () => jsonResponse({ success: true, errorInfo: null }),
		});
		const result = await getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, appRoot }).execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("TestTicketService.cs(111,15): CS0029");
		expect(result.text).not.toContain("MSB3243");
		expect(requests.some((request) => request.url.endsWith("/RestartApp"))).toBe(false);
	});

	it("restarts after a successful compile and waits until the application has started", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildOk),
			"/ServiceModel/AppInstallerService.svc/RestartApp": () => {
				fs.appendFileSync(logFile(appRoot, "Common.log"), [
					"2026-10-13 10:41:00,000 [1] INFO Application starting",
					"2026-10-13 10:41:04,000 [1] INFO Application started",
					"",
				].join("\n"));
				return jsonResponse({ success: true, errorInfo: null });
			},
		});
		const result = await getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, appRoot, restartPollMs: 10 }).execute();

		expect(requests.some((request) => request.url.endsWith("/RestartApp"))).toBe(true);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("Приложение перезапущено");
	});

	it("finishes a restart without Common.log: a failed login and then a successful one count as ready", async () => {
		const appRoot = makeAppRoot();
		let logins = 0;
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => {
				logins++;
				return logins === 2 ? jsonResponse({ message: "Service unavailable" }, 503) : loginResponse();
			},
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildOk),
			"/ServiceModel/AppInstallerService.svc/RestartApp": () => jsonResponse({ success: true, errorInfo: null }),
		});
		const result = await getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, appRoot, restartPollMs: 10 }).execute();

		expect(result.isError).toBe(false);
		expect(result.text).toContain("Приложение перезапущено");
	});

	it("does nothing when the user declines the action", async () => {
		const records: CrmActionRecord[] = [];
		const { fetchImpl, requests } = fakeCrm({});
		const result = await getTool(CRM_UPDATE_TOOL, {
			connection,
			fetchImpl,
			confirm: async () => false,
			onAction: (record) => records.push(record),
		}).execute();

		expect(requests).toHaveLength(0);
		expect(result.isError).toBe(true);
		expect(records[0].denied).toBe(true);
	});

	it("reports a rejected login with the CRM message and the no-retry hint", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => jsonResponse({ Code: 1, Message: "Неверный логин" }),
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("Вход в CRM не выполнен: Неверный логин")).toBe(true);
		expect(result.text).toContain("Не повторяй вызов");
	});

	it("trims the trailing dot of the CRM login message before the no-retry hint", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => jsonResponse({ Code: 1, Message: "Неверный логин." }),
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("Неверный логин. Не повторяй");
		expect(result.text).not.toContain("..");
	});

	it("reports an unavailable CRM with the network error code", async () => {
		const fetchImpl = (async () => {
			throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
		}) as unknown as FetchLike;
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("CRM недоступна:")).toBe(true);
		expect(result.text).toContain("ECONNREFUSED");
	});

	it("extracts the compiler error line without the project suffix and the build marker", () => {
		const sample = [
			"2026-10-13 10:40:27,583 [.NET TP Worker] ERROR supervisor Build CaptureOutput - /app/Pkg/TestTicketService.cs(111,15): error CS0029: Cannot implicitly convert type 'string' to 'int' [/app/Test.csproj]",
			"2026-10-13 10:40:28,000 [.NET TP Worker] ERROR supervisor Build CaptureOutput - Build FAILED.",
		].join("\n");
		const result = extractBuildErrors(sample);

		expect(result).toContain("/app/Pkg/TestTicketService.cs(111,15): error CS0029: Cannot implicitly convert type 'string' to 'int'");
		expect(result).not.toContain("[/app");
		expect(result).toContain("Build FAILED.");
	});

	it("reads log text appended across a UTC date change", () => {
		const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crm-"));
		tmpDirs.push(appRoot);
		const before = new Date("2026-10-12T23:59:00Z");
		const after = new Date("2026-10-13T00:01:00Z");
		const oldFile = path.join(appRoot, "Logs", "2026-10-12", "Common.log");
		const newFile = path.join(appRoot, "Logs", "2026-10-13", "Common.log");
		fs.mkdirSync(path.dirname(oldFile), { recursive: true });
		fs.mkdirSync(path.dirname(newFile), { recursive: true });
		fs.writeFileSync(oldFile, "old start line\n");

		const mark = markLog(appRoot, "Common.log", before);
		fs.appendFileSync(oldFile, "old appended line\n");
		fs.writeFileSync(newFile, "new day line\n");

		const text = readSince(mark, after);
		expect(text).toContain("old appended line");
		expect(text).toContain("new day line");
		expect(text).not.toContain("old start line");
	});
});
