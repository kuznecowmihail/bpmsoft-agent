import { Client, types } from "pg";
import * as fs from "fs";
import { PgConnectionConfig, DbConnectionOverride, parseConnectionStringsConfig, applyConnectionOverride } from "./connectionString";
import { checkReadOnlySql } from "./sqlGuard";

export interface DbQueryRecord { sql: string; rowCount: number; truncated: boolean; durationMs: number; error?: string; denied?: boolean }
export interface DbQueryResult { rows: Record<string, unknown>[]; fields: { name: string; dataTypeID?: number }[] }
export interface DbClient { connect(): Promise<void>; query(sql: string): Promise<DbQueryResult>; end(): Promise<void> }
export interface DbClientConfig { host: string; port: number; database: string; user: string; password: string; ssl: boolean | { rejectUnauthorized: false }; connectionTimeoutMillis: number; statement_timeout: number; query_timeout: number; application_name: string }
export interface CrmDbToolOptions {
	/** Absolute path to ConnectionStrings.config of the opened application; read by the tool itself, never shown to the agent. */
	connectionStringsPath: string;
	override?: DbConnectionOverride;
	maxRows?: number;      // default 200
	timeoutMs?: number;    // default 10000
	/** Asked before each query (after the SQL check); false → the query is not run. */
	confirm?: (sql: string) => Promise<boolean>;
	onQuery?: (record: DbQueryRecord) => void;
	/** Tests only. Default: new pg.Client(config). */
	clientFactory?: (config: DbClientConfig) => DbClient;
}
export interface CrmDbTool { name: "crm_db_query"; description: string; execute(sql: string): Promise<{ text: string; isError: boolean }> }

export const CRM_DB_QUERY_TOOL = "crm_db_query";

const MAX_OUTPUT_CHARS = 30000;
const MAX_VALUE_CHARS = 300;
/** Told to the agent when the database cannot be reached: work as without the tool. */
const DB_UNAVAILABLE_HINT = "Не повторяй запрос: попроси пользователя выполнить этот SQL и прислать результат (или проверить подключение к БД в настройках приложения).";

export function isSensitiveColumn(name: string): boolean {
	return /pass(word)?|pwd|secret|token|hash|salt|api_?key|private_?key|access_?key|certificate/i.test(name);
}

const PACKED_TYPE_OIDS = new Set([114, 199, 3802, 3807, 2249, 2287]);
/** json, jsonb, record and their arrays, table row types and other user types (OID from 16384): may hold a whole row. */
export function isPackedType(oid?: number): boolean {
	return oid !== undefined && (PACKED_TYPE_OIDS.has(oid) || oid >= 16384);
}

function formatValue(column: string, value: unknown, oid?: number): string {
	if (value === null || value === undefined) {
		return "NULL";
	}
	if (isPackedType(oid)) {
		return "<составное значение скрыто — перечисли колонки явно>";
	}
	if (isSensitiveColumn(column)) {
		return "***";
	}
	let text: string;
	if (value instanceof Date) {
		text = isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
	} else if (Buffer.isBuffer(value)) {
		text = `<binary ${value.length} байт>`;
	} else if (typeof value === "object") {
		text = JSON.stringify(value);
	} else {
		text = String(value);
	}
	text = text.replace(/\r?\n/g, " ⏎ ");
	return text.length > MAX_VALUE_CHARS ? text.slice(0, MAX_VALUE_CHARS) + "…" : text;
}

export function formatQueryResult(result: DbQueryResult, maxRows: number): string {
	const shown = result.rows.slice(0, maxRows);
	const truncated = result.rows.length > maxRows;
	const header = truncated
		? `Строк: больше ${maxRows}, показаны первые ${maxRows} — уточни условие или добавь LIMIT`
		: `Строк: ${result.rows.length}`;

	const fields = result.fields;
	if (fields.length === 0) {
		return header;
	}

	const lines = [header, fields.map((field) => field.name).join(" | ")];
	for (const row of shown) {
		lines.push(fields.map((field) => formatValue(field.name, row[field.name], field.dataTypeID)).join(" | "));
	}

	const text = lines.join("\n");
	return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + "\n… [вывод обрезан]" : text;
}

/**
 * Readable reason of a failed connection or query. Node reports a refused connection to several
 * addresses (IPv4 and IPv6) as an AggregateError with an empty message — take the inner errors' text or codes.
 */
export function errorMessage(e: unknown): string {
	if (!(e instanceof Error)) {
		return String(e);
	}
	if (e.message) {
		return e.message;
	}
	const inner = (e as { errors?: unknown[] }).errors;
	if (Array.isArray(inner) && inner.length > 0) {
		const parts = inner.map((item) => errorMessage(item)).filter((text) => text !== "");
		const unique = parts.filter((text, index) => parts.indexOf(text) === index);
		if (unique.length > 0) {
			return unique.join("; ");
		}
	}
	const code = (e as { code?: unknown }).code;
	if (typeof code === "string" && code) {
		return code === "ECONNREFUSED" ? "ECONNREFUSED — сервер БД не принимает подключения (проверьте хост и порт)" : code;
	}
	return `неизвестная ошибка (${e.name})`;
}

function loadConnectionConfig(options: CrmDbToolOptions): PgConnectionConfig {
	let xml: string;
	try {
		xml = fs.readFileSync(options.connectionStringsPath, "utf8");
	} catch {
		throw new Error("Не найден ConnectionStrings.config в папке приложения");
	}
	return applyConnectionOverride(parseConnectionStringsConfig(xml.replace(/^\uFEFF/, "")), options.override);
}

/** date, timestamp, timestamptz come back as the database text — no shift to the machine's time zone. */
const RAW_DATE_TYPE_OIDS = new Set([1082, 1114, 1184]);
function rawDateTypeParser(oid: number, format?: "text" | "binary"): (value: string) => unknown {
	return RAW_DATE_TYPE_OIDS.has(oid) ? (value: string) => value : (types.getTypeParser(oid, format as never) as (value: string) => unknown);
}

function buildClient(options: CrmDbToolOptions, config: PgConnectionConfig, timeoutMs: number): DbClient {
	const clientConfig: DbClientConfig = {
		...config,
		ssl: config.ssl ? { rejectUnauthorized: false } : false,
		connectionTimeoutMillis: 5000,
		statement_timeout: timeoutMs,
		query_timeout: timeoutMs + 2000,
		application_name: "bpmsoft-agent",
	};
	const factory = options.clientFactory ?? ((c: DbClientConfig) => {
		const client = new Client({ ...c, types: { getTypeParser: rawDateTypeParser } });
		// A dropped connection emits "error" on the client; without a listener it would crash the app process.
		client.on("error", () => {});
		return client as unknown as DbClient;
	});
	return factory(clientConfig);
}

export function createCrmDbTool(options: CrmDbToolOptions): CrmDbTool {
	const maxRows = options.maxRows ?? 200;
	const timeoutMs = options.timeoutMs ?? 10000;

	return {
		name: CRM_DB_QUERY_TOOL,
		description: `Выполняет один запрос SELECT или WITH к базе данных CRM (PostgreSQL) только на чтение: транзакция только для чтения, до ${maxRows} строк, тайм-аут ${timeoutMs / 1000} с, колонки с паролями, хешами, токенами и ключами недоступны. Имена таблиц и колонок — в двойных кавычках. Используй, когда данных нет в файлах Pkg: Id записей, рабочих мест, значения системных настроек.`,

		async execute(sql: string): Promise<{ text: string; isError: boolean }> {
			const check = checkReadOnlySql(sql);
			if (!check.allowed) {
				options.onQuery?.({ sql, rowCount: 0, truncated: false, durationMs: 0, error: check.reason });
				return { text: `Запрос отклонён: ${check.reason}`, isError: true };
			}

			if (options.confirm && !(await options.confirm(check.normalized))) {
				options.onQuery?.({ sql: check.normalized, rowCount: 0, truncated: false, durationMs: 0, error: "Пользователь отклонил запрос", denied: true });
				return { text: "Пользователь отклонил выполнение запроса", isError: true };
			}

			let config: PgConnectionConfig;
			try {
				config = loadConnectionConfig(options);
			} catch (e) {
				const message = errorMessage(e);
				options.onQuery?.({ sql: check.normalized, rowCount: 0, truncated: false, durationMs: 0, error: message });
				return { text: `${message.replace(/\.$/, "")}. ${DB_UNAVAILABLE_HINT}`, isError: true };
			}

			const started = Date.now();
			let client: DbClient | undefined;
			let connected = false;
			try {
				client = buildClient(options, config, timeoutMs);
				await client.connect();
				connected = true;
				await client.query("BEGIN TRANSACTION READ ONLY");
				await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
				const result = await client.query(`SELECT * FROM (\n${check.normalized}\n) AS bpmsoft_agent_q LIMIT ${maxRows + 1}`);
				const text = formatQueryResult(result, maxRows);
				options.onQuery?.({
					sql: check.normalized,
					rowCount: Math.min(result.rows.length, maxRows),
					truncated: result.rows.length > maxRows,
					durationMs: Date.now() - started,
				});
				return { text, isError: false };
			} catch (e) {
				const message = errorMessage(e);
				options.onQuery?.({ sql: check.normalized, rowCount: 0, truncated: false, durationMs: Date.now() - started, error: message });
				if (!connected) {
					return { text: `БД CRM недоступна: ${message}. ${DB_UNAVAILABLE_HINT}`, isError: true };
				}
				return { text: `Ошибка запроса: ${message}`, isError: true };
			} finally {
				if (client) {
					if (connected) {
						try { await client.query("ROLLBACK"); } catch { /* connection may not be open */ }
					}
					try { await client.end(); } catch { /* ignore */ }
				}
			}
		},
	};
}

export async function testCrmDbConnection(options: CrmDbToolOptions): Promise<string> {
	const timeoutMs = options.timeoutMs ?? 10000;
	let client: DbClient | undefined;
	try {
		const config = loadConnectionConfig(options);
		client = buildClient(options, config, timeoutMs);
		await client.connect();
		await client.query("BEGIN TRANSACTION READ ONLY");
		const result = await client.query("SELECT current_database() AS db, version() AS version");
		const row = result.rows[0] ?? {};
		const db = String(row.db ?? "");
		const version = String(row.version ?? "").split(" ").slice(0, 2).join(" ");
		return `Подключено: база ${db}, ${version}`;
	} catch (e) {
		throw new Error(`Не удалось подключиться: ${errorMessage(e)}`);
	} finally {
		if (client) {
			try { await client.query("ROLLBACK"); } catch { /* connection may not be open */ }
			try { await client.end(); } catch { /* ignore */ }
		}
	}
}
