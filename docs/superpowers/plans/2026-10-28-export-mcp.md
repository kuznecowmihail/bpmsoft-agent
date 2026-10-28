# Экспорт через MCP-сервер — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP-сервер `bpmsoft` в стенде с инструментами CRM и БД вместо `crm.js`; установка скиллов регистрирует его в Claude Code и Cursor.

**Architecture:** Логика действий на стенде выносится из `crmCli.ts` в `standActions.ts`; MCP-сервер (`src/mcp/`) вызывает её и `crmDbTool`. Доступы — файл `.claude/bpmsoft-agent.local.json`. Установка (`src/claudeExport/standIntegration.ts`) пишет файл доступов, `.mcp.json`, `.cursor/mcp.json` и `settings.local.json`.

**Tech Stack:** TypeScript, Node 18+, `@modelcontextprotocol/sdk` 1.30 (`McpServer.registerTool`, `StdioServerTransport`, `InMemoryTransport`), zod 4, esbuild, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-export-mcp-design.md`

## Global Constraints

- Агент desktop (`systemPrompt.ts`, провайдеры, встроенные инструменты) не меняется.
- Кроссплатформенно: пути через `path.join`, внешние программы без `shell: true`, никаких `~`, `$HOME`, `/tmp` в коде.
- JSON-файлы стенда: чужие ключи сохраняются; BOM и CRLF исходника сохраняются; неразбираемый файл не трогаем.
- MCP-сервер ничего не пишет в stdout, кроме протокола; диагностика — в stderr.
- Имя сервера `bpmsoft`; имена инструментов: `crm_update_from_fs`, `crm_compile`, `crm_restart`, `crm_request`, `crm_browser_login`, `crm_db_query`.
- Тексты экспорта нейтральны к инструменту, обезличены, без `crm.js`.
- Команды: тесты `npm test -w @bpmsoft-agent/agent-runtime`, сборка `npm run build -w @bpmsoft-agent/agent-runtime`.

---

### Task 1: `standActions.ts` — действия на стенде без CLI

**Files:**
- Create: `packages/agent-runtime/src/crm/standActions.ts`
- Modify: `packages/agent-runtime/src/crm/index.ts` (добавить `export * from "./standActions";`)
- Test: `packages/agent-runtime/test/standActions.test.ts`

**Interfaces:**
- Consumes: `createCrmTools`, `restartCrm`, `CRM_UPDATE_TOOL`, `CRM_COMPILE_TOOL` (`crmTools.ts`); `CrmSession`, `CrmConnection`, `CrmLoginError`, `FetchLike` (`crmSession.ts`); `formatCrmResponse`, `isStandPath` (`crmRequestTool.ts`); `runPkgLintCli` (`../lint/pkgLintCli`); `errorMessage` (`../db/crmDbTool`).
- Produces:

```ts
export interface StandDeps {
	/** Stand root (folder with BPMSoft.Configuration). */
	root: string;
	/** Knowledge folder; pkg-lint reads its checks from here. */
	knowledgeDir: string;
	fetchImpl?: FetchLike;
	restartPollMs?: number;
	restartLimitMs?: number;
	/** How long the browser login waits for the page (default 120000). */
	browserLoginTimeoutMs?: number;
}
export interface StandResult { ok: boolean; text: string }
export interface StandRequest { method: "GET" | "POST"; path: string; body?: string; maxChars?: number }
export interface BrowserLoginHandle { ok: true; text: string; done: Promise<StandResult>; close(): void }
export function standUpdate(connection: CrmConnection, deps: StandDeps): Promise<StandResult>;
export function standCompile(connection: CrmConnection, deps: StandDeps): Promise<StandResult>;
export function standRestart(connection: CrmConnection, deps: StandDeps): Promise<StandResult>;
export function standRequest(connection: CrmConnection, deps: StandDeps, request: StandRequest): Promise<StandResult>;
export function startBrowserLogin(connection: CrmConnection, deps: StandDeps, port?: number): Promise<BrowserLoginHandle | { ok: false; text: string }>;
```

- [ ] **Step 1: Write the failing tests.** Скопируй в `test/standActions.test.ts` из `test/crmCli.test.ts` хелперы `fakeFetch`, `RecordedRequest`, `afterAll`-уборку и перепиши кейсы на новые функции. Кейсы с разбором env, `settings.local.json`, usage и неизвестными аргументами не переносить. Обязательные:

```ts
import { describe, it, expect } from "vitest";
import * as os from "os";
import { standCompile, standRequest, startBrowserLogin, StandDeps } from "../src/crm/standActions";

const connection = { url: "http://crm.test/", user: "tester", password: "s3cret-pass" };
const deps = (extra: Partial<StandDeps> = {}): StandDeps => ({ root: os.tmpdir(), knowledgeDir: os.tmpdir(), ...extra });

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
	expect(call.body).toBe("");
});

it("request truncates the body to maxChars", async () => {
	const { fetchImpl } = fakeFetch(() => new Response("x".repeat(100), { status: 200 }));
	const result = await standRequest(connection, deps({ fetchImpl }), { method: "GET", path: "/x", maxChars: 10 });
	expect(result.text).not.toContain("x".repeat(11));
});

it("request with an HTTP error status is not ok", async () => {
	const { fetchImpl } = fakeFetch(() => new Response("bad", { status: 500 }));
	expect((await standRequest(connection, deps({ fetchImpl }), { method: "GET", path: "/x" })).ok).toBe(false);
});

it("GET with a body is refused", async () => {
	expect((await standRequest(connection, deps(), { method: "GET", path: "/x", body: "{}" })).ok).toBe(false);
});
```

Для browser-login перенеси кейсы «serves the password once with CORS», «refuses requests without the CRM origin», «one async IIFE», «does not take the password», «never logs the password»: вместо лога проверяй `handle.text` (адрес `http://crm.test/Login/Login.html`, фрагмент, нет пароля), вместо результата CLI — `await handle.done`. Добавь кейс: `close()` до запроса закрывает порт и `done` даёт `ok: false`. Для compile перенеси «compile runs the update before Build» и «compile does not start Build when the update fails» (корень без `BPMSoft.Configuration/Pkg` — pkg-lint пропускается, как в CLI).

- [ ] **Step 2: Run tests, expect FAIL** (`Cannot find module '../src/crm/standActions'`): `npx vitest run test/standActions.test.ts` в `packages/agent-runtime`.

- [ ] **Step 3: Implement.** Перенеси тела `runTool`, `runUpdate`, `runCompile`, `runRestart`, `runRequest`, `runBrowserLogin`, `failureText` из `src/crm/crmCli.ts` (строки 99–299) в `standActions.ts` с такими изменениями:
  - `deps.cwd` → `deps.root`; `path.join(deps.scriptDir, "..")` → `deps.knowledgeDir`;
  - без разбора аргументов: `standUpdate`/`standCompile` всегда с pkg-lint; `standRequest` берёт `method`, `path`, `body`, `maxChars ?? 4000`; тело-файл (`@файл`) не поддерживается; POST без тела → `"{}"`;
  - код возврата → `ok: boolean` (`code === 0` ↔ `ok: true`);
  - `startBrowserLogin`: после `listen` возвращает `{ ok: true, text, done, close }`, где `text` — те же строки, что сейчас уходят в `log` (через `\n`), а `done` — промис, который сейчас резолвит CLI; `close()` вызывает `finish({ ok: false, text: "Вход отменён" })`. Ошибка `listen` до старта → `{ ok: false, text }`. Неверный `connection.url` → `{ ok: false, text: "Адрес CRM не похож на адрес (нужен http:// или https://)" }`. Сообщение для запроса с чужим Origin (раньше `log`) — в `process.stderr`.
  - Константы `REQUEST_TIMEOUT_MS = 120000`, `DEFAULT_MAX_CHARS = 4000`, `DEFAULT_BROWSER_PORT = 8919`, `BROWSER_LOGIN_TIMEOUT_MS = 120000` — в новый модуль.
  `crmCli.ts` пока не трогать (удаляется в Task 7).

- [ ] **Step 4: Run tests, expect PASS**: `npx vitest run test/standActions.test.ts test/crmCli.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add packages/agent-runtime/src/crm/standActions.ts packages/agent-runtime/src/crm/index.ts packages/agent-runtime/test/standActions.test.ts
git commit -m "agent-runtime: stand actions without CLI parsing"
```

### Task 2: `standConfig.ts` — файл доступов

**Files:**
- Create: `packages/agent-runtime/src/mcp/standConfig.ts`
- Test: `packages/agent-runtime/test/standConfig.test.ts`

**Interfaces:**
- Consumes: `CrmConnection` (`../crm/crmSession`).
- Produces:

```ts
export const STAND_CONFIG_REL = ".claude/bpmsoft-agent.local.json";
export interface StandDbConfig { host?: string; port?: number; user?: string; password?: string }
export interface StandConfig { version: 1; crm?: CrmConnection; db?: StandDbConfig }
export function parseStandConfig(text: string): StandConfig | { error: string };
export function readStandConfig(root: string): StandConfig | { error: string };
```

- [ ] **Step 1: Write the failing tests**

```ts
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
});
```

- [ ] **Step 2: Run, expect FAIL**: `npx vitest run test/standConfig.test.ts`.

- [ ] **Step 3: Implement.** `parseStandConfig`: снять BOM, `JSON.parse` в try (ошибка → `{ error: "Файл доступов .claude/bpmsoft-agent.local.json не разбирается как JSON" }`); не объект → та же ошибка; `crm` — если есть, нужны непустые строки `url`, `user`, `password`, иначе `{ error: "В файле доступов неполный блок crm" }`; `db` — если есть и объект, взять только `host` (string), `port` (number), `user` (string), `password` (string), остальное отбросить. Результат `{ version: 1, ...(crm && { crm }), ...(db && { db }) }`. `readStandConfig(root)`: путь `path.join(root, ...STAND_CONFIG_REL.split("/"))`; нет файла → `{ version: 1 }`; иначе `parseStandConfig(fs.readFileSync(file, "utf8"))`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add packages/agent-runtime/src/mcp/standConfig.ts packages/agent-runtime/test/standConfig.test.ts
git commit -m "agent-runtime: stand access file for the MCP server"
```

### Task 3: MCP-сервер и бандл

**Files:**
- Create: `packages/agent-runtime/src/mcp/bpmsoftMcpServer.ts`, `packages/agent-runtime/src/mcp/mcpMain.ts`, `packages/agent-runtime/src/mcp/index.ts`
- Modify: `packages/agent-runtime/src/index.ts` (добавить `export * from "./mcp";`), `packages/agent-runtime/package.json` (скрипт `build`)
- Test: `packages/agent-runtime/test/bpmsoftMcpServer.test.ts`

**Interfaces:**
- Consumes: Task 1 (`standUpdate`, `standCompile`, `standRestart`, `standRequest`, `startBrowserLogin`, `StandDeps`, `BrowserLoginHandle`), Task 2 (`StandConfig`, `readStandConfig`), `createCrmDbTool`, `DbClient`, `DbClientConfig` (`../db/crmDbTool`).
- Produces:

```ts
export const MCP_SERVER_NAME = "bpmsoft";
export const MCP_TOOL_NAMES = ["crm_update_from_fs", "crm_compile", "crm_restart", "crm_request", "crm_browser_login", "crm_db_query"] as const;
export interface BpmsoftMcpOptions extends StandDeps {
	config: StandConfig;
	dbClientFactory?: (config: DbClientConfig) => DbClient;
}
export function createBpmsoftMcpServer(options: BpmsoftMcpOptions): McpServer;
```
`src/mcp/index.ts`: `export * from "./standConfig"; export * from "./bpmsoftMcpServer";` (без `mcpMain`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import * as os from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBpmsoftMcpServer, BpmsoftMcpOptions } from "../src/mcp/bpmsoftMcpServer";

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
	it("has no tools when nothing is configured", async () => {
		const client = await connect({ config: { version: 1 } });
		expect((await client.listTools()).tools).toEqual([]);
	});
	it("has CRM tools without the database tool", async () => {
		const client = await connect({ config: { version: 1, crm } });
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(["crm_browser_login", "crm_compile", "crm_request", "crm_restart", "crm_update_from_fs"]);
	});
	it("has only the database tool when only db is configured", async () => {
		const client = await connect({ config: { version: 1, db: {} } });
		expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["crm_db_query"]);
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
```
`fakeFetch` — скопируй из `test/standActions.test.ts`.

- [ ] **Step 2: Run, expect FAIL**: `npx vitest run test/bpmsoftMcpServer.test.ts`.

- [ ] **Step 3: Implement `bpmsoftMcpServer.ts`**

```ts
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StandConfig } from "./standConfig";
import { standCompile, standRequest, standRestart, standUpdate, startBrowserLogin } from "../crm/standActions";
import type { BrowserLoginHandle, StandDeps, StandResult } from "../crm/standActions";
import { createCrmDbTool } from "../db/crmDbTool";
import type { DbClient, DbClientConfig } from "../db/crmDbTool";

export const MCP_SERVER_NAME = "bpmsoft";
export const MCP_TOOL_NAMES = ["crm_update_from_fs", "crm_compile", "crm_restart", "crm_request", "crm_browser_login", "crm_db_query"] as const;

export interface BpmsoftMcpOptions extends StandDeps {
	config: StandConfig;
	dbClientFactory?: (config: DbClientConfig) => DbClient;
}

/** MCP tool result from a stand action. */
function toolResult(result: StandResult) {
	return { content: [{ type: "text" as const, text: result.text }], isError: !result.ok };
}

/** MCP server of the stand: CRM actions when CRM access is configured, the read-only database query when database access is on. */
export function createBpmsoftMcpServer(options: BpmsoftMcpOptions): McpServer {
	const server = new McpServer({ name: MCP_SERVER_NAME, version: "1" });
	const { config, dbClientFactory, ...deps } = options;
	const crm = config.crm;
	if (crm) {
		server.registerTool("crm_update_from_fs", {
			description: "«Обновить из файловой системы» в CRM. Сначала pkg-lint по изменённым в git схемам; при ошибках в CRM ничего не отправляется.",
		}, async () => toolResult(await standUpdate(crm, deps)));
		server.registerTool("crm_compile", {
			description: "Обновление из файловой системы, затем компиляция и перезапуск приложения с ожиданием запуска (до нескольких минут). При ошибке обновления компиляция не запускается.",
		}, async () => toolResult(await standCompile(crm, deps)));
		server.registerTool("crm_restart", {
			description: "Только перезапуск приложения и ожидание запуска. Стенд общий: перезапуск прерывает работу всех пользователей.",
		}, async () => toolResult(await standRestart(crm, deps)));
		server.registerTool("crm_request", {
			description: "REST-запрос к стенду от пользователя CRM из настроек (вход и BPMCSRF — сам). Путь от корня стенда, например /0/DataService/json/SyncReply/SelectQuery.",
			inputSchema: {
				method: z.enum(["GET", "POST"]),
				path: z.string().describe("Путь от корня стенда, начинается с /"),
				body: z.string().optional().describe("Тело POST-запроса — JSON-строка"),
				maxChars: z.number().int().min(0).optional().describe("Сколько символов ответа вернуть, по умолчанию 4000"),
			},
		}, async (args) => toolResult(await standRequest(crm, deps, args)));
		let login: BrowserLoginHandle | undefined;
		server.registerTool("crm_browser_login", {
			description: "Вход в CRM в браузере сессии без пароля в чате: возвращает адрес страницы входа и фрагмент JavaScript, который нужно выполнить на этой странице в течение 120 с.",
			inputSchema: { port: z.number().int().min(0).max(65535).optional().describe("Локальный порт выдачи пароля, по умолчанию 8919") },
		}, async ({ port }) => {
			login?.close();
			const started = await startBrowserLogin(crm, deps, port);
			if (!started.ok) {
				return toolResult(started);
			}
			login = started;
			return toolResult({ ok: true, text: started.text });
		});
	}
	if (config.db) {
		const dbTool = createCrmDbTool({
			connectionStringsPath: path.join(deps.root, "ConnectionStrings.config"),
			override: config.db,
			clientFactory: dbClientFactory,
		});
		server.registerTool("crm_db_query", {
			description: dbTool.description,
			inputSchema: { sql: z.string().describe("Один запрос SELECT") },
		}, async ({ sql }) => {
			const result = await dbTool.execute(sql);
			return { content: [{ type: "text" as const, text: result.text }], isError: result.isError };
		});
	}
	return server;
}
```

- [ ] **Step 4: Implement `mcpMain.ts`**

```ts
import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBpmsoftMcpServer } from "./bpmsoftMcpServer";
import { readStandConfig } from "./standConfig";

/** Entry of the bpmsoft-mcp.js bundle: stand root from --root, CLAUDE_PROJECT_DIR or the current folder. */
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = path.resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.env.CLAUDE_PROJECT_DIR || process.cwd());
const read = readStandConfig(root);
if ("error" in read) {
	process.stderr.write(`${read.error}\n`);
}
const server = createBpmsoftMcpServer({ root, knowledgeDir: path.join(__dirname, ".."), config: "error" in read ? { version: 1 } : read });
server.connect(new StdioServerTransport()).catch((e: unknown) => {
	process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
});
```

- [ ] **Step 5: Build script.** В `packages/agent-runtime/package.json` в `build` добавь в конец: ` && esbuild src/mcp/mcpMain.ts --bundle --platform=node --target=node18 --external:pg-native --outfile=dist/claude-export/bpmsoft-mcp.js`. Строку `crm.js` пока не удалять (Task 7).

- [ ] **Step 6: Run tests and build, expect PASS**: `npx vitest run test/bpmsoftMcpServer.test.ts && npm run build`. Проверь, что бандл стартует и отвечает на `initialize` (вывод — JSON-строка с `"serverInfo":{"name":"bpmsoft"`):
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | node dist/claude-export/bpmsoft-mcp.js --root .
```

- [ ] **Step 7: Commit**
```bash
git add packages/agent-runtime/src/mcp packages/agent-runtime/src/index.ts packages/agent-runtime/package.json packages/agent-runtime/test/bpmsoftMcpServer.test.ts
git commit -m "agent-runtime: bpmsoft MCP server for Claude Code and Cursor"
```

### Task 4: Регистрация сервера при установке скиллов

**Files:**
- Create: `packages/agent-runtime/src/claudeExport/standIntegration.ts`
- Modify: `packages/agent-runtime/src/claudeExport/install.ts` (удалить `writeCrmEnv`, `SETTINGS_REL`, `CrmEnvConnection`; опции и результат), `packages/agent-runtime/src/claudeExport/sources.ts` (`crmBundle` → `mcpBundle`), `packages/agent-runtime/src/claudeExport/index.ts` (экспорт нового модуля)
- Test: `packages/agent-runtime/test/standIntegration.test.ts`, `packages/agent-runtime/test/claudeExport.test.ts` (кейсы `crmEnv` → `integration`, `crmBundle` → `mcpBundle`)

**Interfaces:**
- Consumes: Task 2 (`STAND_CONFIG_REL`, `StandDbConfig`), Task 3 (`MCP_SERVER_NAME`), `CrmConnection`, `isInsideRoots`.
- Produces:

```ts
export interface StandIntegrationOptions { crm?: CrmConnection; db?: StandDbConfig; mcpBundle: string /* absolute path in the stand */ }
export interface StandIntegrationResult { state: "registered" | "removed"; invalid: string[] /* rel paths left untouched */ }
export function writeStandIntegration(appRoot: string, options: StandIntegrationOptions): StandIntegrationResult;
export const MCP_PERMISSIONS = ["mcp__bpmsoft__crm_db_query", "mcp__bpmsoft__crm_update_from_fs", "mcp__bpmsoft__crm_browser_login"];
// install.ts
export function installClaudeSkills(appRoot, sources, options: { appVersion: string; claudeMd?: ClaudeMdChoice; overwriteModified?: boolean; now?: () => Date; crm?: CrmConnection; db?: StandDbConfig }): InstallOutcome;
// InstallOutcome "installed": { kind: "installed"; written: number; removed: number; target: string; integration: StandIntegrationResult }
// sources.ts
export function collectExportSources(dirs: { knowledgeDir: string; exportDir: string; lintBundle: string; mcpBundle: string }): ExportSources;
export const MCP_BUNDLE_REL = ".claude/skills/bpm-knowledge/scripts/bpmsoft-mcp.js";
```

- [ ] **Step 1: Write the failing tests** (`test/standIntegration.test.ts`, временный корень через `fs.realpathSync(fs.mkdtempSync(...))`, хелперы `put`/`read` как в `claudeExport.test.ts`):

```ts
const crm = { url: "http://crm.test/", user: "u", password: "p" };
const bundle = () => path.join(root, ".claude", "skills", "bpm-knowledge", "scripts", "bpmsoft-mcp.js");

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
	put(".mcp.json", "﻿{\r\n  \"mcpServers\": {}\r\n}\r\n");
	writeStandIntegration(root, { crm, mcpBundle: bundle() });
	const text = read(".mcp.json");
	expect(text.startsWith("﻿")).toBe(true);
	expect(text).toContain("\r\n");
	expect(text.replace(/\r\n/g, "")).not.toContain("\n");
});
```

В `claudeExport.test.ts`: фикстура `crmBundle` → `mcpBundle` (файл `bpmsoft-mcp.js`); три кейса `crmEnv` переписать: установка с `crm` → `integration.state === "registered"` и есть `.mcp.json`; без `crm` и `db` → `"removed"`; битый `settings.local.json` → `integration.invalid` содержит `.claude/settings.local.json`. Добавь кейс: после установки поверх старого манифеста с `.claude/skills/bpm-knowledge/scripts/crm.js` этот файл удалён.

- [ ] **Step 2: Run, expect FAIL**: `npx vitest run test/standIntegration.test.ts test/claudeExport.test.ts`.

- [ ] **Step 3: Implement `standIntegration.ts`.** Внутренние хелперы:
  - `readJson(dest): { value: Record<string, unknown>; bom: boolean; crlf: boolean } | "invalid" | undefined` — нет файла → `undefined`; снять BOM, `JSON.parse`; не объект → `"invalid"`; `crlf = text.includes("\r\n")`;
  - `writeJson(dest, value, like?)` — `JSON.stringify(value, null, 2) + "\n"`, при `like.crlf` заменить `\n` на `\r\n`, при `like.bom` добавить `﻿`; `mkdirSync(dirname, { recursive: true })`;
  - перед каждой записью и удалением — `isInsideRoots(dest, [appRoot])`, иначе throw, как `assertInsideStand` в `install.ts`.

  Алгоритм `writeStandIntegration`: `register = Boolean(options.crm || options.db)`.
  1. Для `.mcp.json` и `.cursor/mcp.json`: `readJson`; `"invalid"` или `mcpServers` не объект → в `invalid`, пропустить. Регистрация: `mcpServers.bpmsoft = { command: "node", args: [options.mcpBundle, "--root", appRoot] }`, записать. Снятие: если файла нет — ничего; иначе удалить ключ `bpmsoft` и записать.
  2. `.claude/settings.local.json`: `readJson`; `"invalid"` или `env`/`permissions` не объект, `permissions.allow`/`enabledMcpjsonServers` не массив → в `invalid`, пропустить. Удалить из `env` три `BPMSOFT_CRM_*`, пустой `env` удалить. Регистрация: добавить `"bpmsoft"` в `enabledMcpjsonServers` и `MCP_PERMISSIONS` в `permissions.allow` без дублей, в конец. Снятие: убрать их оттуда. Если файла не было и снимаем — не создавать.
  3. Файл доступов `STAND_CONFIG_REL`: регистрация — записать `{ version: 1, ...(crm && { crm }), ...(db && { db }) }` (без BOM, LF); снятие — удалить, если есть.
  4. Вернуть `{ state: register ? "registered" : "removed", invalid }`.

- [ ] **Step 4: Wire into `install.ts` and `sources.ts`.** В `sources.ts`: `MCP_BUNDLE_REL`; в `defaultExportSources` вместо `crm.js` проверить `dist/claude-export/bpmsoft-mcp.js` (текст ошибки: `"Не найден bpmsoft-mcp.js: выполните npm run build в packages/agent-runtime"`); в `collectExportSources` вместо `crm.js` — `{ rel: MCP_BUNDLE_REL, source: dirs.mcpBundle }`. В `install.ts`: удалить `SETTINGS_REL`, `CrmEnvConnection`, `writeCrmEnv`; опции `crm?: CrmConnection; db?: StandDbConfig`; в конце вместо `crmEnv`: `const integration = writeStandIntegration(appRoot, { crm: options.crm, db: options.db, mcpBundle: toDisk(appRoot, MCP_BUNDLE_REL) });`, вернуть `integration` в результате.

- [ ] **Step 5: Run, expect PASS**: `npm test -w @bpmsoft-agent/agent-runtime` (весь пакет, `claudeExportTexts.test.ts` может падать только из-за `crm.js` в текстах — это Task 6).

- [ ] **Step 6: Commit**
```bash
git add packages/agent-runtime/src/claudeExport packages/agent-runtime/test/standIntegration.test.ts packages/agent-runtime/test/claudeExport.test.ts
git commit -m "claude-export: register the bpmsoft MCP server in the stand"
```

### Task 5: Desktop — передать доступ к БД и показать результат

**Files:**
- Modify: `apps/desktop/src/main/agentSession.ts`, `apps/desktop/src/main/index.ts:496-502`, `apps/desktop/src/renderer/src/components/SettingsMenu.tsx:~331`, типы окна в preload/renderer, если там описан `InstallOutcome` (найди `crmEnv` по `apps/desktop/src`).

**Interfaces:**
- Consumes: Task 4 (`installClaudeSkills` с `db`, `InstallOutcome.integration`), Task 2 (`StandDbConfig`).
- Produces: `export function dbExportOptions(): StandDbConfig | undefined` в `agentSession.ts`.

- [ ] **Step 1: Implement `dbExportOptions`** рядом с `dbConnectionOptions`:

```ts
/** Database access written into the stand for the MCP server: undefined when database access is off. */
export function dbExportOptions(): StandDbConfig | undefined {
  if (!activeProject || !getAppSettings().dbAccessEnabled) {
    return undefined
  }
  const { dbHost, dbPort, dbUser } = getProjectConnection(activeProject)
  const password = loadSecret(dbPasswordSecret(activeProject))
  return {
    ...(dbHost ? { host: dbHost } : {}),
    ...(dbPort ? { port: Number(dbPort) } : {}),
    ...(dbUser ? { user: dbUser } : {}),
    ...(password ? { password } : {})
  }
}
```
Импорт типа `StandDbConfig` из `@bpmsoft-agent/agent-runtime`.

- [ ] **Step 2: `index.ts`** — в `installClaudeSkills(...)` добавь `db: dbExportOptions()` рядом с `crm: crmConnection()`.

- [ ] **Step 3: `SettingsMenu.tsx`** — заменить ветку `crmEnv` на `integration`:
  - `state === "registered"` → «MCP-сервер bpmsoft подключён: действия на стенде[ и запрос к БД] доступны агенту. В Cursor включите сервер в Settings → MCP, если он выключен.» (часть про БД — если в настройках включён доступ к БД);
  - `state === "removed"` → «Доступ к CRM и БД не настроен: агент будет просить вас выполнять действия на стенде.»;
  - `invalid.length > 0` → «Не удалось изменить (файл не JSON): <список>.»

- [ ] **Step 4: Build and typecheck**: `npm run build -w @bpmsoft-agent/agent-runtime && npm run build -w @bpmsoft-agent/desktop`. Expected: без ошибок TypeScript.

- [ ] **Step 5: Commit**
```bash
git add apps/desktop/src
git commit -m "desktop: install the MCP server with CRM and database access"
```

### Task 6: Тексты экспорта на MCP-инструменты

**Files:**
- Modify: `packages/agent-runtime/claude-export/AGENTS.md`, `claude-export/skills/bpm-browser-check/SKILL.md`, `bpm-crm-query/SKILL.md`, `bpm-develop/SKILL.md`, `bpm-explain/SKILL.md`, `bpm-troubleshoot/SKILL.md`
- Test: `packages/agent-runtime/test/claudeExportTexts.test.ts`

- [ ] **Step 1: Failing test.** В `claudeExportTexts.test.ts` добавь кейс: ни один файл в `claude-export/` (рекурсивно, `.md`) не содержит `crm.js`, `BPMSOFT_CRM_` и `settings.local.json`. Запусти — FAIL на текущих текстах.

- [ ] **Step 2: `AGENTS.md`.**
  - Вступление (строка 4): «…проверяешь их сам инструментами MCP-сервера `bpmsoft` (раздел «Действия на стенде CRM»), если они есть в сессии; иначе это делает пользователь.»
  - Строка 8 (данные в CRM): «…скилл `bpm-crm-query`: `crm_db_query`, если он есть в сессии, иначе `crm_request` (OData, `DataService`). Сам к БД не подключайся (`psql`, драйверы, строки подключения), `ConnectionStrings.config` не читай, ради данных браузером не входи.»
  - Пункт «Запрос к БД CRM ты не выполняешь…» в «Какие инструменты заменены»: «Запрос к БД — `crm_db_query`, только чтение; его нет — дай пользователю SQL готовым текстом. „Обновить из файловой системы“, компиляция, перезапуск, REST — инструменты раздела «Действия на стенде CRM»; их нет — попроси пользователя.»
  - Раздел «Действия на стенде CRM (`crm.js`)» → «Действия на стенде CRM (MCP-сервер `bpmsoft`)». Первый абзац: «Инструменты MCP-сервера `bpmsoft` работают от имени пользователя CRM из настроек приложения bpmsoft-agent; пароль агенту не нужен и не передаётся. В Claude Code они называются `mcp__bpmsoft__<имя>`. Инструментов нет в сессии — доступ не настроен или сервер выключен: не ищи обходов (скрипты, `AuthService`, файлы `.claude/*.local.json`, `ConnectionStrings.config`), попроси пользователя выполнить действие самому.» Пункты: `crm_update_from_fs`, `crm_compile`, `crm_restart`, `crm_request` (параметры `method`, `path`, `body` — JSON-строка, `maxChars`), `crm_browser_login`, `crm_db_query` — с теми же пояснениями, что сейчас у команд `update`, `compile`, `restart`, `request`, `browser-login`. Пункт про таймаут 600000 мс удалить. В «Порядок» и «Проверка после загрузки» заменить `crm.js request` → `crm_request`, `crm.js browser-login` → `crm_browser_login`, `update`/`compile`/`restart` → `crm_update_from_fs`/`crm_compile`/`crm_restart`.
  - «Как читать знания»: пункты `crm_db_query`, `crm_update_from_fs`, `crm_compile`, `crm_request` заменить одним: «`crm_update_from_fs`, `crm_compile`, `crm_restart`, `crm_request`, `crm_db_query` — инструменты MCP-сервера `bpmsoft` с теми же именами (раздел «Действия на стенде CRM»).» В пункте про `crm_browser_*` — «после входа `crm_browser_login`».

- [ ] **Step 3: Скиллы.**
  - `bpm-browser-check`: «Что нужно» — «Есть инструмент `crm_browser_login`. Нет — попроси пользователя войти в CRM в этом браузере самому.» «Вход — только так», шаг 1: «Вызови `crm_browser_login` и прочитай ответ: адрес страницы входа и фрагмент JavaScript. Выдача пароля ждёт 120 с.» Запрет: «…читать `.claude/*.local.json` и `ConnectionStrings.config`». Строка про вторую попытку: «…`crm_browser_login` ответил ошибкой или страница не забрала пароль…».
  - `bpm-crm-query`: «Чем читать» — «`crm_db_query`, если он есть в сессии: SQL только на чтение, таблицы и кавычки — `crm-db.md`. Иначе — `crm_request` (`AGENTS.md`, «Действия на стенде CRM»): видны записи, на которые есть права у пользователя CRM из настроек.» Пункт «К БД не подключайся…» → «Сам к БД не подключайся (`psql`, драйверы, строки подключения), `ConnectionStrings.config` не читай.» Пункт про вход — «вход делает `crm_request`». «Доступ к CRM не настроен» → «Нет ни `crm_db_query`, ни `crm_request`». В «Порядок», шаг 2 — сначала SQL через `crm_db_query`, если есть; иначе OData/DataService через `crm_request`.
  - `bpm-develop` (строки 36, 38), `bpm-explain` (29), `bpm-troubleshoot` (46, 47): `crm.js update` → `crm_update_from_fs`, `crm.js compile` → `crm_compile`, `crm.js request` → `crm_request`; в `bpm-explain` — «прочитай их по скиллу `bpm-crm-query` (`crm_db_query` или `crm_request`)».

- [ ] **Step 4: Run, expect PASS**: `npm test -w @bpmsoft-agent/agent-runtime`. Проверь, что нет имён проекта: `grep -rn "crm\.js" packages/agent-runtime/claude-export` — пусто.

- [ ] **Step 5: Commit**
```bash
git add packages/agent-runtime/claude-export packages/agent-runtime/test/claudeExportTexts.test.ts
git commit -m "claude-export: stand actions and database query through the MCP server"
```

### Task 7: Удалить `crm.js`

**Files:**
- Delete: `packages/agent-runtime/src/crm/crmCli.ts`, `packages/agent-runtime/src/crm/crmMain.ts`, `packages/agent-runtime/test/crmCli.test.ts`
- Modify: `packages/agent-runtime/package.json` (убрать из `build` сегмент `&& esbuild src/crm/crmMain.ts ... --outfile=dist/claude-export/crm.js`), `BACKLOG.md` (упоминания `crm.js` → MCP-сервер `bpmsoft`), `docs/presentation/build.js` (если упоминание `crm.js` описывает текущую работу — заменить на MCP-сервер)

- [ ] **Step 1:** `grep -rn "crmCli\|crmMain\|crm\.js" packages apps BACKLOG.md README.md docs --exclude-dir=node_modules --exclude-dir=dist` — список мест.
- [ ] **Step 2:** Удалить файлы, поправить `build`, обновить упоминания. Исторические записи в `docs/test-runs/` и `docs/superpowers/specs/` не менять.
- [ ] **Step 3:** `rm -rf packages/agent-runtime/dist/claude-export/crm.js && npm run build -w @bpmsoft-agent/agent-runtime && npm test -w @bpmsoft-agent/agent-runtime` — PASS, в `dist/claude-export/` есть `bpmsoft-mcp.js` и `pkg-lint.js`, нет `crm.js`.
- [ ] **Step 4: Commit**
```bash
git add -A packages/agent-runtime BACKLOG.md docs/presentation
git commit -m "agent-runtime: drop crm.js, the MCP server replaces it"
```

### Task 8: Ручная проверка (делает пользователь)

**Files:**
- Create: `docs/test-runs/run-15.md` — сценарий в формате `docs/test-runs/README.md`.

- [ ] **Step 1:** Записать сценарий. Подготовка: тестовый стенд, в desktop заданы CRM и включён доступ к БД, «Установить скиллы». Проверки:
  1. В стенде есть `.mcp.json`, `.cursor/mcp.json`, `.claude/bpmsoft-agent.local.json`; в `settings.local.json` нет `BPMSOFT_CRM_*`; нет `crm.js`.
  2. Claude Code: сервер `bpmsoft` подключён без вопроса о доверии (`/mcp`); `printenv | grep BPMSOFT` в сессии — пусто.
  3. Claude Code: создать тестовую схему в тестовом пакете → `crm_update_from_fs` без вопроса → `crm_compile` с вопросом → `crm_request` к `DataService` → `crm_db_query` («сколько записей в SysSettings») → `crm_browser_login` и вход в браузере.
  4. Cursor: сервер виден в Settings → MCP (нужно ли включать руками — записать); те же шаги; хватает ли тайм-аута на `crm_compile` (записать время компиляции и результат).
  5. Выключить доступ к БД в desktop, переустановить скиллы → `crm_db_query` пропал, агент на вопрос о данных идёт через `crm_request`.
  6. Windows: шаги 1–4 (запуск `node` из `.mcp.json`, пути с обратными слешами).
- [ ] **Step 2:** Если в Cursor не хватает тайм-аута — завести задачу «`crm_compile`: запуск и опрос статуса» в `BACKLOG.md`.
- [ ] **Step 3: Commit**
```bash
git add docs/test-runs/run-15.md
git commit -m "test-runs: MCP export check scenario"
```
