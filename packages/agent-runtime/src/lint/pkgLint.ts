import * as fs from "fs";
import * as path from "path";
import { listChangedFiles, schemaDirsOf, sqlScriptDirsOf } from "./changedFiles";

export interface LintIssue {
	schema: string;
	level: "error" | "warning";
	message: string;
}

export interface LintReport {
	checked: number;
	issues: LintIssue[];
	ok: boolean;
	text: string;
}

/** Result shape of the knowledge check scripts (check-entity.js, check-process.js). */
interface CheckResult {
	errors: string[];
	warnings: string[];
}

/** Returns the knowledge folder next to the compiled or source lint module. */
export function defaultKnowledgeDir(): string {
	return path.join(__dirname, "..", "..", "knowledge");
}

/** Reads a file as text without BOM, or returns undefined when it is not JSON-like or cannot be read. */
function readJsonText(file: string): string | undefined {
	try {
		const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trimStart();
		return text.startsWith("{") || text.startsWith("[") ? text : undefined;
	} catch {
		return undefined;
	}
}

/** Returns the parsed JSON object of a file, or undefined when it cannot be parsed. */
function readJsonObject(file: string): any {
	const text = readJsonText(file);
	if (text === undefined) {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** Returns the message of an unknown thrown value. */
function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** Returns the schema label for a file: the schema folder that contains it, or its parent folder name. */
function labelFor(file: string, schemaDirs: string[]): string {
	const owner = schemaDirs.find((dir) => file.startsWith(dir + path.sep));
	return owner ? path.basename(owner) : path.basename(path.dirname(file));
}

/** Check A: JSON files must parse. */
function checkJson(schemaDirs: string[], extraFiles: string[], issues: LintIssue[]): void {
	const files = new Set<string>();
	for (const file of extraFiles) {
		if (file.endsWith(".json")) {
			files.add(path.resolve(file));
		}
	}
	for (const dir of schemaDirs) {
		for (const name of ["descriptor.json", "metadata.json"]) {
			const file = path.join(dir, name);
			if (fs.existsSync(file)) {
				files.add(path.resolve(file));
			}
		}
	}
	for (const file of files) {
		let text: string | undefined;
		try {
			text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trimStart();
		} catch {
			continue;
		}
		if (!text.startsWith("{") && !text.startsWith("[")) {
			continue;
		}
		try {
			JSON.parse(text);
		} catch (e) {
			issues.push({
				schema: labelFor(file, schemaDirs),
				level: "error",
				message: `${path.basename(file)}: JSON не разбирается: ${errorMessage(e)}`,
			});
		}
	}
}

/** Returns resource file text without BOM and XML comments. */
function readResourceText(file: string): string {
	return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "");
}

/** Returns true when an <Items> or <Item> element lies outside every <Group> element of the resource text. */
function hasItemsOutsideGroup(text: string): boolean {
	const outside = text.replace(/<Group\b[^>]*\/>/g, "").replace(/<Group\b[^>]*>[\s\S]*?<\/Group\s*>/g, "");
	return /<Items?\b/.test(outside);
}

/** Returns the set of Item Name values in a resource text. */
function resourceKeys(text: string): Set<string> {
	const keys = new Set<string>();
	for (const match of text.matchAll(/<Item\s+Name="([^"]+)"/g)) {
		keys.add(match[1]);
	}
	return keys;
}

/** Check B: each schema must have both ru-RU and en-US resource files, with items inside <Group> and matching keys. */
function checkResources(schemaDirs: string[], issues: LintIssue[]): void {
	for (const schemaDir of schemaDirs) {
		const schema = path.basename(schemaDir);
		const pkgDir = path.dirname(path.dirname(schemaDir));
		const resourcesDir = path.join(pkgDir, "Resources");
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(resourcesDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith(`${schema}.`)) {
				continue;
			}
			const folderPath = path.join(resourcesDir, entry.name);
			const ru = path.join(folderPath, "resource.ru-RU.xml");
			const en = path.join(folderPath, "resource.en-US.xml");
			const hasRu = fs.existsSync(ru);
			const hasEn = fs.existsSync(en);
			const texts = new Map<string, string>();
			for (const [culture, file, exists] of [
				["ru-RU", ru, hasRu],
				["en-US", en, hasEn],
			] as const) {
				if (!exists) {
					continue;
				}
				const text = readResourceText(file);
				texts.set(culture, text);
				if (hasItemsOutsideGroup(text)) {
					issues.push({
						schema,
						level: "error",
						message: `Resources/${entry.name}/resource.${culture}.xml: <Items> вне <Group Type="String"> — CRM не сохранит ресурсы`,
					});
				}
			}
			if (hasRu !== hasEn) {
				const missing = hasRu ? "en-US" : "ru-RU";
				issues.push({
					schema,
					level: "error",
					message: `Resources/${entry.name}: нет resource.${missing}.xml`,
				});
				continue;
			}
			if (!hasRu) {
				continue;
			}
			const ruKeys = resourceKeys(texts.get("ru-RU") ?? "");
			const enKeys = resourceKeys(texts.get("en-US") ?? "");
			const onlyRu = [...ruKeys].filter((k) => !enKeys.has(k));
			const onlyEn = [...enKeys].filter((k) => !ruKeys.has(k));
			if (onlyRu.length > 0 || onlyEn.length > 0) {
				issues.push({
					schema,
					level: "warning",
					message: `Resources/${entry.name}: ключи ru-RU и en-US различаются: только в ru-RU — ${onlyRu.join(", ") || "нет"}; только в en-US — ${onlyEn.join(", ") || "нет"}`,
				});
			}
		}
	}
}

/** Check C: run the knowledge script matching the schema manager. */
function checkScripts(schemaDirs: string[], knowledgeDir: string, issues: LintIssue[]): void {
	for (const schemaDir of schemaDirs) {
		const schema = path.basename(schemaDir);
		const descriptor = readJsonObject(path.join(schemaDir, "descriptor.json"));
		const manager: unknown = descriptor?.Descriptor?.ManagerName;
		let scriptFile: string;
		let fnName: "validateEntity" | "validateProcess";
		if (manager === "EntitySchemaManager") {
			scriptFile = "check-entity.js";
			fnName = "validateEntity";
		} else if (manager === "ProcessSchemaManager") {
			scriptFile = "check-process.js";
			fnName = "validateProcess";
		} else {
			continue;
		}
		try {
			const mod = require(path.join(knowledgeDir, "scripts", scriptFile)) as Record<string, (dir: string) => CheckResult>;
			const { errors, warnings } = mod[fnName](schemaDir);
			for (const message of errors) {
				issues.push({ schema, level: "error", message });
			}
			for (const message of warnings) {
				issues.push({ schema, level: "warning", message });
			}
		} catch (e) {
			issues.push({
				schema,
				level: "error",
				message: `проверка ${scriptFile} упала: ${errorMessage(e)}`,
			});
		}
	}
}

/** Check D: SQL script folders need a descriptor.json with a SqlScript root named like the folder, and a non-empty <Name>.sql. */
export function lintSqlScripts(dirs: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const dir of dirs) {
		const name = path.basename(dir);
		const push = (message: string): void => {
			issues.push({ schema: name, level: "error", message });
		};
		const descriptorFile = path.join(dir, "descriptor.json");
		if (!fs.existsSync(descriptorFile)) {
			push("descriptor.json: файл не найден");
		} else {
			const descriptor = readJsonObject(descriptorFile);
			if (descriptor !== undefined) {
				const root: any = descriptor?.SqlScript;
				if (!root || typeof root !== "object") {
					push("descriptor.json: нет корня SqlScript");
				} else if (root.Name !== name) {
					push(`descriptor.json: Name «${root.Name}» не совпадает с папкой`);
				}
			}
		}
		let sql: string | undefined;
		try {
			sql = fs.readFileSync(path.join(dir, `${name}.sql`), "utf8");
		} catch {
			sql = undefined;
		}
		if (sql === undefined || sql.trim() === "") {
			push(`${name}.sql: файл не найден или пустой`);
		}
	}
	return issues;
}

/** Returns all files under a folder, recursively, as absolute paths. */
function walkFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkFiles(full));
		} else if (entry.isFile()) {
			files.push(full);
		}
	}
	return files;
}

/** Data sets: descriptor.json must exist, and every *.json file in the set must parse as JSON. */
export function lintDataDirs(dirs: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const dir of dirs) {
		const name = path.basename(dir);
		const push = (message: string): void => {
			issues.push({ schema: name, level: "error", message });
		};
		if (!fs.existsSync(path.join(dir, "descriptor.json"))) {
			push("нет descriptor.json");
		}
		let files: string[];
		try {
			files = walkFiles(dir).filter((file) => file.endsWith(".json"));
		} catch (e) {
			push(`папка не читается: ${errorMessage(e)}`);
			continue;
		}
		for (const file of files) {
			const rel = path.relative(dir, file).split(path.sep).join("/");
			let text: string;
			try {
				text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
			} catch (e) {
				push(`${rel}: JSON не разбирается: ${errorMessage(e)}`);
				continue;
			}
			if (text.trim() === "") {
				// BPMSoft writes filter.json empty for data sets without a filter.
				if (rel !== "filter.json") {
					push(`${rel}: JSON не разбирается: файл пустой`);
				}
				continue;
			}
			try {
				JSON.parse(text);
			} catch (e) {
				push(`${rel}: JSON не разбирается: ${errorMessage(e)}`);
			}
		}
	}
	return issues;
}

/** Error name used internally by checkCsBrackets to stop at the first mismatch. */
const CS_BRACKET_ERROR = "CsBracketError";

/**
 * Returns a short message for the first unbalanced bracket in C# source, or undefined when brackets are balanced.
 * Returns undefined for text with #else/#elif branches: different branches may legitimately have different brackets, and only one compiles.
 */
export function checkCsBrackets(text: string): string | undefined {
	if (/^[ \t]*#[ \t]*(else|elif)\b/m.test(text)) {
		return undefined;
	}
	const n = text.length;
	const stack: { ch: string; line: number }[] = [];
	let pos = 0;
	let line = 1;

	/** Moves the cursor forward by k characters, counting line breaks. */
	const adv = (k: number): void => {
		for (let j = 0; j < k && pos < n; j++) {
			if (text[pos] === "\n") {
				line++;
			}
			pos++;
		}
	};

	/** Throws the mismatch message; caught at the top level. */
	const fail = (message: string): never => {
		const err = new Error(message);
		err.name = CS_BRACKET_ERROR;
		throw err;
	};

	/** Handles a closing bracket against the top of the stack. */
	const closeBracket = (c: string): void => {
		const open = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[c];
		const top = stack[stack.length - 1];
		if (!top) {
			fail(`лишняя «${c}» в строке ${line}`);
		} else if (top.ch !== open) {
			fail(`не закрыта «${top.ch}» из строки ${top.line}`);
		}
		stack.pop();
	};

	/** Skips a char literal such as 'a', '\'' or '{'. */
	const scanChar = (): void => {
		adv(1);
		while (pos < n && text[pos] !== "'" && text[pos] !== "\n") {
			adv(text[pos] === "\\" ? 2 : 1);
		}
		if (pos < n && text[pos] === "'") {
			adv(1);
		}
	};

	/** Skips a string body after its opening quote; interpolated holes are scanned as code. */
	const scanString = (verbatim: boolean, interp: boolean): void => {
		while (pos < n) {
			const c = text[pos];
			if (c === '"') {
				if (verbatim && text[pos + 1] === '"') {
					adv(2);
					continue;
				}
				adv(1);
				return;
			}
			if (!verbatim && c === "\n") {
				return;
			}
			if (!verbatim && c === "\\") {
				adv(2);
				continue;
			}
			if (interp && c === "{") {
				if (text[pos + 1] === "{") {
					adv(2);
					continue;
				}
				const base = stack.length;
				stack.push({ ch: "{", line });
				adv(1);
				scanCode(base + 1);
				continue;
			}
			if (interp && c === "}" && text[pos + 1] === "}") {
				adv(2);
				continue;
			}
			adv(1);
		}
	};

	/** Scans code; when target is set, returns after the hole brace that brings the stack back to target. */
	const scanCode = (target: number | undefined): void => {
		while (pos < n) {
			const c = text[pos];
			const next = text[pos + 1];
			if (c === "/" && next === "/") {
				while (pos < n && text[pos] !== "\n") {
					adv(1);
				}
				continue;
			}
			if (c === "/" && next === "*") {
				const end = text.indexOf("*/", pos + 2);
				adv(end < 0 ? n - pos : end + 2 - pos);
				continue;
			}
			if (c === "@" && next === '"') {
				adv(2);
				scanString(true, false);
				continue;
			}
			if ((c === "@" && next === "$" && text[pos + 2] === '"') || (c === "$" && next === "@" && text[pos + 2] === '"')) {
				adv(3);
				scanString(true, true);
				continue;
			}
			if (c === "$" && next === '"') {
				adv(2);
				scanString(false, true);
				continue;
			}
			if (c === '"') {
				adv(1);
				scanString(false, false);
				continue;
			}
			if (c === "'") {
				scanChar();
				continue;
			}
			if (c === "(" || c === "[" || c === "{") {
				stack.push({ ch: c, line });
				adv(1);
				continue;
			}
			if (c === ")" || c === "]" || c === "}") {
				if (c === "}" && target !== undefined && stack.length === target) {
					stack.pop();
					adv(1);
					return;
				}
				closeBracket(c);
				adv(1);
				continue;
			}
			adv(1);
		}
	};

	try {
		scanCode(undefined);
	} catch (e) {
		if (e instanceof Error && e.name === CS_BRACKET_ERROR) {
			return e.message;
		}
		throw e;
	}
	const unclosed = stack[stack.length - 1];
	return unclosed ? `не закрыта «${unclosed.ch}» из строки ${unclosed.line}` : undefined;
}

/** Check E: warns about unbalanced brackets in *.cs files directly inside schema folders. */
function checkCsFiles(schemaDirs: string[], issues: LintIssue[]): void {
	for (const schemaDir of schemaDirs) {
		const schema = path.basename(schemaDir);
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(schemaDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".cs")) {
				continue;
			}
			let text: string;
			try {
				text = fs.readFileSync(path.join(schemaDir, entry.name), "utf8");
			} catch {
				continue;
			}
			const msg = checkCsBrackets(text);
			if (msg !== undefined) {
				issues.push({
					schema,
					level: "warning",
					message: `${entry.name}: несбалансированные скобки — ${msg}; компиляция, скорее всего, упадёт`,
				});
			}
		}
	}
}

/** Renders the report as plain text for the chat. */
function renderText(title: string, checked: number, issues: LintIssue[]): string {
	if (checked === 0 && issues.length === 0) {
		return `${title}: в этом чате схемы не изменялись.`;
	}
	const lines: string[] = [`${title}: проверено схем: ${checked}`];
	const groups = new Map<string, LintIssue[]>();
	for (const issue of issues) {
		const group = groups.get(issue.schema) ?? [];
		group.push(issue);
		groups.set(issue.schema, group);
	}
	for (const [label, group] of groups) {
		lines.push(`== ${label}`);
		const ordered = [...group.filter((i) => i.level === "error"), ...group.filter((i) => i.level === "warning")];
		for (const issue of ordered) {
			lines.push(`${issue.level === "error" ? "ОШИБКА" : "ВНИМАНИЕ"} ${issue.message}`);
		}
	}
	const errorCount = issues.filter((i) => i.level === "error").length;
	const warningCount = issues.length - errorCount;
	lines.push(`Итого: ${errorCount} ошибок, ${warningCount} предупреждений`);
	return lines.join("\n");
}

/** Lints the given schema folders and extra changed files, returning issues and a text report. */
export function lintSchemas(
	schemaDirs: string[],
	options: { knowledgeDir?: string; extraFiles?: string[]; sqlScriptDirs?: string[]; dataDirs?: string[]; title?: string } = {},
): LintReport {
	const knowledgeDir = options.knowledgeDir ?? defaultKnowledgeDir();
	const extraFiles = options.extraFiles ?? [];
	const sqlScriptDirs = options.sqlScriptDirs ?? [];
	const dataDirs = options.dataDirs ?? [];
	const title = options.title ?? "pkg_lint";
	const issues: LintIssue[] = [];
	checkJson(schemaDirs, extraFiles, issues);
	checkResources(schemaDirs, issues);
	checkScripts(schemaDirs, knowledgeDir, issues);
	checkCsFiles(schemaDirs, issues);
	issues.push(...lintSqlScripts(sqlScriptDirs));
	issues.push(...lintDataDirs(dataDirs));
	// The script warning about missing resources repeats our resource error for the same schema: keep only the error.
	const missingResourceSchemas = new Set(
		issues.filter((i) => i.level === "error" && i.message.includes("нет resource.")).map((i) => i.schema),
	);
	const shown = issues.filter(
		(i) => !(i.level === "warning" && i.message.includes("отсутствует файл ресурсов") && missingResourceSchemas.has(i.schema)),
	);
	const errorCount = shown.filter((i) => i.level === "error").length;
	const checked = schemaDirs.length + sqlScriptDirs.length + dataDirs.length;
	return {
		checked,
		issues: shown,
		ok: errorCount === 0,
		text: renderText(title, checked, shown),
	};
}

/** Lints schemas and SQL scripts changed in Pkg since sinceMs. */
export function lintChanged(pkgRoot: string, sinceMs: number, knowledgeDir: string = defaultKnowledgeDir()): LintReport {
	const files = listChangedFiles(pkgRoot, sinceMs);
	return lintSchemas(schemaDirsOf(pkgRoot, files), {
		knowledgeDir,
		extraFiles: files,
		sqlScriptDirs: sqlScriptDirsOf(pkgRoot, files),
	});
}
