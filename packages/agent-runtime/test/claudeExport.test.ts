import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { collectExportSources, claudeSkillsStatus, installClaudeSkills } from "../src/claudeExport";

describe("claudeExport", () => {
	const MARKER = "<!-- bpmsoft-agent: generated -->";
	const NOW = new Date("2026-10-19T10:00:00.000Z");
	const opts = { appVersion: "0.1.0", now: () => NOW };

	let tmp: string;
	let knowledgeDir: string;
	let exportDir: string;
	let lintBundle: string;
	let appRoot: string;

	/** Writes a file with the given content, creating parent folders. */
	const put = (file: string, content: string | Buffer): void => {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	};

	/** Reads a file under the stand root as text. */
	const read = (...parts: string[]): string => fs.readFileSync(path.join(appRoot, ...parts), "utf8");

	/** Reads a file under the stand root as bytes. */
	const bytes = (...parts: string[]): Buffer => fs.readFileSync(path.join(appRoot, ...parts));

	/** Checks that a file exists under the stand root. */
	const exists = (...parts: string[]): boolean => fs.existsSync(path.join(appRoot, ...parts));

	/** Collects the export sources from the current fixture folders. */
	const sources = () => collectExportSources({ knowledgeDir, exportDir, lintBundle });

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "claude-export-")));
		knowledgeDir = path.join(tmp, "knowledge");
		exportDir = path.join(tmp, "claude-export");
		lintBundle = path.join(tmp, "pkg-lint.js");
		appRoot = path.join(tmp, "stand");
		fs.mkdirSync(appRoot, { recursive: true });

		put(path.join(knowledgeDir, "entity.md"), "﻿# Сущность\r\nтекст\r\n");
		put(path.join(knowledgeDir, "scripts", "check-entity.js"), "module.exports = {};\n");
		put(path.join(knowledgeDir, ".DS_Store"), "junk");
		put(lintBundle, "/* bundle */\n");
		put(path.join(exportDir, "CLAUDE.md"), `${MARKER}\n# Ядро\n`);
		put(path.join(exportDir, "skills", "bpm-develop", "SKILL.md"), "---\nname: bpm-develop\n---\n");
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("fresh install writes skills, knowledge, lint and root CLAUDE.md", () => {
		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
		expect(exists(".claude", "skills", "bpm-develop", "SKILL.md")).toBe(true);
		expect(exists(".claude", "skills", "bpm-knowledge", "entity.md")).toBe(true);
		expect(exists(".claude", "skills", "bpm-knowledge", "scripts", "check-entity.js")).toBe(true);
		expect(exists(".claude", "skills", "bpm-knowledge", "scripts", "pkg-lint.js")).toBe(true);
		expect(exists(".claude", "skills", "bpm-knowledge", ".DS_Store")).toBe(false);
		expect(read("CLAUDE.md").split("\n")[0]).toBe(MARKER);
		const manifest = JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json"));
		expect(manifest.claudeMd).toBe("root");
		expect(manifest.appVersion).toBe("0.1.0");
		expect(manifest.installedAt).toBe(NOW.toISOString());
		expect(Object.keys(manifest.files)).toContain("CLAUDE.md");
	});

	it("status: not-installed, then installed, then outdated after a source change", () => {
		expect(claudeSkillsStatus(appRoot, sources())).toEqual({ state: "not-installed" });
		installClaudeSkills(appRoot, sources(), opts);
		expect(claudeSkillsStatus(appRoot, sources())).toEqual({
			state: "installed",
			installedAt: NOW.toISOString(),
			appVersion: "0.1.0",
		});
		put(path.join(exportDir, "skills", "bpm-develop", "SKILL.md"), "changed\n");
		expect(claudeSkillsStatus(appRoot, sources()).state).toBe("outdated");
	});

	it("corrupt manifest is treated as absent", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(appRoot, ".claude", "skills", ".bpmsoft-agent.json"), "{ not json");
		expect(claudeSkillsStatus(appRoot, sources())).toEqual({ state: "not-installed" });
		expect(installClaudeSkills(appRoot, sources(), opts).kind).toBe("installed");
	});

	it("knowledge bytes are identical after install", () => {
		installClaudeSkills(appRoot, sources(), opts);
		const src = fs.readFileSync(path.join(knowledgeDir, "entity.md"));
		expect(Buffer.compare(bytes(".claude", "skills", "bpm-knowledge", "entity.md"), src)).toBe(0);
	});

	it("reinstall without changes needs no confirmation", () => {
		installClaudeSkills(appRoot, sources(), opts);
		const before = read(".claude", "skills", "bpm-develop", "SKILL.md");
		const later = { appVersion: "0.1.0", now: () => new Date("2026-10-20T10:00:00.000Z") };
		const outcome = installClaudeSkills(appRoot, sources(), later);
		expect(outcome.kind).toBe("installed");
		expect(read(".claude", "skills", "bpm-develop", "SKILL.md")).toBe(before);
		const manifest = JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json"));
		expect(manifest.installedAt).toBe("2026-10-20T10:00:00.000Z");
	});

	it("user-modified installed file requires confirmation, then is overwritten", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(appRoot, ".claude", "skills", "bpm-develop", "SKILL.md"), "my edit\n");
		const first = installClaudeSkills(appRoot, sources(), opts);
		expect(first).toEqual({
			kind: "needs-overwrite-confirm",
			modified: [".claude/skills/bpm-develop/SKILL.md"],
		});
		expect(read(".claude", "skills", "bpm-develop", "SKILL.md")).toBe("my edit\n");
		const second = installClaudeSkills(appRoot, sources(), { ...opts, overwriteModified: true });
		expect(second.kind).toBe("installed");
		expect(read(".claude", "skills", "bpm-develop", "SKILL.md")).toBe(
			fs.readFileSync(path.join(exportDir, "skills", "bpm-develop", "SKILL.md"), "utf8"),
		);
	});

	it("deleted installed file is restored without confirmation", () => {
		installClaudeSkills(appRoot, sources(), opts);
		fs.rmSync(path.join(appRoot, ".claude", "skills", "bpm-develop", "SKILL.md"));
		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
		expect(exists(".claude", "skills", "bpm-develop", "SKILL.md")).toBe(true);
	});

	it("file removed from sources is deleted, foreign files stay", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(appRoot, ".claude", "skills", "bpm-knowledge", "my-notes.md"), "мои заметки\n");
		put(path.join(appRoot, ".claude", "skills", "bpm-develop", "mine.md"), "мой файл\n");

		fs.rmSync(path.join(knowledgeDir, "scripts", "check-entity.js"));
		fs.rmSync(path.join(exportDir, "skills", "bpm-develop", "SKILL.md"));
		const outcome = installClaudeSkills(appRoot, sources(), opts);

		expect(outcome.kind).toBe("installed");
		expect(exists(".claude", "skills", "bpm-knowledge", "scripts", "check-entity.js")).toBe(false);
		expect(exists(".claude", "skills", "bpm-develop", "SKILL.md")).toBe(false);
		expect(exists(".claude", "skills", "bpm-knowledge", "my-notes.md")).toBe(true);
		expect(exists(".claude", "skills", "bpm-develop", "mine.md")).toBe(true);
	});

	it("foreign CLAUDE.md asks for a choice and nothing is written", () => {
		put(path.join(appRoot, "CLAUDE.md"), "# Мой проект\n");
		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome).toEqual({ kind: "needs-claude-md-choice" });
		expect(read("CLAUDE.md")).toBe("# Мой проект\n");
		expect(exists(".claude")).toBe(false);
	});

	it("separate mode writes core aside and adds import once", () => {
		put(path.join(appRoot, "CLAUDE.md"), "# Мой проект\r\nтекст");
		const first = installClaudeSkills(appRoot, sources(), { ...opts, claudeMd: "separate" });
		expect(first.kind).toBe("installed");
		expect(read(".claude", "bpmsoft-agent.md").split("\n")[0]).toBe(MARKER);
		expect(read("CLAUDE.md")).toBe("# Мой проект\r\nтекст\r\n@.claude/bpmsoft-agent.md\r\n");

		const second = installClaudeSkills(appRoot, sources(), opts);
		expect(second.kind).toBe("installed");
		const imports = read("CLAUDE.md").split(/\r?\n/).filter((l) => l.trim() === "@.claude/bpmsoft-agent.md");
		expect(imports.length).toBe(1);
		expect(JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json")).claudeMd).toBe("separate");
	});

	it("replace mode overwrites foreign CLAUDE.md with the marked core", () => {
		put(path.join(appRoot, "CLAUDE.md"), "# Мой проект\n");
		const outcome = installClaudeSkills(appRoot, sources(), { ...opts, claudeMd: "replace" });
		expect(outcome.kind).toBe("installed");
		expect(read("CLAUDE.md")).toBe(`${MARKER}\n# Ядро\n`);
		expect(JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json")).claudeMd).toBe("root");
	});

	it("root CLAUDE.md that lost the marker asks only for the CLAUDE.md choice", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(appRoot, "CLAUDE.md"), "# my own\n");

		expect(installClaudeSkills(appRoot, sources(), opts)).toEqual({ kind: "needs-claude-md-choice" });

		const outcome = installClaudeSkills(appRoot, sources(), { ...opts, claudeMd: "separate" });
		expect(outcome.kind).toBe("installed");
		expect(read("CLAUDE.md").startsWith("# my own")).toBe(true);
		const imports = read("CLAUDE.md").split(/\r?\n/).filter((l) => l.trim() === "@.claude/bpmsoft-agent.md");
		expect(imports.length).toBe(1);
		expect(exists(".claude", "bpmsoft-agent.md")).toBe(true);
		const manifest = JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json"));
		expect(manifest.claudeMd).toBe("separate");
		expect(exists("CLAUDE.md")).toBe(true);
	});

	it("settings.local.json is untouched", () => {
		put(path.join(appRoot, ".claude", "settings.local.json"), '{"permissions":{}}');
		installClaudeSkills(appRoot, sources(), opts);
		expect(read(".claude", "settings.local.json")).toBe('{"permissions":{}}');
	});

	it("hash changes when the core changes", () => {
		const a = sources().hash;
		put(path.join(exportDir, "CLAUDE.md"), `${MARKER}\n# Другое ядро\n`);
		expect(sources().hash).not.toBe(a);
		expect(sources().hash).toMatch(/^[0-9a-f]{64}$/);
	});
});
