import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, afterAll } from "vitest";
import { parseConnectionStringsConfig, applyConnectionOverride, PgConnectionConfig } from "../src/db/connectionString";
import { checkReadOnlySql } from "../src/db/sqlGuard";
import { createCrmDbTool, errorMessage, formatQueryResult, isSensitiveColumn, DbClient, DbClientConfig, DbQueryRecord, DbQueryResult } from "../src/db/crmDbTool";

const tmpDirs: string[] = [];

function writeConfig(content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crmdb-"));
	tmpDirs.push(dir);
	const file = path.join(dir, "ConnectionStrings.config");
	fs.writeFileSync(file, content, "utf8");
	return file;
}

afterAll(() => {
	for (const dir of tmpDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function errorOf(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	return "";
}

describe("parseConnectionStringsConfig", () => {
	const typical = `<?xml version="1.0" encoding="utf-8"?>
<connectionStrings>
  <add name="redis" connectionString="host=r;db=1;port=6379" />
  <add name="db" connectionString="Server=pg-host;Port=5433;Database=crm;User ID=crm_user;password=p&amp;ss;Timeout=500; CommandTimeout=400;MaxPoolSize=1024;" />
</connectionStrings>`;

	it("parses the typical file", () => {
		expect(parseConnectionStringsConfig(typical)).toEqual({
			host: "pg-host",
			port: 5433,
			database: "crm",
			user: "crm_user",
			password: "p&ss",
			ssl: false,
		});
	});

	it("handles reversed attribute order, single quotes, newlines and sslmode", () => {
		const xml = `<connectionStrings>
  <ADD
     connectionString='Host=h;Database=d;Username=u;Pwd=x;SslMode=Require'
     name='db'
  />
</connectionStrings>`;
		expect(parseConnectionStringsConfig(xml)).toEqual({
			host: "h",
			port: 5432,
			database: "d",
			user: "u",
			password: "x",
			ssl: true,
		});
	});

	it("decodes named and numeric XML entities", () => {
		const xml = `<add name="db" connectionString="Host=h;Database=d;Password=a&quot;b&#x41;&#66;&lt;&apos;" />`;
		expect(parseConnectionStringsConfig(xml).password).toBe("a\"bAB<'");
	});

	it("throws when there is no db entry", () => {
		const xml = `<connectionStrings><add name="redis" connectionString="host=r" /></connectionStrings>`;
		expect(() => parseConnectionStringsConfig(xml)).toThrow("В ConnectionStrings.config нет строки подключения с именем db");
	});

	it("throws for MS SQL connection strings without leaking the password", () => {
		const xml = `<add name="db" connectionString="Data Source=sql;Initial Catalog=crm;User ID=u;Password=secret1" />`;
		const message = errorOf(() => parseConnectionStringsConfig(xml));
		expect(message).toContain("PostgreSQL");
		expect(message).not.toContain("secret1");
	});

	it("throws when host or database is missing", () => {
		const xml = `<add name="db" connectionString="Host=h;Password=secret2" />`;
		const message = errorOf(() => parseConnectionStringsConfig(xml));
		expect(message).toBe("В строке подключения db нет сервера или базы данных");
		expect(message).not.toContain("secret2");
	});
});

describe("applyConnectionOverride", () => {
	const base: PgConnectionConfig = { host: "old-host", port: 5432, database: "crm", user: "old_user", password: "old", ssl: false };

	it("replaces host, port, user and password", () => {
		const result = applyConnectionOverride(base, { host: " new-host ", port: 6000, user: "new_user", password: "new" });
		expect(result).toEqual({ host: "new-host", port: 6000, database: "crm", user: "new_user", password: "new", ssl: false });
	});

	it("ignores empty strings and invalid ports", () => {
		const result = applyConnectionOverride(base, { host: "  ", user: "", password: "", port: 0 });
		expect(result).toEqual(base);
	});

	it("returns a copy and does not mutate the input", () => {
		const result = applyConnectionOverride(base, { host: "other" });
		expect(result).not.toBe(base);
		expect(base.host).toBe("old-host");
	});
});

describe("checkReadOnlySql allowed", () => {
	it.each([
		`SELECT "Id", "Name" FROM "SysWorkplace"`,
		`select 1;`,
		`WITH a AS (SELECT 1) SELECT * FROM a`,
		`SELECT 'delete from x' AS t`,
		`SELECT 1 -- drop table x`,
		`SELECT "UpdatedOn", "Comment" FROM "Activity"`,
		`(SELECT 1)`,
		`SELECT $$;insert$$`,
		`SELECT "Id"::text, "Name" FROM "SysAdminUnit"`,
		`SELECT NULL::text AS a`,
		`SELECT CAST("Id" AS text) FROM "Contact"`,
		`SELECT CAST(NULL AS text)`,
		`SELECT "Id" FROM "SysSettings" WHERE "Code" = 'PasswordMinLength'`,
		`SELECT now()::text`,
		`SELECT "Id" FROM "Contact" WHERE "Name" LIKE '%token%'`,
	])("allows %s", (sql) => {
		const result = checkReadOnlySql(sql);
		expect(result.allowed).toBe(true);
	});

	it("returns normalized SQL without trailing semicolons", () => {
		const result = checkReadOnlySql("  select 1 ;  ");
		expect(result).toEqual({ allowed: true, normalized: "select 1" });
	});
});

describe("checkReadOnlySql blocked", () => {
	it.each([
		`INSERT INTO "A" VALUES (1)`,
		`UPDATE "A" SET "B" = 1`,
		`DELETE FROM "A"`,
		`SELECT 1; DELETE FROM "A"`,
		`WITH d AS (DELETE FROM "A" RETURNING *) SELECT * FROM d`,
		`SELECT * INTO "B" FROM "A"`,
		`SELECT * FROM "A" FOR UPDATE`,
		`SELECT * FROM "A" FOR SHARE`,
		`SELECT pg_read_file('/etc/passwd')`,
		`SELECT "pg_read_file"('/etc/passwd')`,
		`SELECT * FROM dblink('h', 'select 1') AS t(x int)`,
		`SELECT set_config('a','b',false)`,
		`SELECT query_to_xml('delete from a', true, true, '')`,
		`SELECT pg_sleep(100)`,
		`SELECT * FROM pg_shadow`,
		`COPY "A" TO PROGRAM 'x'`,
		`DROP TABLE "A"`,
		``,
		`SHOW ALL`,
		`EXPLAIN ANALYZE DELETE FROM "A"`,
		`SELECT lo_import('/etc/passwd')`,
		`SELECT 'a\'; DELETE FROM "A"'`,
		`SELECT "UserPassword" AS x FROM "SysAdminUnit"`,
		`SELECT "Name" FROM "SysAdminUnit" WHERE "PasswordHash" IS NOT NULL`,
		`SELECT row_to_json(u) FROM "SysAdminUnit" u`,
		`SELECT to_jsonb(u) FROM "SysAdminUnit" u`,
		`SELECT u::text FROM "SysAdminUnit" u`,
		`SELECT (u)::text FROM "SysAdminUnit" u`,
		`SELECT CAST(u AS text) FROM "SysAdminUnit" u`,
	])("blocks %s", (sql) => {
		const result = checkReadOnlySql(sql);
		expect(result.allowed).toBe(false);
	});

	it("gives a Russian reason for a forbidden keyword in a SELECT", () => {
		const result = checkReadOnlySql(`DELETE FROM "A"`);
		expect(result).toEqual({
			allowed: false,
			reason: "Разрешены только запросы SELECT и WITH",
		});
		const keyword = checkReadOnlySql(`SELECT * FROM "A" FOR UPDATE`);
		expect(keyword.allowed).toBe(false);
		if (!keyword.allowed) {
			expect(keyword.reason).toContain("UPDATE");
		}
	});
});

describe("formatQueryResult", () => {
	it("masks sensitive columns", () => {
		expect(isSensitiveColumn("UserPassword")).toBe(true);
		expect(isSensitiveColumn("PasswordHash")).toBe(true);
		expect(isSensitiveColumn("Name")).toBe(false);
		const text = formatQueryResult(
			{
				fields: [{ name: "Id" }, { name: "UserPassword" }, { name: "PasswordHash" }, { name: "Name" }],
				rows: [{ Id: 1, UserPassword: "x", PasswordHash: "y", Name: "n" }],
			},
			200,
		);
		expect(text).toBe("Строк: 1\nId | UserPassword | PasswordHash | Name\n1 | *** | *** | n");
	});

	it("hides whole-row values by their field type and keeps plain columns", () => {
		const text = formatQueryResult(
			{
				fields: [
					{ name: "u", dataTypeID: 16500 },
					{ name: "j", dataTypeID: 3802 },
					{ name: "Id", dataTypeID: 2950 },
				],
				rows: [{ u: { Id: 1, Name: "n" }, j: { a: 1 }, Id: "00000000-0000-0000-0000-000000000001" }],
			},
			200,
		);
		expect(text).toBe(
			"Строк: 1\nu | j | Id\n<составное значение скрыто — перечисли колонки явно> | <составное значение скрыто — перечисли колонки явно> | 00000000-0000-0000-0000-000000000001",
		);
	});

	it("renders NULL and special values", () => {
		const text = formatQueryResult(
			{
				fields: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }],
				rows: [{ a: null, b: undefined, c: new Date("2026-01-02T03:04:05.000Z"), d: Buffer.from([1, 2, 3]) }],
			},
			200,
		);
		expect(text).toBe("Строк: 1\na | b | c | d\nNULL | NULL | 2026-01-02T03:04:05.000Z | <binary 3 байт>");
	});

	it("replaces newlines and truncates long values", () => {
		const long = "x".repeat(400);
		const text = formatQueryResult(
			{ fields: [{ name: "Comment" }], rows: [{ Comment: "a\r\nb\nc" }, { Comment: long }] },
			200,
		);
		const lines = text.split("\n");
		expect(lines[2]).toBe("a ⏎ b ⏎ c");
		expect(lines[3]).toBe("x".repeat(300) + "…");
	});

	it("shows the truncation line when rows exceed maxRows", () => {
		const text = formatQueryResult(
			{ fields: [{ name: "Id" }], rows: [{ Id: 1 }, { Id: 2 }, { Id: 3 }] },
			2,
		);
		const lines = text.split("\n");
		expect(lines[0]).toBe("Строк: больше 2, показаны первые 2 — уточни условие или добавь LIMIT");
		expect(lines).toHaveLength(4);
		expect(lines[3]).toBe("2");
	});

	it("returns only the count line when there are no fields", () => {
		expect(formatQueryResult({ fields: [], rows: [] }, 200)).toBe("Строк: 0");
	});
});

interface FakeState {
	queries: string[];
	ended: boolean;
	configs: DbClientConfig[];
}

function fakeFactory(state: FakeState, behavior: { rows: Record<string, unknown>[]; fields: string[]; failOn?: string }) {
	return (config: DbClientConfig): DbClient => {
		state.configs.push(config);
		return {
			connect: async () => {},
			query: async (sql: string): Promise<DbQueryResult> => {
				state.queries.push(sql);
				if (behavior.failOn && sql.includes(behavior.failOn)) {
					throw new Error("boom");
				}
				return { rows: behavior.rows, fields: behavior.fields.map((name) => ({ name })) };
			},
			end: async () => {
				state.ended = true;
			},
		};
	};
}

function newState(): FakeState {
	return { queries: [], ended: false, configs: [] };
}

const validConfig = `<connectionStrings><add name="db" connectionString="Server=pg-host;Database=crm;User ID=crm_user;Password=s3cretPass" /></connectionStrings>`;

describe("createCrmDbTool", () => {
	it("runs the wrapped query in a read-only transaction and reports the record", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [{ Id: 1 }, { Id: 2 }], fields: ["Id"] }),
		});

		const result = await tool.execute(`SELECT "Id" FROM "SysWorkplace";`);

		expect(result.isError).toBe(false);
		expect(result.text).toContain("Строк: 2");
		expect(state.queries).toHaveLength(4);
		expect(state.queries[0]).toBe("BEGIN TRANSACTION READ ONLY");
		expect(state.queries[1]).toBe("SET LOCAL statement_timeout = 10000");
		expect(state.queries[2]).toContain("LIMIT 201");
		expect(state.queries[2]).toContain(`SELECT "Id" FROM "SysWorkplace"`);
		expect(state.queries[3]).toBe("ROLLBACK");
		expect(state.ended).toBe(true);
		expect(records).toHaveLength(1);
		expect(records[0].rowCount).toBe(2);
		expect(records[0].truncated).toBe(false);
		expect(records[0].error).toBeUndefined();
	});

	it("does not call the factory when the guard rejects the SQL", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [], fields: [] }),
		});

		const result = await tool.execute(`DELETE FROM "A"`);

		expect(result.isError).toBe(true);
		expect(state.configs).toHaveLength(0);
		expect(state.queries).toHaveLength(0);
		expect(records[0].error).toBeDefined();
	});

	it("does not run the query when the user declines", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			confirm: async () => false,
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [], fields: [] }),
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text).toBe("Пользователь отклонил выполнение запроса");
		expect(state.configs).toHaveLength(0);
		expect(records[0].denied).toBe(true);
	});

	it("reports query errors, still rolls back and ends the client", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [], fields: [], failOn: "SELECT * FROM (" }),
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text).toContain("boom");
		expect(state.queries[state.queries.length - 1]).toBe("ROLLBACK");
		expect(state.ended).toBe(true);
		expect(records[0].error).toBe("boom");
	});

	it("reports a missing ConnectionStrings.config without calling the factory", async () => {
		const state = newState();
		const missing = path.join(os.tmpdir(), "crmdb-no-such-dir-for-test", "ConnectionStrings.config");
		const tool = createCrmDbTool({
			connectionStringsPath: missing,
			clientFactory: fakeFactory(state, { rows: [], fields: [] }),
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text).toContain("Не найден ConnectionStrings.config");
		expect(result.text).toContain("Не повторяй запрос");
		expect(state.configs).toHaveLength(0);
	});

	it("reports an unreachable database without ROLLBACK, ends the client and asks to fall back", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const unreachable = (config: DbClientConfig): DbClient => {
			state.configs.push(config);
			return {
				connect: async () => {
					throw new Error("getaddrinfo ENOTFOUND postgres");
				},
				query: async (sql: string): Promise<DbQueryResult> => {
					state.queries.push(sql);
					return { rows: [], fields: [] };
				},
				end: async () => {
					state.ended = true;
				},
			};
		};
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: unreachable,
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("БД CRM недоступна: getaddrinfo ENOTFOUND postgres")).toBe(true);
		expect(result.text).toContain("Не повторяй запрос");
		expect(state.queries).not.toContain("ROLLBACK");
		expect(state.ended).toBe(true);
		expect(records).toHaveLength(1);
		expect(records[0].error).toBe("getaddrinfo ENOTFOUND postgres");
	});

	it("reports a failed main query as a query error after a successful connect", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [], fields: [], failOn: "SELECT * FROM (" }),
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("Ошибка запроса:")).toBe(true);
		expect(result.text).not.toContain("БД CRM недоступна");
		expect(state.queries).toContain("ROLLBACK");
		expect(state.ended).toBe(true);
	});

	it("passes the password to the client but never returns it", async () => {
		const state = newState();
		const records: DbQueryRecord[] = [];
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			onQuery: (record) => records.push(record),
			clientFactory: fakeFactory(state, { rows: [{ Id: 1 }], fields: ["Id"] }),
		});

		const result = await tool.execute(`SELECT 1`);

		expect(state.configs[0].password).toBe("s3cretPass");
		expect(state.configs[0].host).toBe("pg-host");
		expect(JSON.stringify(result)).not.toContain("s3cretPass");
		expect(JSON.stringify(records)).not.toContain("s3cretPass");
	});
});

const AggregateErrorCtor = (globalThis as unknown as { AggregateError: new (errors: unknown[], message: string) => Error }).AggregateError;

describe("errorMessage", () => {
	it("returns the message of a plain error", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
	});

	it("joins the inner errors of an AggregateError with an empty message", () => {
		const error = new AggregateErrorCtor(
			[
				Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" }),
				Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
			],
			"",
		);
		expect(errorMessage(error)).toBe("connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432");
	});

	it("explains an error with an empty message and a connection code", () => {
		expect(errorMessage(Object.assign(new Error(""), { code: "ECONNREFUSED" })).startsWith("ECONNREFUSED")).toBe(true);
	});

	it("falls back to the error name when there is no message and no code", () => {
		expect(errorMessage(new Error(""))).toBe("неизвестная ошибка (Error)");
	});

	it("returns the text of a non-Error value", () => {
		expect(errorMessage("plain text")).toBe("plain text");
	});
});

describe("createCrmDbTool with an aggregate connection error", () => {
	it("reports the inner connection errors as the unavailable reason", async () => {
		const state = newState();
		const aggregate = new AggregateErrorCtor(
			[
				Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" }),
				Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
			],
			"",
		);
		const refused = (config: DbClientConfig): DbClient => {
			state.configs.push(config);
			return {
				connect: async () => {
					throw aggregate;
				},
				query: async (sql: string): Promise<DbQueryResult> => {
					state.queries.push(sql);
					return { rows: [], fields: [] };
				},
				end: async () => {
					state.ended = true;
				},
			};
		};
		const tool = createCrmDbTool({
			connectionStringsPath: writeConfig(validConfig),
			clientFactory: refused,
		});

		const result = await tool.execute(`SELECT 1`);

		expect(result.isError).toBe(true);
		expect(result.text.startsWith("БД CRM недоступна: connect ECONNREFUSED")).toBe(true);
	});
});
