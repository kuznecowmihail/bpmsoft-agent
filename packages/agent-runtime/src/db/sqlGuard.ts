export type SqlCheckResult = { allowed: true; normalized: string } | { allowed: false; reason: string };

interface StrippedSql { codeNoIds: string; codeIdsAsText: string }

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|EXEC|PREPARE|DEALLOCATE|LOCK|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|COMMENT|SET|RESET|LISTEN|NOTIFY|UNLISTEN|DISCARD|LOAD|IMPORT|SECURITY|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|INTO|SHARE)\b/i;
const FORBIDDEN_FUNCTIONS = /\b(dblink\w*|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|pg_file_\w+|pg_logdir_ls|lo_\w+|pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_switch_wal|pg_promote|set_config|current_setting|setval|nextval|pg_advisory\w*|pg_try_advisory\w*|\w*_to_xml\w*|xml_to_\w*|query_to_\w+|pg_notify|txid_current|pg_create_\w+|pg_drop_\w+)\s*\(/i;
const FORBIDDEN_TABLES = /\b(pg_authid|pg_shadow|pg_user_mappings?|pg_hba_file_rules|pg_file_settings|pg_settings|pg_stat_activity)\b/i;
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

function isIdentChar(ch: string | undefined): boolean {
	return ch !== undefined && /[A-Za-z0-9_$\u0080-\uFFFF]/.test(ch);
}

function trimTrailing(sql: string): string {
	return sql.replace(/[;\s]+$/, "");
}

/** Returns the index after the closing quote (or end of input) and whether the quote was closed. */
function findQuoteEnd(sql: string, from: number, quote: string, backslashEscapes: boolean): { end: number; closed: boolean } {
	let j = from;
	while (j < sql.length) {
		const ch = sql.charAt(j);
		if (backslashEscapes && ch === "\\") {
			j += 2;
			continue;
		}
		if (ch === quote) {
			if (sql.charAt(j + 1) === quote) {
				j += 2;
				continue;
			}
			return { end: j + 1, closed: true };
		}
		j++;
	}
	return { end: sql.length, closed: false };
}

function stripSql(sql: string): StrippedSql {
	let noIds = "";
	let asText = "";
	let i = 0;
	const n = sql.length;
	while (i < n) {
		const c = sql.charAt(i);
		const next = sql.charAt(i + 1);

		if (c === "-" && next === "-") {
			const newline = sql.indexOf("\n", i);
			i = newline < 0 ? n : newline;
			noIds += " ";
			asText += " ";
			continue;
		}

		if (c === "/" && next === "*") {
			const close = sql.indexOf("*/", i + 2);
			i = close < 0 ? n : close + 2;
			noIds += " ";
			asText += " ";
			continue;
		}

		if ((c === "E" || c === "e") && next === "'" && !isIdentChar(sql.charAt(i - 1))) {
			i = findQuoteEnd(sql, i + 2, "'", true).end;
			noIds += "''";
			asText += "''";
			continue;
		}

		if (c === "'") {
			i = findQuoteEnd(sql, i + 1, "'", false).end;
			noIds += "''";
			asText += "''";
			continue;
		}

		if (c === "\"") {
			const quoted = findQuoteEnd(sql, i + 1, "\"", false);
			const inner = sql.slice(i + 1, quoted.closed ? quoted.end - 1 : quoted.end).replace(/""/g, "\"");
			noIds += "\"x\"";
			asText += inner;
			i = quoted.end;
			continue;
		}

		if (c === "$" && !isIdentChar(sql.charAt(i - 1))) {
			DOLLAR_TAG.lastIndex = i;
			const match = DOLLAR_TAG.exec(sql);
			if (match) {
				const close = match[0];
				const closeAt = sql.indexOf(close, i + close.length);
				i = closeAt < 0 ? n : closeAt + close.length;
				noIds += "''";
				asText += "''";
				continue;
			}
		}

		noIds += c;
		asText += c;
		i++;
	}
	return { codeNoIds: noIds, codeIdsAsText: asText };
}

export function checkReadOnlySql(sql: string): SqlCheckResult {
	const normalized = trimTrailing(sql.trim());
	if (normalized === "") {
		return { allowed: false, reason: "Пустой запрос" };
	}

	const { codeNoIds, codeIdsAsText } = stripSql(normalized);
	const code = trimTrailing(codeNoIds);

	if (code.indexOf(";") >= 0) {
		return { allowed: false, reason: "Разрешён только один запрос" };
	}
	if (!/^[\s(]*(SELECT|WITH)\b/i.test(code)) {
		return { allowed: false, reason: "Разрешены только запросы SELECT и WITH" };
	}

	const keyword = FORBIDDEN_KEYWORDS.exec(code);
	if (keyword) {
		return {
			allowed: false,
			reason: `Запрос содержит запрещённое слово ${keyword[1].toUpperCase()}: изменять данные и настройки БД нельзя. Имена таблиц и колонок пиши в двойных кавычках`,
		};
	}

	const fn = FORBIDDEN_FUNCTIONS.exec(codeIdsAsText);
	if (fn) {
		return { allowed: false, reason: `Функция ${fn[1]} запрещена` };
	}

	const table = FORBIDDEN_TABLES.exec(codeIdsAsText);
	if (table) {
		return { allowed: false, reason: `Таблица ${table[1]} запрещена` };
	}

	return { allowed: true, normalized };
}
