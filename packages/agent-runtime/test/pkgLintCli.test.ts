import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runPkgLintCli } from "../src/lint/pkgLintCli";

describe("runPkgLintCli", () => {
	let tmp: string;
	let root: string;
	let pkg: string;
	const knowledgeDir = path.join(__dirname, "..", "knowledge");

	/** Writes a file under the test package, creating parent folders. */
	const write = (rel: string, content: string): string => {
		const file = path.join(pkg, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	};

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

	/** Returns metadata of a valid client schema with the given name. */
	const validMetadata = (name: string): string =>
		JSON.stringify({ MetaData: { Schema: { ManagerName: "ClientUnitSchemaManager", A2: name } } });

	/** Writes a valid client schema descriptor and the given metadata. */
	const writeClient = (name: string, metadata: string): void => {
		write(
			`Schemas/${name}/descriptor.json`,
			JSON.stringify({ Descriptor: { Name: name, ManagerName: "ClientUnitSchemaManager" } }, null, 2),
		);
		write(`Schemas/${name}/metadata.json`, metadata);
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-lint-cli-")));
		root = path.join(tmp, "Pkg");
		pkg = path.join(root, "P1");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("schema dir with broken JSON gives code 1 and ОШИБКА", () => {
		write("Schemas/TestE/descriptor.json", JSON.stringify(entityDescriptor, null, 2));
		write("Schemas/TestE/metadata.json", '{"a": 1,}');
		const result = runPkgLintCli([path.join(pkg, "Schemas", "TestE")], knowledgeDir);
		expect(result.code).toBe(1);
		expect(result.text).toContain("ОШИБКА");
	});

	it("package path lints every schema", () => {
		writeClient("TestA", validMetadata("TestA"));
		writeClient("TestB", validMetadata("TestB"));
		const result = runPkgLintCli([pkg], knowledgeDir);
		expect(result.code).toBe(0);
		expect(result.text).toContain("Итого: 0 ошибок");
		expect(result.text).toContain("проверено схем: 2");
	});

	it("no paths gives code 2 with usage", () => {
		const result = runPkgLintCli([], knowledgeDir);
		expect(result.code).toBe(2);
		expect(result.text).toContain("pkg-lint.js");
	});

	it("--git takes changed schemas from git status", () => {
		writeClient("TestA", validMetadata("TestA"));
		writeClient("TestB", validMetadata("TestB"));
		const git = (...args: string[]): string =>
			execFileSync("git", ["-C", root, "-c", "user.email=test@example.com", "-c", "user.name=test", ...args], {
				encoding: "utf8",
			});
		git("init");
		git("add", "-A");
		git("commit", "-m", "init");
		write("Schemas/TestA/metadata.json", '{"a": 1,}');
		const result = runPkgLintCli(["--git", root], knowledgeDir);
		expect(result.code).toBe(1);
		expect(result.text).toContain("ОШИБКА");
		expect(result.text).toContain("проверено схем: 1");
	});
});
