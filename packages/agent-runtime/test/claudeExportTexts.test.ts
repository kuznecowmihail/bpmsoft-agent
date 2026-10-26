import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

const exportDir = path.join(__dirname, "..", "claude-export");
const knowledgeDir = path.join(__dirname, "..", "knowledge");
const marker = "<!-- bpmsoft-agent: generated -->";

const skillNames = [
	"bpm-develop",
	"bpm-explain",
	"bpm-troubleshoot",
	"bpm-crm-query",
	"bpm-browser-check",
	"bpm-entity",
	"bpm-client-schemas",
	"bpm-process",
	"bpm-user-task",
	"bpm-source-code",
	"bpm-data",
	"bpm-sql-script",
	"bpm-registration",
	"bpm-web-service"
];

const appSectionHeading = "## Как читать знания: имена из приложения";

/** App tool names and placeholders used by knowledge; allowed only in the core section above. */
const appNames = [
	"crm_browser_open",
	"crm_browser_text",
	"crm_browser_console",
	"crm_browser_network",
	"crm_browser_screenshot",
	"crm_browser_click",
	"crm_db_query",
	"crm_update_from_fs",
	"crm_compile",
	"crm_request",
	"pkg_lint",
	"<каталог знаний>",
	"[app]",
	"<Pkg>",
	"<choices>"
];

/** Splits the core into the app-names section and the rest (heading to next "## " line). */
const splitAppSection = (text: string): { section: string; rest: string } => {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === appSectionHeading);
	if (start === -1) {
		throw new Error(`AGENTS.md has no section "${appSectionHeading}"`);
	}
	let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
	if (end === -1) {
		end = lines.length;
	}
	return {
		section: lines.slice(start, end).join("\n"),
		rest: [...lines.slice(0, start), ...lines.slice(end)].join("\n")
	};
};

/** All text files under a directory, recursively. */
const readAllFiles = (dir: string): string[] => {
	const texts: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			texts.push(...readAllFiles(abs));
		} else {
			texts.push(fs.readFileSync(abs, "utf8"));
		}
	}
	return texts;
};

/** Every markdown text of the export: the core plus all SKILL.md files. */
const allTexts = (): Array<{ rel: string; text: string }> => {
	const result = [{ rel: "AGENTS.md", text: fs.readFileSync(path.join(exportDir, "AGENTS.md"), "utf8") }];
	for (const name of skillNames) {
		const rel = path.join("skills", name, "SKILL.md");
		result.push({ rel, text: fs.readFileSync(path.join(exportDir, rel), "utf8") });
	}
	return result;
};

describe("claude-export texts", () => {
	it("has core and all skills", () => {
		expect(fs.existsSync(path.join(exportDir, "AGENTS.md"))).toBe(true);
		for (const name of skillNames) {
			expect(fs.existsSync(path.join(exportDir, "skills", name, "SKILL.md"))).toBe(true);
		}
	});

	it("core starts with the marker", () => {
		const firstLine = fs.readFileSync(path.join(exportDir, "AGENTS.md"), "utf8").split(/\r?\n/)[0];
		expect(firstLine).toBe(marker);
	});

	it("each SKILL.md has name matching its folder and a description", () => {
		for (const name of skillNames) {
			const text = fs.readFileSync(path.join(exportDir, "skills", name, "SKILL.md"), "utf8");
			const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
			expect(match, `${name}: no frontmatter`).not.toBeNull();
			const front = match![1];
			expect(front).toMatch(new RegExp(`^name: ${name}\\s*$`, "m"));
			const description = /^description: (.+)$/m.exec(front);
			expect(description, `${name}: no description`).not.toBeNull();
			expect(description![1].trim().length).toBeGreaterThan(0);
		}
	});

	it("no app-only tools and no absolute paths", () => {
		const appOnly = ["crm_db_query", "crm_update_from_fs", "crm_compile", "crm_browser_", "<choices>"];
		const absolute = ["/Users/", "C:\\", "~/"];
		for (const { rel, text } of allTexts()) {
			// In the core, app tool names are allowed only inside the app-names section.
			const scoped = rel === "AGENTS.md" ? splitAppSection(text).rest : text;
			for (const word of appOnly) {
				expect(scoped.includes(word), `${rel} contains "${word}" outside the app-names section`).toBe(false);
			}
			for (const word of absolute) {
				expect(text.includes(word), `${rel} contains "${word}"`).toBe(false);
			}
			if (rel !== "AGENTS.md") {
				expect(text.includes("pkg_lint"), `${rel} contains "pkg_lint"`).toBe(false);
			}
		}
	});

	it("core explains every app tool name used in knowledge", () => {
		const { section } = splitAppSection(fs.readFileSync(path.join(exportDir, "AGENTS.md"), "utf8"));
		const knowledgeTexts = readAllFiles(knowledgeDir);
		for (const name of appNames) {
			if (knowledgeTexts.some((text) => text.includes(name))) {
				expect(section.includes(name), `app-names section does not explain "${name}"`).toBe(true);
			}
		}
	});

	it("knowledge links point to existing files", () => {
		const pattern = /\.claude\/skills\/bpm-knowledge\/([A-Za-z0-9_./-]+)/g;
		let checked = 0;
		for (const { rel, text } of allTexts()) {
			for (const match of text.matchAll(pattern)) {
				const target = match[1].replace(/\.+$/, "");
				if (
					target === "" ||
					target.endsWith("/") ||
					target === "scripts/pkg-lint.js" ||
					target === "scripts/crm.js"
				) {
					continue;
				}
				checked++;
				const abs = path.join(knowledgeDir, ...target.split("/"));
				expect(fs.existsSync(abs), `${rel} links to missing "${target}"`).toBe(true);
			}
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("every knowledge file is mentioned in the export texts", () => {
		const exportText = allTexts().map((item) => item.text).join("\n");
		const missing = fs
			.readdirSync(knowledgeDir)
			.filter((name) => name.endsWith(".md"))
			.filter((name) => !exportText.includes(name));
		expect(missing, `knowledge files not mentioned in claude-export (AGENTS.md or skills): ${missing.join(", ")}`).toEqual([]);
	});
});
