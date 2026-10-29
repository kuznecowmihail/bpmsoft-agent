import type { FetchLike } from "../crm/crmSession";
import { AtlassianConnection, AtlassianError, atlassianJson, baseUrl } from "./atlassianHttp";

/** Limit of the page text given to the agent. */
export const CONFLUENCE_PAGE_MAX_CHARS = 40000;

const EXPAND = "expand=body.storage,version,space";

/** Untyped access to a property of a JSON value. */
function field(obj: unknown, key: string): unknown {
	return obj !== null && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Non-empty text of a string or number; otherwise undefined. */
function textOf(value: unknown): string | undefined {
	if (typeof value === "string") {
		return value.trim() === "" ? undefined : value;
	}
	return typeof value === "number" ? String(value) : undefined;
}

/** Decodes a URL segment; the raw text when it is not valid percent-encoding. */
function decodeSegment(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, " "));
	} catch {
		return value;
	}
}

/** Character for a numeric entity; empty text when the code point is out of range. */
function fromCode(code: number): string {
	return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** Decodes the HTML entities used in Confluence storage format; &amp; goes last. */
function decodeEntities(text: string): string {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => fromCode(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_m, dec: string) => fromCode(Number(dec)))
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

/** Page id, or space key and title, from a link or a number; undefined when the input is neither. */
export function parseConfluencePage(input: string): { id?: string; space?: string; title?: string } | undefined {
	const value = input.trim();
	if (/^\d+$/.test(value)) {
		return { id: value };
	}
	const idMatch = /pageId=(\d+)/.exec(value) ?? /\/pages\/(\d+)/.exec(value);
	if (idMatch) {
		return { id: idMatch[1] };
	}
	const display = /\/display\/([^/?#]+)\/([^?#]+)/.exec(value);
	if (display) {
		return { space: decodeSegment(display[1] ?? ""), title: decodeSegment(display[2] ?? "") };
	}
	return undefined;
}

/** True when the URL points to the Confluence of this connection. */
export function isConfluenceLink(conn: AtlassianConnection, url: string): boolean {
	return url.toLowerCase().startsWith(`${baseUrl(conn).toLowerCase()}/`);
}

/** Plain text with Markdown headings, lists and code blocks from Confluence storage format. */
export function storageToText(html: string): string {
	let text = html;
	text = text.replace(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/g, (_m, code: string) => `\n\`\`\`\n${code}\n\`\`\`\n`);
	text = text.replace(/<h([1-6])[^>]*>/gi, (_m, level: string) => `\n${"#".repeat(Number(level))} `).replace(/<\/h[1-6]>/gi, "\n");
	text = text.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|div|tr|ul|ol|table)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
	text = text.replace(/<\/t[dh]>/gi, " | ");
	text = text.replace(/<ac:link[\s\S]*?ri:content-title="([^"]*)"[\s\S]*?<\/ac:link>/gi, "«$1»");
	text = text.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)");
	text = text.replace(/<[^>]+>/g, "");
	text = decodeEntities(text);
	return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Text of a Confluence page by link or id; the title is taken from the link when the id is not given. */
export async function fetchConfluencePage(
	conn: AtlassianConnection,
	input: string,
	fetchImpl?: FetchLike,
	maxChars = CONFLUENCE_PAGE_MAX_CHARS,
): Promise<string> {
	const ref = parseConfluencePage(input);
	if (!ref) {
		throw new AtlassianError(`Confluence: не понял ссылку на страницу: ${input}`);
	}
	let page: unknown;
	if (ref.id) {
		page = await atlassianJson("Confluence", conn, `/rest/api/content/${ref.id}?${EXPAND}`, { fetchImpl });
	} else {
		const space = ref.space ?? "";
		const title = ref.title ?? "";
		const found = await atlassianJson(
			"Confluence",
			conn,
			`/rest/api/content?spaceKey=${encodeURIComponent(space)}&title=${encodeURIComponent(title)}&${EXPAND}`,
			{ fetchImpl },
		);
		page = Array.isArray(field(found, "results")) ? (field(found, "results") as unknown[])[0] : undefined;
		if (!page) {
			throw new AtlassianError(`Confluence: страница «${title}» не найдена в пространстве ${space}`);
		}
	}
	const title = textOf(field(page, "title")) ?? "";
	const space = textOf(field(field(page, "space"), "key")) ?? "";
	const version = textOf(field(field(page, "version"), "number")) ?? "";
	const webui = textOf(field(field(page, "_links"), "webui")) ?? "";
	const body = textOf(field(field(field(page, "body"), "storage"), "value")) ?? "";
	const head = [`# ${title}`, `Пространство: ${space} · версия ${version}`, `Ссылка: ${baseUrl(conn)}${webui}`].join("\n");
	const full = `${head}\n\n${storageToText(body)}`;
	return full.length > maxChars ? `${full.slice(0, maxChars)}\n…(страница обрезана)` : full;
}

/** Checks the login: returns the name of the user the token belongs to. */
export async function testConfluence(conn: AtlassianConnection, fetchImpl?: FetchLike): Promise<string> {
	const me = await atlassianJson("Confluence", conn, "/rest/api/user/current", { fetchImpl });
	return `Вход в Confluence выполнен: ${textOf(field(me, "displayName")) ?? textOf(field(me, "username")) ?? "пользователь"}`;
}
