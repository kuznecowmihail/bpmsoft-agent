import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { lintSchemas, lintChanged, lintSqlScripts, checkCsBrackets } from "../src/lint/pkgLint";
import { createPkgLintTool } from "../src/lint/pkgLintTool";

describe("pkgLint", () => {
	let tmp: string;
	let pkg: string;
	const knowledgeDir = path.join(__dirname, "..", "knowledge");

	/** Writes a file under the test Pkg, creating parent folders. */
	const write = (rel: string, content: string): string => {
		const file = path.join(pkg, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	};

	/** Wraps resource items in the BPMSoft resource file layout with a String group. */
	const resourceXml = (culture: string, items: string): string =>
		`<?xml version="1.0" encoding="utf-8"?>\r\n<Resources Culture="${culture}">\r\n\t<Group Type="String">\r\n\t\t<Items>\r\n${items}\t\t</Items>\r\n\t</Group>\r\n</Resources>\r\n`;

	const entityDescriptor = {
		Descriptor: {
			UId: "11111111-1111-1111-1111-111111111111",
			Name: "TestE",
			ManagerName: "EntitySchemaManager",
			ModifiedOnUtc: "2026-01-01",
		},
	};

	const entityMetadata = {
		MetaData: {
			Schema: {
				ManagerName: "EntitySchemaManager",
				UId: "11111111-1111-1111-1111-111111111111",
				A2: "TestE",
			},
		},
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-lint-")));
		pkg = path.join(tmp, "P1");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	const writeTestA = (metadata: string): string => {
		const descriptor = {
			Descriptor: { Name: "TestA", ManagerName: "ClientUnitSchemaManager" },
		};
		const bomCrlf = "﻿" + JSON.stringify(descriptor, null, 2).replace(/\n/g, "\r\n");
		write("Schemas/TestA/descriptor.json", bomCrlf);
		write("Schemas/TestA/metadata.json", metadata);
		return path.join(pkg, "Schemas", "TestA");
	};

	it("accepts a valid schema with BOM and CRLF descriptor", () => {
		const schemaA = writeTestA(
			JSON.stringify({ MetaData: { Schema: { ManagerName: "ClientUnitSchemaManager", A2: "TestA" } } }),
		);
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(true);
		expect(report.issues).toEqual([]);
		expect(report.checked).toBe(1);
	});

	it("reports JSON that does not parse", () => {
		const schemaA = writeTestA('{"a": 1,}');
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(false);
		expect(report.text).toContain("JSON не разбирается");
	});

	it("skips diff-format metadata without a JSON error", () => {
		const schemaA = writeTestA('= MetaData.Schema.A2 "TestA"');
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.issues.some((i) => i.message.includes("JSON"))).toBe(false);
		expect(report.ok).toBe(true);
	});

	it("reports a missing en-US resource file", () => {
		const schemaA = writeTestA(JSON.stringify({ MetaData: {} }));
		write("Resources/TestA.Entity/resource.ru-RU.xml", resourceXml("ru-RU", '\t\t\t<Item Name="Caption" Value="a" />\r\n'));
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.message.includes("нет resource.en-US.xml"))).toBe(true);
	});

	it("does not repeat the script resource warning when the missing en-US file is already reported", () => {
		write("Schemas/TestE/descriptor.json", JSON.stringify(entityDescriptor, null, 2));
		write("Schemas/TestE/metadata.json", JSON.stringify(entityMetadata, null, 2));
		write("Resources/TestE.Entity/resource.ru-RU.xml", resourceXml("ru-RU", '\t\t\t<Item Name="Caption" Value="a" />\r\n'));
		const schemaE = path.join(pkg, "Schemas", "TestE");
		const report = lintSchemas([schemaE], { knowledgeDir });
		expect(report.issues.some((i) => i.level === "error" && i.message.includes("нет resource.en-US.xml"))).toBe(true);
		expect(report.issues.some((i) => i.message.includes("отсутствует файл ресурсов"))).toBe(false);
	});

	it("warns when ru-RU and en-US resource keys differ", () => {
		const schemaA = writeTestA(JSON.stringify({ MetaData: {} }));
		write(
			"Resources/TestA.Entity/resource.ru-RU.xml",
			resourceXml(
				"ru-RU",
				'\t\t\t<Item Name="Caption" Value="a" />\r\n\t\t\t<Item Name="Description" Value="b" />\r\n',
			),
		);
		write("Resources/TestA.Entity/resource.en-US.xml", resourceXml("en-US", '\t\t\t<Item Name="Caption" Value="a" />\r\n'));
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(true);
		expect(report.issues.some((i) => i.level === "warning" && i.message.includes("только в ru-RU — Description"))).toBe(
			true,
		);
	});

	it("reports resource items outside a Group", () => {
		const schemaA = writeTestA(JSON.stringify({ MetaData: {} }));
		write("Resources/TestA.Entity/resource.ru-RU.xml", resourceXml("ru-RU", '\t\t\t<Item Name="Caption" Value="a" />\r\n'));
		write(
			"Resources/TestA.Entity/resource.en-US.xml",
			'﻿<?xml version="1.0" encoding="utf-8"?>\r\n<Resources Culture="en-US">\r\n\t<Items>\r\n\t\t<Item Name="Caption" Value="a" />\r\n\t</Items>\r\n</Resources>\r\n',
		);
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(false);
		const groupIssues = report.issues.filter((i) => i.message.includes("вне <Group"));
		expect(groupIssues).toHaveLength(1);
		expect(groupIssues[0].level).toBe("error");
		expect(groupIssues[0].message).toContain("resource.en-US.xml");
		expect(groupIssues[0].message).toContain("CRM не сохранит ресурсы");
	});

	it("accepts resource items inside a Group with BOM and CRLF", () => {
		const schemaA = writeTestA(JSON.stringify({ MetaData: {} }));
		const items = '\t\t\t<Item Name="Caption" Value="a" />\r\n';
		write("Resources/TestA.Entity/resource.ru-RU.xml", "﻿" + resourceXml("ru-RU", items));
		write("Resources/TestA.Entity/resource.en-US.xml", "﻿" + resourceXml("en-US", items));
		const report = lintSchemas([schemaA], { knowledgeDir });
		expect(report.ok).toBe(true);
		expect(report.issues).toEqual([]);
	});

	it("accepts every resource example in the repository", () => {
		const roots = [
			path.join(knowledgeDir, "templates", "process"),
			...fs
				.readdirSync(path.join(__dirname, "..", "..", "evals", "fixtures"))
				.map((name) => path.join(__dirname, "..", "..", "evals", "fixtures", name, "Resources")),
		];
		const folders = roots
			.filter((root) => fs.existsSync(root))
			.flatMap((root) => fs.readdirSync(root).map((name) => path.join(root, name)))
			.filter((dir) => fs.existsSync(path.join(dir, "resource.ru-RU.xml")));
		expect(folders.length).toBeGreaterThanOrEqual(5);
		const schemaA = writeTestA(JSON.stringify({ MetaData: {} }));
		for (const folder of folders) {
			for (const culture of ["ru-RU", "en-US"]) {
				const source = path.join(folder, `resource.${culture}.xml`);
				write(`Resources/TestA.Entity/resource.${culture}.xml`, fs.readFileSync(source, "utf8"));
			}
			const report = lintSchemas([schemaA], { knowledgeDir });
			expect(report.issues.filter((i) => i.level === "error"), folder).toEqual([]);
		}
	});

	it("runs check-entity.js for entity schemas", () => {
		write("Schemas/TestE/descriptor.json", JSON.stringify(entityDescriptor, null, 2));
		write("Schemas/TestE/metadata.json", JSON.stringify(entityMetadata, null, 2));
		const schemaE = path.join(pkg, "Schemas", "TestE");
		const report = lintSchemas([schemaE], { knowledgeDir });
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.level === "error" && i.message.includes("ModifiedOnUtc"))).toBe(true);
	});

	it("returns the empty-changes text for an empty Pkg", () => {
		const emptyPkg = path.join(tmp, "Pkg");
		fs.mkdirSync(emptyPkg, { recursive: true });
		const report = lintChanged(emptyPkg, Date.now(), knowledgeDir);
		expect(report.text).toBe("pkg_lint: в этом чате схемы не изменялись.");
		expect(report.ok).toBe(true);
	});

	it("keeps the check-entity.js CLI working", () => {
		write("Schemas/TestE/descriptor.json", JSON.stringify(entityDescriptor, null, 2));
		write("Schemas/TestE/metadata.json", JSON.stringify(entityMetadata, null, 2));
		const schemaE = path.join(pkg, "Schemas", "TestE");
		const script = path.join(knowledgeDir, "scripts", "check-entity.js");
		let output: string;
		try {
			output = execFileSync(process.execPath, [script, schemaE], { encoding: "utf8" });
		} catch (e) {
			output = String((e as { stdout?: unknown }).stdout ?? "");
		}
		expect(output).toContain("Итого:");
	});
});

describe("createPkgLintTool", () => {
	let tmp: string;
	let pkgRoot: string;
	const knowledgeDir = path.join(__dirname, "..", "knowledge");

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-lint-tool-")));
		pkgRoot = path.join(tmp, "Pkg");
		fs.mkdirSync(path.join(pkgRoot, "P1", "Schemas", "TestA"), { recursive: true });
		fs.writeFileSync(path.join(pkgRoot, "P1", "Schemas", "TestA", "metadata.json"), '{"a": 1,}');
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("reports broken changed schemas as errors", async () => {
		const tool = createPkgLintTool({ pkgRoot, since: () => Date.now() - 1000, knowledgeDir });
		const result = await tool.execute({});
		expect(result.isError).toBe(true);
	});

	it("lints a named schema and reports its errors", async () => {
		const tool = createPkgLintTool({ pkgRoot, since: () => Date.now() - 1000, knowledgeDir });
		const result = await tool.execute({ schema: "TestA" });
		expect(result.isError).toBe(true);
	});

	it("reports a missing schema by name", async () => {
		const tool = createPkgLintTool({ pkgRoot, since: () => Date.now() - 1000, knowledgeDir });
		const result = await tool.execute({ schema: "Missing" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("не найдена");
	});
});

describe("pkgLint SQL scripts and C# brackets", () => {
	let tmp: string;
	let pkg: string;
	const knowledgeDir = path.join(__dirname, "..", "knowledge");

	const write = (rel: string, content: string): string => {
		const file = path.join(pkg, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	};

	/** Writes an SQL script folder with descriptor.json and <name>.sql. */
	const writeSql = (name: string, scriptName: string, sql: string): string => {
		write(
			`SqlScripts/${name}/descriptor.json`,
			JSON.stringify({ SqlScript: { UId: "22222222-2222-2222-2222-222222222222", Name: scriptName, DBEngineType: "All", InstallType: 0, ModifiedOnUtc: "1", DependsOn: [] } }, null, 2),
		);
		write(`SqlScripts/${name}/${name}.sql`, sql);
		return path.join(pkg, "SqlScripts", name);
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-lint-sql-")));
		pkg = path.join(tmp, "P1");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("accepts a valid SQL script", () => {
		const dir = writeSql("TestSql", "TestSql", "SELECT 1;");
		const report = lintSchemas([], { knowledgeDir, sqlScriptDirs: [dir] });
		expect(report.issues).toEqual([]);
		expect(report.ok).toBe(true);
		expect(report.checked).toBe(1);
	});

	it("reports a SQL script whose Name differs from the folder", () => {
		const dir = writeSql("TestSql", "OtherSql", "SELECT 1;");
		const issues = lintSqlScripts([dir]);
		expect(issues.some((i) => i.level === "error" && i.message.includes("не совпадает с папкой"))).toBe(true);
	});

	it("reports an empty SQL file", () => {
		const dir = writeSql("TestSql", "TestSql", "  \n");
		const issues = lintSqlScripts([dir]);
		expect(issues.some((i) => i.level === "error" && i.message.includes("файл не найден или пустой"))).toBe(true);
	});

	it("finds a SQL script by name in the lint tool", async () => {
		writeSql("TestSql", "TestSql", "SELECT 1;");
		const tool = createPkgLintTool({ pkgRoot: tmp, since: () => Date.now() - 1000, knowledgeDir });
		const result = await tool.execute({ schema: "TestSql" });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("проверено схем: 1");
	});

	it("accepts balanced C# with strings, comments, verbatim, char and interpolated literals", () => {
		const balanced = [
			"using System;",
			"class Demo",
			"{",
			'\t// comment with }',
			'\tstring a = "{ not code }";',
			'\tstring b = @"a""}";',
			"\tchar c = '{';",
			"\tint a2 = 1, b2 = 2, c2 = 3;",
			'\tstring s1 = $"x {a2 + (b2)} y {{z}}";',
			'\tstring s2 = $"{(c2 > 0 ? "a" : "b")}";',
			"}",
			"",
		].join("\n");
		expect(checkCsBrackets(balanced)).toBeUndefined();
	});

	it("skips text with preprocessor #else branches", () => {
		expect(checkCsBrackets("namespace A {\n#if X\nclass B {\n#else\nclass B : C {\n#endif\n}\n}")).toBeUndefined();
	});

	it("reports an extra closing brace", () => {
		const msg = checkCsBrackets("class A {\n\tvoid M() {\n\t}\n}\n}\n");
		expect(msg).toContain("лишняя «}»");
	});

	it("reports a missing closing parenthesis", () => {
		const msg = checkCsBrackets("class A\n{\n\tvoid M()\n\t{\n\t\tint x = (1 + 2;\n\t}\n}\n");
		expect(msg).toContain("не закрыта «(»");
	});

	it("warns about unbalanced brackets in a schema C# file without failing the report", () => {
		write("Schemas/TestC/Bad.cs", "class A { void M() { }\n");
		const schemaC = path.join(pkg, "Schemas", "TestC");
		const report = lintSchemas([schemaC], { knowledgeDir });
		expect(report.ok).toBe(true);
		const warning = report.issues.find((i) => i.level === "warning" && i.message.includes("несбалансированные скобки"));
		expect(warning).toBeDefined();
	});
});
