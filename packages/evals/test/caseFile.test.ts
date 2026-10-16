import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EvalConfig, loadCase, loadConfig, substitute } from "../src/caseFile";

const config: EvalConfig = {
	appRoot: "/app",
	package: "TestPkg",
	prefix: "Test",
};

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-case-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("substitute", () => {
	it("replaces package and prefix", () => {
		const text = "{{package}} {{prefix}}_Entity";
		expect(substitute(text, config)).toBe("TestPkg Test_Entity");
	});

	it("throws on an unknown placeholder", () => {
		expect(() => substitute("x {{unknown}}", config)).toThrow("Неизвестная подстановка {{unknown}}");
	});

	it("throws on a placeholder that is no longer supported", () => {
		expect(() => substitute("x {{entity}}", config)).toThrow("Неизвестная подстановка {{entity}}");
	});
});

describe("loadConfig", () => {
	it("requires only appRoot and fills package and prefix with defaults", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({ appRoot: "/app" }));
		const loaded = loadConfig(file);
		expect(loaded.package).toBe("EvalPackage");
		expect(loaded.prefix).toBe("Test");
	});

	it("throws without appRoot", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({ package: "TestPkg" }));
		expect(() => loadConfig(file)).toThrow("Нет поля appRoot");
	});

	it("keeps package, prefix and dependsOn when given", () => {
		const file = path.join(tmpDir, "local.json");
		const dependsOn = [{ UId: "u", Name: "N" }];
		fs.writeFileSync(file, JSON.stringify({ appRoot: "/app", package: "P1", prefix: "Px", dependsOn }));
		const loaded = loadConfig(file);
		expect(loaded.package).toBe("P1");
		expect(loaded.prefix).toBe("Px");
		expect(loaded.dependsOn).toEqual(dependsOn);
	});

	it("keeps models", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({
			appRoot: "/app",
			models: { claude: "", cursor: "composer-2.5" },
		}));
		expect(loadConfig(file).models).toEqual({ claude: "", cursor: "composer-2.5" });
	});

	it("keeps the db object with overrides", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({
			appRoot: "/app",
			db: { host: "localhost", port: 5432, user: "dbuser" },
		}));
		expect(loadConfig(file).db).toEqual({ host: "localhost", port: 5432, user: "dbuser" });
	});
});

describe("loadCase", () => {
	it("substitutes nested strings and takes id from the file name", () => {
		const file = path.join(tmpDir, "case-one.json");
		fs.writeFileSync(file, JSON.stringify({
			title: "Создать {{prefix}}Entity",
			task: "Работай в {{package}}",
			answers: [{ when: "пакет", text: "{{prefix}}" }],
			maxTurns: 3,
			checks: [{ type: "file_exists", path: "Schemas/{{prefix}}Entity/metadata.json" }],
		}));

		const testCase = loadCase(file, config);

		expect(testCase.id).toBe("case-one");
		expect(testCase.title).toBe("Создать TestEntity");
		expect(testCase.task).toBe("Работай в TestPkg");
		expect(testCase.answers).toEqual([{ when: "пакет", text: "Test" }]);
		expect(testCase.checks).toEqual([{ type: "file_exists", path: "Schemas/TestEntity/metadata.json" }]);
	});

	it("keeps an explicit id and fixtures", () => {
		const file = path.join(tmpDir, "other.json");
		fs.writeFileSync(file, JSON.stringify({
			id: "my-id",
			title: "t",
			task: "t",
			answers: [],
			maxTurns: 1,
			checks: [],
			fixtures: ["Base"],
		}));
		const loaded = loadCase(file, config);
		expect(loaded.id).toBe("my-id");
		expect(loaded.fixtures).toEqual(["Base"]);
	});
});
