import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listChangedFiles, changedSchemaNames, changedSchemaDirs } from "../src/lint/changedFiles";

describe("changedFiles", () => {
	let tmp: string;
	let pkg: string;

	/** Writes a file under Pkg, creating parent folders. */
	const write = (rel: string, content = "{}"): string => {
		const file = path.join(pkg, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "changed-files-")));
		pkg = path.join(tmp, "Pkg");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("reports changed schemas, resources, data and skips unchanged ones", () => {
		const since = Date.now() - 1000;
		const old = since / 1000 - 3600;

		write("P1/Schemas/TestA/metadata.json");
		write("P1/Resources/TestA.Entity/resource.ru-RU.xml");
		fs.utimesSync(write("P1/Schemas/TestOld/metadata.json"), old, old);
		write("P1/Data/TestData/data.json");

		expect(changedSchemaNames(pkg, since)).toEqual(new Set(["TestA", "TestData"]));
		expect(changedSchemaDirs(pkg, since)).toEqual([path.join(pkg, "P1", "Schemas", "TestA")]);
	});

	it("includes a schema when only its client resource changed", () => {
		const since = Date.now() - 1000;
		const old = since / 1000 - 3600;

		fs.utimesSync(write("P1/Schemas/TestB/metadata.json"), old, old);
		write("P1/Resources/TestB.ClientUnit/resource.en-US.xml");

		expect(changedSchemaDirs(pkg, since)).toContain(path.join(pkg, "P1", "Schemas", "TestB"));
	});

	it("ignores hidden folders and node_modules", () => {
		const since = Date.now() - 1000;

		const git = write("P1/.git/config");
		const claudeTmp = write("P1/Schemas/TestA/.claude/.cc-writes/x.tmp");
		const settings = write(".claude/settings.json");
		const modules = write("P1/Schemas/TestA/node_modules/pkg/index.json");
		write("P1/Schemas/TestA/metadata.json");

		const files = listChangedFiles(pkg, since);
		expect(files).not.toContain(git);
		expect(files).not.toContain(claudeTmp);
		expect(files).not.toContain(settings);
		expect(files).not.toContain(modules);
		expect(changedSchemaNames(pkg, since)).toEqual(new Set(["TestA"]));
	});

	it("returns empty results for an empty Pkg folder", () => {
		const since = Date.now() - 1000;

		expect(listChangedFiles(pkg, since)).toEqual([]);
		expect(changedSchemaNames(pkg, since)).toEqual(new Set());
		expect(changedSchemaDirs(pkg, since)).toEqual([]);
	});
});
