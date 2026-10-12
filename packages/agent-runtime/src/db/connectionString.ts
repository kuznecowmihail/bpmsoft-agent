export interface PgConnectionConfig { host: string; port: number; database: string; user: string; password: string; ssl: boolean }
export interface DbConnectionOverride { host?: string; port?: number; user?: string; password?: string }

const NAMED_ENTITIES: Record<string, string> = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">" };
const SSL_MODES = ["require", "verify-ca", "verify-full"];

function decodeXmlEntities(value: string): string {
	return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|amp|quot|apos|lt|gt);/g, (match: string, entity: string) => {
		if (entity.charAt(0) === "#") {
			const code = entity.charAt(1).toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
			return code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity];
	});
}

function parseAttributes(tag: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const pattern = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
	let match: RegExpExecArray | null = pattern.exec(tag);
	while (match !== null) {
		attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
		match = pattern.exec(tag);
	}
	return attributes;
}

function parseKeyValues(connectionString: string): Map<string, string> {
	const values = new Map<string, string>();
	for (const part of connectionString.split(";")) {
		const eq = part.indexOf("=");
		if (eq < 0) {
			continue;
		}
		const key = part.slice(0, eq).replace(/\s+/g, "").toLowerCase();
		const value = part.slice(eq + 1).trim();
		if (key) {
			values.set(key, value);
		}
	}
	return values;
}

function nonEmpty(value: string | undefined): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function parseConnectionStringsConfig(xml: string): PgConnectionConfig {
	const tags = xml.match(/<add\b[^>]*>/gi) ?? [];
	let dbAttributes: Record<string, string> | undefined;
	for (const tag of tags) {
		const attributes = parseAttributes(tag);
		if (attributes.name === "db") {
			dbAttributes = attributes;
			break;
		}
	}
	if (!dbAttributes) {
		throw new Error("В ConnectionStrings.config нет строки подключения с именем db");
	}

	const values = parseKeyValues(decodeXmlEntities(dbAttributes.connectionstring ?? ""));
	if (values.has("datasource") || values.has("initialcatalog") || values.has("integratedsecurity")) {
		throw new Error("Строка подключения похожа на MS SQL — пока поддерживается только PostgreSQL");
	}

	const host = values.get("server") || values.get("host") || "";
	const database = values.get("database") || "";
	if (!host || !database) {
		throw new Error("В строке подключения db нет сервера или базы данных");
	}

	const portRaw = values.get("port");
	const port = portRaw ? Number(portRaw) : 5432;
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error("В строке подключения db некорректный порт");
	}

	const sslMode = (values.get("sslmode") ?? "").toLowerCase();
	return {
		host,
		port,
		database,
		user: values.get("userid") || values.get("username") || values.get("user") || values.get("uid") || "",
		password: values.get("password") || values.get("pwd") || "",
		ssl: SSL_MODES.indexOf(sslMode) >= 0,
	};
}

export function applyConnectionOverride(config: PgConnectionConfig, override?: DbConnectionOverride): PgConnectionConfig {
	const result: PgConnectionConfig = { ...config };
	if (!override) {
		return result;
	}
	const host = nonEmpty(override.host);
	if (host !== undefined) {
		result.host = host;
	}
	const user = nonEmpty(override.user);
	if (user !== undefined) {
		result.user = user;
	}
	const password = nonEmpty(override.password);
	if (password !== undefined) {
		result.password = password;
	}
	if (typeof override.port === "number" && Number.isFinite(override.port) && override.port > 0) {
		result.port = override.port;
	}
	return result;
}
