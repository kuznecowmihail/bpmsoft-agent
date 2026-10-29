import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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
	const server = new McpServer({ name: MCP_SERVER_NAME, version: "1" }, { capabilities: { tools: {} } });
	const { config, dbClientFactory, ...deps } = options;
	const crm = config.crm;
	if (crm) {
		server.registerTool("crm_update_from_fs", {
			description: "«Обновить из файловой системы» в CRM. Сначала pkg-lint по изменённым схемам (git status, а вне git — по времени изменения файлов); при ошибках в CRM ничего не отправляется.",
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
	if (!crm && !config.db) {
		// McpServer registers tools/list only with the first tool; answer an empty list explicitly.
		server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
	}
	return server;
}
