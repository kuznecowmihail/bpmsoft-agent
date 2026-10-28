import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, afterAll } from "vitest";
import {
	CRM_COMPILE_TOOL,
	CRM_UPDATE_TOOL,
	CrmActionRecord,
	CrmConnection,
	CrmSession,
	CrmStoppedError,
	CrmTool,
	CrmToolsOptions,
	FetchLike,
	buildResult,
	createCrmTools,
	extractBuildErrors,
	isPackageSyncFinished,
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

	/** One tool instance: the fix loop lives in createCrmTools, so repeated calls share it. */
	function sharedTool(name: string, options: CrmToolsOptions): CrmTool {
		const tool = createCrmTools(options).find((item) => item.name === name);
		if (!tool) {
			throw new Error(`no tool ${name}`);
		}
		return tool;
	}

	it("stops compile attempts at the checkpoint and blocks the next call without a CRM request", async () => {
		let builds = 0;
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => {
				builds++;
				return jsonResponse({
					message: null,
					errors: [{ line: 111, column: 15, errorNumber: "CS0029", errorText: `text ${builds}`, warning: false, fileName: "TestTicketService.cs" }],
					buildResult: 1,
					success: false,
				});
			},
		});
		const records: CrmActionRecord[] = [];
		const compile = sharedTool(CRM_COMPILE_TOOL, { connection, fetchImpl, onAction: (record) => records.push(record) });

		let last = { text: "", isError: false };
		for (let i = 0; i < 5; i++) {
			last = await compile.execute();
		}
		expect(last.text).toContain("контрольная точка");

		const requestsBefore = requests.length;
		const blocked = await compile.execute();
		expect(blocked.isError).toBe(true);
		expect(blocked.text).toContain("Контрольная точка уже достигнута");
		expect(requests).toHaveLength(requestsBefore);
		expect(records[records.length - 1].blocked).toBe(true);
	});

	it("does not count rejected logins toward the checkpoint", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => jsonResponse({ Code: 1, Message: "Неверный логин" }),
		});
		const update = sharedTool(CRM_UPDATE_TOOL, { connection, fetchImpl });
		for (let i = 0; i < 6; i++) {
			const result = await update.execute();
			expect(result.text).not.toContain("Неудачная попытка");
		}
	});

	it("runs lint before update: lint errors stop the update without CRM calls or confirmation", async () => {
		const { fetchImpl, requests } = fakeCrm({});
		let confirmed = false;
		const update = sharedTool(CRM_UPDATE_TOOL, {
			connection,
			fetchImpl,
			confirm: async () => {
				confirmed = true;
				return true;
			},
			lint: () => ({ ok: false, text: "ОШИБКА x" }),
		});

		const first = await update.execute();
		expect(requests).toHaveLength(0);
		expect(confirmed).toBe(false);
		expect(first.isError).toBe(true);
		expect(first.text).toContain("ОШИБКА x");
		expect(first.text).toContain("Неудачная попытка 1 из 5");

		let last = first;
		for (let i = 1; i < 5; i++) {
			last = await update.execute();
		}
		expect(last.text).toMatch(/контрольная точка/i);
		expect(requests).toHaveLength(0);
	});

	it("notices a compile error in a schema that this chat did not change", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse({
				message: null,
				errors: [{ line: 5, column: 3, errorNumber: "CS0103", errorText: "name does not exist", warning: false, fileName: "/app/Pkg/TestTicketService.cs" }],
				buildResult: 1,
				success: false,
			}),
		});
		const compile = sharedTool(CRM_COMPILE_TOOL, { connection, fetchImpl, ownSchemas: () => new Set(["Other"]) });
		const result = await compile.execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("Исправить ошибку в TestTicketService?");
	});

	it("shares one running compile between duplicate concurrent calls: one Build request, one onAction", async () => {
		const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
		let builds = 0;
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": async () => {
				builds++;
				await delay(20);
				return jsonResponse(buildFailed);
			},
		});
		const records: CrmActionRecord[] = [];
		const compile = sharedTool(CRM_COMPILE_TOOL, { connection, fetchImpl, onAction: (record) => records.push(record) });

		const [first, second] = await Promise.all([compile.execute(), compile.execute()]);

		expect(builds).toBe(1);
		expect(second).toBe(first);
		expect(first.isError).toBe(true);
		expect(records.filter((record) => record.action === "compile")).toHaveLength(1);
	});

	it("serializes update and compile: the Build request starts after LoadPackagesToDB has finished", async () => {
		const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
		const events: string[] = [];
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": async () => {
				events.push("load-start");
				await delay(20);
				events.push("load-end");
				return jsonResponse(emptyUpdate);
			},
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => {
				events.push("build-start");
				return jsonResponse(buildFailed);
			},
		});
		const tools = createCrmTools({ connection, fetchImpl });
		const update = tools.find((item) => item.name === CRM_UPDATE_TOOL);
		const compile = tools.find((item) => item.name === CRM_COMPILE_TOOL);
		if (!update || !compile) {
			throw new Error("CRM tools missing");
		}

		await Promise.all([update.execute(), compile.execute()]);

		expect(events).toEqual(["load-start", "load-end", "build-start"]);
	});

	it("puts the lint error line without the prefix into the update record", async () => {
		const records: CrmActionRecord[] = [];
		const { fetchImpl, requests } = fakeCrm({});
		const update = sharedTool(CRM_UPDATE_TOOL, {
			connection,
			fetchImpl,
			onAction: (record) => records.push(record),
			lint: () => ({ ok: false, text: "pkg_lint: проверено схем: 1\n== X\nОШИБКА descriptor.json: JSON не разбирается" }),
		});
		await update.execute();

		expect(requests).toHaveLength(0);
		expect(records[0].error).toBe("descriptor.json: JSON не разбирается");
	});

	it("updates before compile when Pkg changed and no update ran in this turn", async () => {
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse(emptyUpdate),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildFailed),
		});
		const compile = getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, changedSince: () => true });
		const result = await compile.execute();

		const paths = requests.map((request) => new URL(request.url).pathname).filter((p) => !p.endsWith("/Login"));
		expect(paths).toEqual([
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB",
			"/ServiceModel/WorkspaceExplorerService.svc/Build",
		]);
		expect(result.text).toContain("Перед компиляцией выполнено обновление");
	});

	it("compiles without update when Pkg did not change", async () => {
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse(emptyUpdate),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildFailed),
		});
		const compile = getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, changedSince: () => false });
		await compile.execute();

		const paths = requests.map((request) => new URL(request.url).pathname).filter((p) => !p.endsWith("/Login"));
		expect(paths).toEqual(["/ServiceModel/WorkspaceExplorerService.svc/Build"]);
	});

	it("skips the automatic update when the last successful update in this tools instance is newer than the changes", async () => {
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse(emptyUpdate),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildFailed),
		});
		const tools = createCrmTools({ connection, fetchImpl, changedSince: (ms) => ms < Date.now() - 60000 });
		const update = tools.find((item) => item.name === CRM_UPDATE_TOOL);
		const compile = tools.find((item) => item.name === CRM_COMPILE_TOOL);
		if (!update || !compile) {
			throw new Error("CRM tools missing");
		}
		await update.execute();
		await compile.execute();

		const paths = requests.map((request) => new URL(request.url).pathname).filter((p) => !p.endsWith("/Login"));
		expect(paths).toEqual([
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB",
			"/ServiceModel/WorkspaceExplorerService.svc/Build",
		]);
	});

	it("does not compile when the automatic update fails", async () => {
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => jsonResponse({
				changes: [],
				errors: [{
					workspaceItem: { name: "TestProc", typeName: "Schema" },
					errorInfo: { errorCode: "FormatException", message: "bad" },
				}],
				success: true,
				errorInfo: null,
			}),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => jsonResponse(buildFailed),
		});
		const compile = getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, changedSince: () => true });
		const result = await compile.execute();

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("Компиляция не запускалась")).toBe(true);
		expect(requests.some((request) => request.url.endsWith("/Build"))).toBe(false);
	});

	it("cuts a running CRM request short when the user stops it", async () => {
		const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
		})) as unknown as FetchLike;
		const session = new CrmSession(connection, fetchImpl);
		const stop = new AbortController();
		setTimeout(() => stop.abort(), 10);

		await expect(session.post("/ServiceModel/WorkspaceExplorerService.svc/Build", 5000, stop.signal)).rejects.toBeInstanceOf(CrmStoppedError);
	});

	it("returns the stopped result without CRM calls when the user stopped before the action", async () => {
		const { fetchImpl, requests } = fakeCrm({});
		const records: CrmActionRecord[] = [];
		const stop = new AbortController();
		stop.abort();
		const result = await getTool(CRM_UPDATE_TOOL, {
			connection,
			fetchImpl,
			signal: stop.signal,
			onAction: (record) => records.push(record),
		}).execute();

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("Остановлено пользователем")).toBe(true);
		expect(records[0].stopped).toBe(true);
		expect(requests).toHaveLength(0);
	});

	it("after an update timeout takes the outcome from the stand log when the package block has ended", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => {
				fs.appendFileSync(logFile(appRoot, "PackagesSynchronization.log"), [
					"2026-10-13 10:40:00,000 [1] INFO --> PackageInstallUtilities.LoadPackagesToDB",
					"2026-10-13 10:45:00,000 [1] INFO <-- PackageInstallUtilities.LoadPackagesToDB",
					"",
				].join("\n"));
				throw timeoutError();
			},
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl, appRoot, logWaitPollMs: 10, logWaitLimitMs: 1000 }).execute();

		expect(result.isError).toBe(false);
		expect(result.text).toMatch(/по журналу|завершение видно в журнале/);
	});

	it("after an update timeout without the end marker says not to repeat the call and does not blame the CRM as down", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => {
				fs.appendFileSync(logFile(appRoot, "PackagesSynchronization.log"), "2026-10-13 10:40:00,000 [1] INFO --> PackageInstallUtilities.LoadPackagesToDB\n");
				throw timeoutError();
			},
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl, appRoot, logWaitPollMs: 10, logWaitLimitMs: 50 }).execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("не повторяй вызов");
		expect(result.text).not.toContain("CRM недоступна");
	});

	it("after an update timeout without appRoot says the CRM did not answer", async () => {
		const { fetchImpl } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/AppInstallerService.svc/LoadPackagesToDB": () => {
				throw timeoutError();
			},
		});
		const result = await getTool(CRM_UPDATE_TOOL, { connection, fetchImpl }).execute();

		expect(result.isError).toBe(true);
		expect(result.text).toContain("CRM не ответила");
	});

	it("after a compile timeout reads Build.log and restarts when the build succeeded", async () => {
		const appRoot = makeAppRoot();
		const { fetchImpl, requests } = fakeCrm({
			"/ServiceModel/AuthService.svc/Login": () => loginResponse(),
			"/ServiceModel/WorkspaceExplorerService.svc/Build": () => {
				fs.appendFileSync(logFile(appRoot, "Build.log"), "2026-10-13 10:50:00,000 [1] INFO Build succeeded.\n");
				throw timeoutError();
			},
			"/ServiceModel/AppInstallerService.svc/RestartApp": () => {
				fs.appendFileSync(logFile(appRoot, "Common.log"), "2026-10-13 10:51:00,000 [1] INFO Application started\n");
				return jsonResponse({ success: true, errorInfo: null });
			},
		});
		const result = await getTool(CRM_COMPILE_TOOL, { connection, fetchImpl, appRoot, restartPollMs: 10, logWaitPollMs: 10 }).execute();

		expect(requests.some((request) => request.url.endsWith("/RestartApp"))).toBe(true);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("Приложение перезапущено");
	});

	it("checks the end of a package sync block and the last build result in log text", () => {
		expect(isPackageSyncFinished("x --> PackageInstallUtilities.LoadPackagesToDB\ny")).toBe(false);
		expect(isPackageSyncFinished("x --> PackageInstallUtilities.LoadPackagesToDB\ny <-- PackageInstallUtilities.LoadPackagesToDB")).toBe(true);
		expect(isPackageSyncFinished("no block")).toBe(false);
		expect(buildResult("Build FAILED.\nBuild succeeded.")).toBe("succeeded");
		expect(buildResult("Build succeeded.\nBuild FAILED.")).toBe("failed");
		expect(buildResult("nothing")).toBeUndefined();
	});
});

/** Network timeout as Node's fetch reports it when no response headers arrive in time. */
function timeoutError(): TypeError {
	const err = new TypeError("fetch failed");
	(err as { cause?: unknown }).cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
	return err;
}
