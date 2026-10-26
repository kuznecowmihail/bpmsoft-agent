import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { collectExportSources, claudeSkillsStatus, installClaudeSkills } from "../src/claudeExport";
import { textSha256 } from "../src/claudeExport/sources";

describe("claudeExport", () => {
	const MARKER = "<!-- bpmsoft-agent: generated -->";
	const NOW = new Date("2026-10-19T10:00:00.000Z");
	const opts = { appVersion: "0.1.0", now: () => NOW };

	let tmp: string;
	let knowledgeDir: string;
	let exportDir: string;
	let lintBundle: string;
	let crmBundle: string;
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
	const sources = () => collectExportSources({ knowledgeDir, exportDir, lintBundle, crmBundle });

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "claude-export-")));
		knowledgeDir = path.join(tmp, "knowledge");
		exportDir = path.join(tmp, "claude-export");
		lintBundle = path.join(tmp, "pkg-lint.js");
		crmBundle = path.join(tmp, "crm.js");
		appRoot = path.join(tmp, "stand");
		fs.mkdirSync(appRoot, { recursive: true });

		put(path.join(knowledgeDir, "entity.md"), "﻿# Сущность\r\nтекст\r\n");
		put(path.join(knowledgeDir, "scripts", "check-entity.js"), "module.exports = {};\n");
		put(path.join(knowledgeDir, ".DS_Store"), "junk");
		put(lintBundle, "/* bundle */\n");
		put(crmBundle, "/* crm cli */\n");
		put(path.join(exportDir, "AGENTS.md"), `${MARKER}\n# Ядро\n`);
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
		expect(read("AGENTS.md").split("\n")[0]).toBe(MARKER);
		expect(read("AGENTS.md")).toBe(`${MARKER}\n# Ядро\n`);
		expect(read("CLAUDE.md")).toBe(`${MARKER}\n@AGENTS.md\n`);
		const manifest = JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json"));
		expect(manifest.claudeMd).toBe("root");
		expect(manifest.appVersion).toBe("0.1.0");
		expect(manifest.installedAt).toBe(NOW.toISOString());
		expect(Object.keys(manifest.files)).toContain("CLAUDE.md");
		expect(Object.keys(manifest.files)).toContain("AGENTS.md");
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
		expect(read("AGENTS.md")).toBe(`${MARKER}\n# Ядро\n`);

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
		expect(read("CLAUDE.md")).toBe(`${MARKER}\n@AGENTS.md\n`);
		expect(read("AGENTS.md")).toBe(`${MARKER}\n# Ядро\n`);
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

	it("no manifest: existing edited skill file needs confirmation", () => {
		installClaudeSkills(appRoot, sources(), opts);
		fs.rmSync(path.join(appRoot, ".claude", "skills", ".bpmsoft-agent.json"));
		put(path.join(appRoot, ".claude", "skills", "bpm-develop", "SKILL.md"), "my edit\n");

		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome).toEqual({
			kind: "needs-overwrite-confirm",
			modified: [".claude/skills/bpm-develop/SKILL.md"],
		});
		expect(read(".claude", "skills", "bpm-develop", "SKILL.md")).toBe("my edit\n");
	});

	it("no manifest: identical existing files install without confirmation", () => {
		installClaudeSkills(appRoot, sources(), opts);
		fs.rmSync(path.join(appRoot, ".claude", "skills", ".bpmsoft-agent.json"));

		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
	});

	it("file already equal to new source is not reported as modified", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(exportDir, "skills", "bpm-develop", "SKILL.md"), "new text\n");
		put(path.join(appRoot, ".claude", "skills", "bpm-develop", "SKILL.md"), "new text\n");

		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
		expect(read(".claude", "skills", "bpm-develop", "SKILL.md")).toBe("new text\n");
	});

	it("manifest keys outside .claude are ignored and never deleted", () => {
		installClaudeSkills(appRoot, sources(), opts);
		const manifestPath = path.join(appRoot, ".claude", "skills", ".bpmsoft-agent.json");
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		manifest.files["../outside.txt"] = "deadbeef";
		manifest.files[".claude/../../x"] = "deadbeef";
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
		const outside = path.join(tmp, "outside.txt");
		const escaped = path.join(tmp, "x");
		fs.writeFileSync(outside, "keep me\n");
		fs.writeFileSync(escaped, "keep me too\n");

		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
		expect(fs.readFileSync(outside, "utf8")).toBe("keep me\n");
		expect(fs.readFileSync(escaped, "utf8")).toBe("keep me too\n");
	});

	it.skipIf(process.platform === "win32")("symlinked .claude pointing outside the stand is refused and nothing is written", () => {
		const outside = path.join(tmp, "outside");
		fs.mkdirSync(outside, { recursive: true });
		fs.symlinkSync(outside, path.join(appRoot, ".claude"), "dir");

		expect(() => installClaudeSkills(appRoot, sources(), opts)).toThrow("за пределы папки проекта");
		expect(fs.readdirSync(outside)).toEqual([]);
	});

	it("export includes the CRM CLI next to pkg-lint", () => {
		installClaudeSkills(appRoot, sources(), opts);
		expect(read(".claude", "skills", "bpm-knowledge", "scripts", "crm.js")).toBe("/* crm cli */\n");
	});

	it("install with crm writes env and keeps other settings", () => {
		put(
			path.join(appRoot, ".claude", "settings.local.json"),
			JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, env: { OTHER: "1" } }),
		);
		const crm = { url: "http://crm.test/", user: "tester", password: "pw" };
		const outcome = installClaudeSkills(appRoot, sources(), { ...opts, crm });

		expect(outcome).toMatchObject({ kind: "installed", crmEnv: "written" });
		const settings = JSON.parse(read(".claude", "settings.local.json"));
		expect(settings.permissions).toEqual({ allow: ["Bash(ls)"] });
		expect(settings.env).toEqual({
			OTHER: "1",
			BPMSOFT_CRM_URL: "http://crm.test/",
			BPMSOFT_CRM_USER: "tester",
			BPMSOFT_CRM_PASSWORD: "pw",
		});
		expect(read(".claude", "settings.local.json").endsWith("}\n")).toBe(true);
	});

	it("invalid settings JSON stays untouched and is reported", () => {
		put(path.join(appRoot, ".claude", "settings.local.json"), "{ not json");
		const crm = { url: "http://crm.test/", user: "tester", password: "pw" };
		const outcome = installClaudeSkills(appRoot, sources(), { ...opts, crm });

		expect(outcome).toMatchObject({ kind: "installed", crmEnv: "invalid-settings" });
		expect(read(".claude", "settings.local.json")).toBe("{ not json");
	});

	it("without crm the settings file is not created", () => {
		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome).toMatchObject({ kind: "installed", crmEnv: "skipped" });
		expect(exists(".claude", "settings.local.json")).toBe(false);
	});

	it("hash changes when the core changes", () => {
		const a = sources().hash;
		put(path.join(exportDir, "AGENTS.md"), `${MARKER}\n# Другое ядро\n`);
		expect(sources().hash).not.toBe(a);
		expect(sources().hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("foreign AGENTS.md alone asks for a choice and nothing is written", () => {
		put(path.join(appRoot, "AGENTS.md"), "# Мой AGENTS\n");
		expect(installClaudeSkills(appRoot, sources(), opts)).toEqual({ kind: "needs-claude-md-choice" });
		expect(read("AGENTS.md")).toBe("# Мой AGENTS\n");
		expect(exists("CLAUDE.md")).toBe(false);
		expect(exists(".claude")).toBe(false);
	});

	it("separate mode with foreign AGENTS.md appends the read line once and stubs CLAUDE.md", () => {
		put(path.join(appRoot, "AGENTS.md"), "# Мой AGENTS\n");
		const first = installClaudeSkills(appRoot, sources(), { ...opts, claudeMd: "separate" });
		expect(first.kind).toBe("installed");
		const line = "Перед работой прочитай правила BPMSoft-агента: .claude/bpmsoft-agent.md";
		expect(read("AGENTS.md")).toBe(`# Мой AGENTS\n${line}\n`);
		expect(read(".claude", "bpmsoft-agent.md")).toBe(`${MARKER}\n# Ядро\n`);
		expect(read("CLAUDE.md")).toBe(`${MARKER}\n@.claude/bpmsoft-agent.md\n`);

		const second = installClaudeSkills(appRoot, sources(), opts);
		expect(second.kind).toBe("installed");
		expect(read("AGENTS.md").split(/\r?\n/).filter((l) => l.trim() === line).length).toBe(1);
		expect(JSON.parse(read(".claude", "skills", ".bpmsoft-agent.json")).claudeMd).toBe("separate");
	});

	it("old root install migrates to AGENTS.md core and CLAUDE.md stub without confirmation", () => {
		const oldCore = `${MARKER}\n# Ядро\n`;
		put(path.join(appRoot, "CLAUDE.md"), oldCore);
		put(
			path.join(appRoot, ".claude", "skills", ".bpmsoft-agent.json"),
			JSON.stringify({
				appVersion: "0.1.0",
				installedAt: NOW.toISOString(),
				hash: "old",
				claudeMd: "root",
				files: { "CLAUDE.md": textSha256(oldCore) },
			}),
		);

		const outcome = installClaudeSkills(appRoot, sources(), opts);
		expect(outcome.kind).toBe("installed");
		expect(read("CLAUDE.md")).toBe(`${MARKER}\n@AGENTS.md\n`);
		expect(read("AGENTS.md")).toBe(`${MARKER}\n# Ядро\n`);
	});

	it("stale foreign AGENTS.md from an old manifest is never deleted", () => {
		installClaudeSkills(appRoot, sources(), opts);
		put(path.join(appRoot, "AGENTS.md"), "# Мой AGENTS\n");

		const outcome = installClaudeSkills(appRoot, sources(), { ...opts, claudeMd: "separate" });
		expect(outcome.kind).toBe("installed");
		expect(read("AGENTS.md").startsWith("# Мой AGENTS\n")).toBe(true);
		expect(exists("AGENTS.md")).toBe(true);
	});
});
