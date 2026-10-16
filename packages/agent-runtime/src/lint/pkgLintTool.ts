import * as fs from "fs";
import * as path from "path";
import type { AppTool } from "../tools/appTool";
import { defaultKnowledgeDir, lintChanged, lintSchemas } from "./pkgLint";

/** Name of the app tool that lints schemas changed in the current chat. */
export const PKG_LINT_TOOL = "pkg_lint";

/** Returns <pkg>/<folder>/<name> directories for every package in Pkg that has such a folder (skips hidden folders). */
function dirsNamed(pkgRoot: string, folder: string, name: string): string[] {
	let packages: string[];
	try {
		packages = fs.readdirSync(pkgRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => entry.name);
	} catch {
		return [];
	}
	return packages
		.map((pkg) => path.join(pkgRoot, pkg, folder, name))
		.filter((dir) => {
			try {
				return fs.statSync(dir).isDirectory();
			} catch {
				return false;
			}
		});
}

/** App tool pkg_lint: checks schemas changed in this chat (or one schema by name) and returns errors and warnings. */
export function createPkgLintTool(options: { pkgRoot: string; since: () => number; knowledgeDir?: string }): AppTool {
	return {
		name: PKG_LINT_TOOL,
		description: "Проверяет схемы и SQL-скрипты пакетов, изменённые в этом чате: JSON читается, ресурсы есть на ru-RU и en-US с одинаковыми ключами, для объектов и процессов — check-entity.js / check-process.js, для SQL-скриптов — descriptor.json и непустой .sql, в C#-файлах схем — баланс скобок. Возвращает строки ОШИБКА (исправь до ответа пользователю) и ВНИМАНИЕ (оцени). Параметр schema — проверить только эту схему или SQL-скрипт.",
		params: {
			schema: { type: "string", description: "Имя схемы (папка Schemas/<Имя>) или SQL-скрипта (папка SqlScripts/<Имя>); без параметра — все изменённые в этом чате", optional: true },
		},
		async execute(args) {
			try {
				const knowledgeDir = options.knowledgeDir ?? defaultKnowledgeDir();
				const schema = args.schema;
				if (typeof schema === "string" && schema.trim() !== "") {
					const name = schema.trim();
					const schemaDirs = dirsNamed(options.pkgRoot, "Schemas", name);
					const sqlScriptDirs = dirsNamed(options.pkgRoot, "SqlScripts", name);
					if (schemaDirs.length === 0 && sqlScriptDirs.length === 0) {
						return { text: `Схема ${name} не найдена в папках Schemas и SqlScripts пакетов`, isError: true };
					}
					const report = lintSchemas(schemaDirs, { knowledgeDir, sqlScriptDirs });
					return { text: report.text, isError: !report.ok };
				}
				const report = lintChanged(options.pkgRoot, options.since(), knowledgeDir);
				return { text: report.text, isError: !report.ok };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { text: `pkg_lint не выполнен: ${message}`, isError: true };
			}
		},
	};
}
