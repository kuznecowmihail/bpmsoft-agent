import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

const knowledgeDir = path.join(__dirname, "..", "knowledge");
const promptFile = path.join(__dirname, "..", "src", "provider", "systemPrompt.ts");
const maxBytes = 50 * 1024;
const normalizeRef = (value: string) => value.toLowerCase().replace(/[`*]/g, "");

const knowledgeFiles = fs.readdirSync(knowledgeDir).filter((name) => name.endsWith(".md")).sort();

describe("knowledge files", () => {
	it("each file is at most 50 KB", () => {
		const big = knowledgeFiles
			.map((name) => ({ name, size: fs.statSync(path.join(knowledgeDir, name)).size }))
			.filter((item) => item.size > maxBytes)
			.map((item) => `${item.name}: ${item.size}`);
		expect(big).toEqual([]);
	});

	it("each file is listed in the system prompt index", () => {
		const prompt = fs.readFileSync(promptFile, "utf8");
		const missing = knowledgeFiles.filter((name) => !prompt.includes(`- ${name} — `));
		expect(missing).toEqual([]);
	});

	it("each file listed in the index exists", () => {
		const prompt = fs.readFileSync(promptFile, "utf8");
		const listed = [...prompt.matchAll(/^- ([a-z0-9-]+\.md) — /gm)].map((match) => match[1]);
		expect(listed.length).toBeGreaterThan(0);
		expect(listed.filter((name) => !knowledgeFiles.includes(name))).toEqual([]);
	});

	it("knowledge references to other knowledge files point to existing files", () => {
		const known = new Set(knowledgeFiles);
		const broken: string[] = [];
		for (const name of knowledgeFiles) {
			const text = fs.readFileSync(path.join(knowledgeDir, name), "utf8");
			for (const match of text.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*\.md)`/g)) {
				if (!known.has(match[1])) {
					broken.push(`${name}: ${match[1]}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});

	it("section references point to an existing heading or bold label", () => {
		const broken: string[] = [];
		for (const name of knowledgeFiles) {
			const text = fs.readFileSync(path.join(knowledgeDir, name), "utf8");
			for (const match of text.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*\.md)`,?\s*(?:раздел\s*)?«([^»]{3,120})»/g)) {
				const target = match[1];
				const targetPath = path.join(knowledgeDir, target);
				if (!fs.existsSync(targetPath)) {
					continue;
				}
				const section = normalizeRef(match[2]);
				const targetText = normalizeRef(fs.readFileSync(targetPath, "utf8"));
				if (!targetText.includes(section)) {
					broken.push(`${name}: ${target} «${match[2]}»`);
				}
			}
		}
		expect(broken).toEqual([]);
	});
});
