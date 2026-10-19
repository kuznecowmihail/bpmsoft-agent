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
	"bpm-entity",
	"bpm-client-schemas",
	"bpm-process",
	"bpm-user-task",
	"bpm-source-code",
	"bpm-data",
	"bpm-sql-script",
	"bpm-registration"
];

/** Every markdown text of the export: the core plus all SKILL.md files. */
const allTexts = (): Array<{ rel: string; text: string }> => {
	const result = [{ rel: "CLAUDE.md", text: fs.readFileSync(path.join(exportDir, "CLAUDE.md"), "utf8") }];
	for (const name of skillNames) {
		const rel = path.join("skills", name, "SKILL.md");
		result.push({ rel, text: fs.readFileSync(path.join(exportDir, rel), "utf8") });
	}
	return result;
};

describe("claude-export texts", () => {
	it("has core and all skills", () => {
		expect(fs.existsSync(path.join(exportDir, "CLAUDE.md"))).toBe(true);
		for (const name of skillNames) {
			expect(fs.existsSync(path.join(exportDir, "skills", name, "SKILL.md"))).toBe(true);
		}
	});

	it("core starts with the marker", () => {
		const firstLine = fs.readFileSync(path.join(exportDir, "CLAUDE.md"), "utf8").split(/\r?\n/)[0];
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
		const forbidden = ["crm_db_query", "crm_update_from_fs", "crm_compile", "crm_browser_", "<choices>", "/Users/", "C:\\", "~/"];
		for (const { rel, text } of allTexts()) {
			for (const word of forbidden) {
				expect(text.includes(word), `${rel} contains "${word}"`).toBe(false);
			}
			if (rel !== "CLAUDE.md") {
				expect(text.includes("pkg_lint"), `${rel} contains "pkg_lint"`).toBe(false);
			}
		}
	});

	it("knowledge links point to existing files", () => {
		const pattern = /\.claude\/skills\/bpm-knowledge\/([A-Za-z0-9_./-]+)/g;
		let checked = 0;
		for (const { rel, text } of allTexts()) {
			for (const match of text.matchAll(pattern)) {
				const target = match[1].replace(/\.+$/, "");
				if (target === "" || target.endsWith("/") || target === "scripts/pkg-lint.js") {
					continue;
				}
				checked++;
				const abs = path.join(knowledgeDir, ...target.split("/"));
				expect(fs.existsSync(abs), `${rel} links to missing "${target}"`).toBe(true);
			}
		}
		expect(checked).toBeGreaterThan(0);
	});
});
