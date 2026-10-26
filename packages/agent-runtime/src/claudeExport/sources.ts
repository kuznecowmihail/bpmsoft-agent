import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/** One exported file: rel is relative to the stand root with "/" separators, source is an absolute path. */
export interface ExportFile {
	rel: string;
	source: string;
}

/** Files to install, the path to the core AGENTS.md template, and the hash of the whole export. */
export interface ExportSources {
	files: ExportFile[];
	core: string;
	hash: string;
}

/** Folder of the knowledge copy inside the stand root. */
const KNOWLEDGE_REL = ".claude/skills/bpm-knowledge";

/** Returns the sha256 hex of a file's bytes. */
export function fileSha256(file: string): string {
	return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Returns the sha256 hex of a text's UTF-8 bytes. */
export function textSha256(text: string): string {
	return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Lists all files under a folder recursively as absolute paths, skipping .DS_Store. */
function listFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === ".DS_Store") {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...listFiles(full));
		} else if (entry.isFile()) {
			out.push(full);
		}
	}
	return out;
}

/** Maps every file under a folder to a rel path with the given prefix. */
function mapTree(dir: string, relPrefix: string): ExportFile[] {
	return listFiles(dir).map((file) => ({
		rel: `${relPrefix}/${path.relative(dir, file).split(path.sep).join("/")}`,
		source: file,
	}));
}

/** Returns the default sources: folders of the compiled package, next to dist. */
export function defaultExportSources(): ExportSources {
	const lintBundle = path.join(__dirname, "..", "claude-export", "pkg-lint.js");
	if (!fs.existsSync(lintBundle)) {
		throw new Error("Не найден pkg-lint.js: выполните npm run build в packages/agent-runtime");
	}
	const crmBundle = path.join(__dirname, "..", "claude-export", "crm.js");
	if (!fs.existsSync(crmBundle)) {
		throw new Error("Не найден crm.js: выполните npm run build в packages/agent-runtime");
	}
	return collectExportSources({
		knowledgeDir: path.join(__dirname, "..", "..", "knowledge"),
		exportDir: path.join(__dirname, "..", "..", "claude-export"),
		lintBundle,
		crmBundle,
	});
}

/** Collects the export files from the knowledge, skill-text, lint and CRM CLI folders, and computes the export hash. */
export function collectExportSources(dirs: { knowledgeDir: string; exportDir: string; lintBundle: string; crmBundle: string }): ExportSources {
	const skillsDir = path.join(dirs.exportDir, "skills");
	const skillFiles = fs
		.readdirSync(skillsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => mapTree(path.join(skillsDir, entry.name), `.claude/skills/${entry.name}`));
	const files = [
		...skillFiles,
		...mapTree(dirs.knowledgeDir, KNOWLEDGE_REL),
		{ rel: `${KNOWLEDGE_REL}/scripts/pkg-lint.js`, source: dirs.lintBundle },
		{ rel: `${KNOWLEDGE_REL}/scripts/crm.js`, source: dirs.crmBundle },
	].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

	const core = path.join(dirs.exportDir, "AGENTS.md");
	const lines = [...files, { rel: "AGENTS.md", source: core }]
		.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
		.map((file) => `${file.rel}\t${fileSha256(file.source)}\n`);
	const hash = crypto.createHash("sha256").update(lines.join("")).digest("hex");
	return { files, core, hash };
}
