import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EvalConfig, loadCase, loadConfig, packagesToReset, substitute } from "../src/caseFile";

const config: EvalConfig = {
	appRoot: "/app",
	package: "TestPkg",
	prefix: "Test",
	vars: { entity: "TestEntity" },
};

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-case-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("substitute", () => {
	it("replaces package, prefix and vars", () => {
		const text = "{{package}} {{prefix}}_{{entity}}";
		expect(substitute(text, config)).toBe("TestPkg Test_TestEntity");
	});

	it("throws on an unknown placeholder", () => {
		expect(() => substitute("x {{unknown}}", config)).toThrow("Неизвестная подстановка {{unknown}}");
	});
});

describe("packagesToReset", () => {
	it("defaults to the package", () => {
		expect(packagesToReset(config)).toEqual(["TestPkg"]);
	});

	it("uses resetPackages when given", () => {
		expect(packagesToReset({ ...config, resetPackages: ["P1", "P2"] })).toEqual(["P1", "P2"]);
	});

	it("falls back to the package for an empty resetPackages", () => {
		expect(packagesToReset({ ...config, resetPackages: [] })).toEqual(["TestPkg"]);
	});
});

describe("loadConfig", () => {
	it("keeps models", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({
			appRoot: "/app",
			package: "TestPkg",
			prefix: "Test",
			models: { claude: "", cursor: "composer-2.5" },
		}));
		expect(loadConfig(file).models).toEqual({ claude: "", cursor: "composer-2.5" });
	});

	it("keeps the db object with overrides", () => {
		const file = path.join(tmpDir, "local.json");
		fs.writeFileSync(file, JSON.stringify({
			appRoot: "/app",
			package: "TestPkg",
			prefix: "Test",
			db: { host: "localhost", port: 5432, user: "dbuser" },
		}));
		expect(loadConfig(file).db).toEqual({ host: "localhost", port: 5432, user: "dbuser" });
	});
});

describe("loadCase", () => {
	it("substitutes nested strings and takes id from the file name", () => {
		const file = path.join(tmpDir, "case-one.json");
		fs.writeFileSync(file, JSON.stringify({
			title: "Создать {{entity}}",
			task: "Работай в {{package}}",
			answers: [{ when: "пакет", text: "{{prefix}}" }],
			maxTurns: 3,
			checks: [{ type: "file_exists", path: "Schemas/{{entity}}/metadata.json" }],
		}));

		const testCase = loadCase(file, config);

		expect(testCase.id).toBe("case-one");
		expect(testCase.title).toBe("Создать TestEntity");
		expect(testCase.task).toBe("Работай в TestPkg");
		expect(testCase.answers).toEqual([{ when: "пакет", text: "Test" }]);
		expect(testCase.checks).toEqual([{ type: "file_exists", path: "Schemas/TestEntity/metadata.json" }]);
	});

	it("keeps an explicit id", () => {
		const file = path.join(tmpDir, "other.json");
		fs.writeFileSync(file, JSON.stringify({ id: "my-id", title: "t", task: "t", answers: [], maxTurns: 1, checks: [] }));
		expect(loadCase(file, config).id).toBe("my-id");
	});
});
