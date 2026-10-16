import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { EvalConfig } from "../src/caseFile";
import {
	EVAL_PACKAGE_MARKER,
	PRODUCT_CORE,
	applyFixtures,
	ensureEvalPackage,
	readPackageUid,
	resetEvalPackage,
	snapshotPackage,
	writeSqlScript,
} from "../src/evalPackage";

const BOM = "\uFEFF";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUBFOLDERS = ["Assemblies", "Data", "Resources", "Schemas", "SqlScripts"];

let tmpDir: string;
let pkgRoot: string;
const config: EvalConfig = { appRoot: "/app", package: "EvalPackage", prefix: "Test" };

/** Creates Pkg with Custom/descriptor.json, as a BPMSoft stand has it. */
function makePkgRoot(): void {
	fs.mkdirSync(path.join(pkgRoot, "Custom"), { recursive: true });
	const custom = { Descriptor: { UId: "c", Name: "Custom", BPMSoftVersion: "8.2.1.1000" } };
	fs.writeFileSync(path.join(pkgRoot, "Custom", "descriptor.json"), BOM + JSON.stringify(custom, null, 2), "utf8");
}

function readDescriptor(packageDir: string): { Descriptor: Record<string, unknown> } {
	const raw = fs.readFileSync(path.join(packageDir, "descriptor.json"), "utf8");
	return JSON.parse(raw.replace(/^\uFEFF/, "")) as { Descriptor: Record<string, unknown> };
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-pkgfiles-"));
	pkgRoot = path.join(tmpDir, "Pkg");
	fs.mkdirSync(pkgRoot, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ensureEvalPackage", () => {
	it("creates the package with the marker, BOM, escaped date and ProductCore by default", () => {
		makePkgRoot();
		const result = ensureEvalPackage(pkgRoot, config, 1700000000000);
		const packageDir = path.join(pkgRoot, "EvalPackage");

		expect(result.created).toBe(true);
		expect(result.uid).toMatch(UUID);
		for (const folder of SUBFOLDERS) {
			expect(fs.statSync(path.join(packageDir, folder)).isDirectory()).toBe(true);
		}
		const raw = fs.readFileSync(path.join(packageDir, "descriptor.json"), "utf8");
		expect(raw.startsWith(BOM)).toBe(true);
		expect(raw).toContain(String.raw`\/Date(1700000000000)\/`);
		const descriptor = readDescriptor(packageDir).Descriptor;
		expect(descriptor.UId).toBe(result.uid);
		expect(descriptor.Name).toBe("EvalPackage");
		expect(descriptor.BPMSoftVersion).toBe("8.2.1.1000");
		expect(descriptor.Description).toBe(EVAL_PACKAGE_MARKER);
		expect(descriptor.ModifiedOnUtc).toBe("/Date(1700000000000)/");
		expect(descriptor.DependsOn).toEqual([PRODUCT_CORE]);
	});

	it("uses dependsOn from the config when given", () => {
		makePkgRoot();
		const dependsOn = [{ UId: "11111111-2222-3333-4444-555555555555", Name: "Base", PackageVersion: "2.0.0" }];
		ensureEvalPackage(pkgRoot, { ...config, dependsOn }, 1);
		expect(readDescriptor(path.join(pkgRoot, "EvalPackage")).Descriptor.DependsOn).toEqual(dependsOn);
	});

	it("returns created false for a package with the marker", () => {
		makePkgRoot();
		const first = ensureEvalPackage(pkgRoot, config, 1);
		const second = ensureEvalPackage(pkgRoot, config, 2);
		expect(second).toEqual({ created: false, uid: first.uid });
	});

	it("throws for a package created without the marker", () => {
		makePkgRoot();
		const packageDir = path.join(pkgRoot, "EvalPackage");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, "descriptor.json"),
			JSON.stringify({ Descriptor: { UId: "x", Description: "Команда" } }),
			"utf8",
		);
		expect(() => ensureEvalPackage(pkgRoot, config)).toThrow("не создан раннером эвалов");
	});

	it("throws for a folder without descriptor.json", () => {
		makePkgRoot();
		fs.mkdirSync(path.join(pkgRoot, "EvalPackage"), { recursive: true });
		expect(() => ensureEvalPackage(pkgRoot, config)).toThrow("descriptor.json в ней нет");
	});

	it("throws when Pkg/Custom has no BPMSoft version", () => {
		fs.mkdirSync(path.join(pkgRoot, "Custom"), { recursive: true });
		fs.writeFileSync(path.join(pkgRoot, "Custom", "descriptor.json"), JSON.stringify({ Descriptor: {} }), "utf8");
		expect(() => ensureEvalPackage(pkgRoot, config)).toThrow("BPMSoftVersion");
	});

	it("throws when Pkg/Custom/descriptor.json is missing", () => {
		expect(() => ensureEvalPackage(pkgRoot, config)).toThrow("Pkg/Custom/descriptor.json");
	});
});

describe("resetEvalPackage", () => {
	it("keeps descriptor.json and removes everything else", () => {
		makePkgRoot();
		ensureEvalPackage(pkgRoot, config, 1);
		const packageDir = path.join(pkgRoot, "EvalPackage");
		const before = fs.readFileSync(path.join(packageDir, "descriptor.json"), "utf8");
		fs.mkdirSync(path.join(packageDir, "Schemas", "TestA"), { recursive: true });
		fs.writeFileSync(path.join(packageDir, "Schemas", "TestA", "metadata.json"), "{}", "utf8");
		fs.writeFileSync(path.join(packageDir, "Extra.txt"), "x", "utf8");

		resetEvalPackage(packageDir);

		expect(fs.readFileSync(path.join(packageDir, "descriptor.json"), "utf8")).toBe(before);
		expect(fs.existsSync(path.join(packageDir, "Extra.txt"))).toBe(false);
		expect(fs.existsSync(path.join(packageDir, "Schemas", "TestA"))).toBe(false);
		expect(fs.readdirSync(path.join(packageDir, "Schemas"))).toEqual([]);
		for (const folder of SUBFOLDERS) {
			expect(fs.statSync(path.join(packageDir, folder)).isDirectory()).toBe(true);
		}
	});

	it("restores DependsOn with a fresh escaped date and keeps the BOM when the agent added a dependency", () => {
		makePkgRoot();
		ensureEvalPackage(pkgRoot, config, 1);
		const packageDir = path.join(pkgRoot, "EvalPackage");
		const agentDependency = { UId: "11111111-2222-3333-4444-555555555555", Name: "Extra", PackageVersion: "1.0.0" };
		const edited = readDescriptor(packageDir);
		edited.Descriptor.DependsOn = [PRODUCT_CORE, agentDependency];
		fs.writeFileSync(path.join(packageDir, "descriptor.json"), BOM + JSON.stringify(edited, null, 2), "utf8");

		resetEvalPackage(packageDir, [PRODUCT_CORE], 1700000000999);

		const raw = fs.readFileSync(path.join(packageDir, "descriptor.json"), "utf8");
		expect(raw.startsWith(BOM)).toBe(true);
		expect(raw).toContain(String.raw`\/Date(1700000000999)\/`);
		const descriptor = readDescriptor(packageDir).Descriptor;
		expect(descriptor.DependsOn).toEqual([PRODUCT_CORE]);
		expect(descriptor.ModifiedOnUtc).toBe("/Date(1700000000999)/");
		expect(descriptor.Description).toBe(EVAL_PACKAGE_MARKER);
	});

	it("leaves descriptor.json byte-identical when DependsOn already matches", () => {
		makePkgRoot();
		ensureEvalPackage(pkgRoot, config, 1);
		const packageDir = path.join(pkgRoot, "EvalPackage");
		const before = fs.readFileSync(path.join(packageDir, "descriptor.json"));

		resetEvalPackage(packageDir, [PRODUCT_CORE], 2);

		expect(fs.readFileSync(path.join(packageDir, "descriptor.json")).equals(before)).toBe(true);
	});

	it("throws without the marker and removes nothing", () => {
		const packageDir = path.join(pkgRoot, "Other");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "descriptor.json"), JSON.stringify({ Descriptor: { Description: "" } }), "utf8");
		fs.writeFileSync(path.join(packageDir, "keep.txt"), "x", "utf8");

		expect(() => resetEvalPackage(packageDir)).toThrow("не создан раннером эвалов");
		expect(fs.existsSync(path.join(packageDir, "keep.txt"))).toBe(true);
	});

	it("throws without descriptor.json", () => {
		const packageDir = path.join(pkgRoot, "Empty");
		fs.mkdirSync(packageDir, { recursive: true });
		expect(() => resetEvalPackage(packageDir)).toThrow("descriptor.json");
	});
});

describe("applyFixtures", () => {
	it("copies the fixture keeping the layout and substitutes names and text", () => {
		const fixturesDir = path.join(tmpDir, "fixtures");
		const schemaDir = path.join(fixturesDir, "Base", "Schemas", "{{prefix}}Obj");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemaDir, "descriptor.json"),
			BOM + '{"Name":"{{prefix}}Obj","Package":"{{package}}","UId":"{{packageUId}}","Now":"{{now}}"}',
			"utf8",
		);
		const packageDir = path.join(pkgRoot, "EvalPackage");
		fs.mkdirSync(packageDir, { recursive: true });

		applyFixtures(fixturesDir, ["Base"], packageDir, {
			package: "EvalPackage",
			prefix: "Test",
			packageUId: "uid-1",
			now: "5",
		});

		const copied = path.join(packageDir, "Schemas", "TestObj", "descriptor.json");
		const raw = fs.readFileSync(copied, "utf8");
		expect(raw.startsWith(BOM)).toBe(true);
		expect(JSON.parse(raw.replace(/^\uFEFF/, ""))).toEqual({
			Name: "TestObj",
			Package: "EvalPackage",
			UId: "uid-1",
			Now: "5",
		});
	});

	it("throws on an unknown key and names the fixture", () => {
		const fixturesDir = path.join(tmpDir, "fixtures");
		fs.mkdirSync(path.join(fixturesDir, "Bad"), { recursive: true });
		fs.writeFileSync(path.join(fixturesDir, "Bad", "a.txt"), "{{unknown}}", "utf8");
		expect(() => applyFixtures(fixturesDir, ["Bad"], tmpDir, { package: "P", prefix: "T" })).toThrow(
			"Неизвестная подстановка {{unknown}} в заготовке Bad",
		);
	});

	it("throws for a missing fixture folder", () => {
		expect(() => applyFixtures(path.join(tmpDir, "none"), ["Base"], tmpDir, {})).toThrow("Нет заготовки Base");
	});
});

describe("writeSqlScript", () => {
	it("writes descriptor.json with BOM, escaped date and the sql file", () => {
		const packageDir = path.join(tmpDir, "EvalPackage");
		const folder = writeSqlScript(packageDir, "TestEvalTeardown", "DELETE FROM x;", 1700000000000);

		expect(folder).toBe(path.join(packageDir, "SqlScripts", "TestEvalTeardown"));
		const raw = fs.readFileSync(path.join(folder, "descriptor.json"), "utf8");
		expect(raw.startsWith(BOM)).toBe(true);
		expect(raw).toContain(String.raw`\/Date(1700000000000)\/`);
		const body = JSON.parse(raw.replace(/^\uFEFF/, "")) as { SqlScript: Record<string, unknown> };
		expect(body.SqlScript.Name).toBe("TestEvalTeardown");
		expect(body.SqlScript.UId).toMatch(UUID);
		expect(body.SqlScript.ModifiedOnUtc).toBe("/Date(1700000000000)/");
		expect(body.SqlScript.DBEngineType).toBe(2);
		expect(body.SqlScript.InstallType).toBe(1);
		expect(body.SqlScript.DependsOn).toEqual([]);
		expect(fs.readFileSync(path.join(folder, "TestEvalTeardown.sql"), "utf8")).toBe("DELETE FROM x;");
	});
});

describe("snapshotPackage and readPackageUid", () => {
	it("maps every file to a sha256 keyed by a relative path with slashes", () => {
		const packageDir = path.join(tmpDir, "EvalPackage");
		fs.mkdirSync(path.join(packageDir, "Schemas", "A"), { recursive: true });
		fs.writeFileSync(path.join(packageDir, "Schemas", "A", "metadata.json"), "abc", "utf8");
		fs.writeFileSync(path.join(packageDir, "descriptor.json"), "{}", "utf8");

		const snapshot = snapshotPackage(packageDir);

		expect([...snapshot.keys()].sort()).toEqual(["Schemas/A/metadata.json", "descriptor.json"]);
		expect(snapshot.get("Schemas/A/metadata.json")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("reads the package UId and throws without one", () => {
		const packageDir = path.join(tmpDir, "EvalPackage");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "descriptor.json"), JSON.stringify({ Descriptor: { UId: "abc" } }), "utf8");
		expect(readPackageUid(packageDir)).toBe("abc");

		fs.writeFileSync(path.join(packageDir, "descriptor.json"), JSON.stringify({ Descriptor: {} }), "utf8");
		expect(() => readPackageUid(packageDir)).toThrow("нет UId");
	});
});
