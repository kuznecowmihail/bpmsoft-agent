import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadEnvFile, parseEnv } from "../src/envFile";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-env-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseEnv", () => {
	it("parses BOM, CRLF, export prefix, quotes, comments and invalid lines", () => {
		const text = "\uFEFFA=1\r\nexport B=\"two words\"\n# c\nC='x#y'\nbad line\n1X=2\nD = spaced \n";
		expect(parseEnv(text)).toEqual({ A: "1", B: "two words", C: "x#y", D: "spaced" });
	});
});

describe("loadEnvFile", () => {
	it("does not override variables already set and returns only loaded names", () => {
		const file = path.join(tmpDir, ".env");
		fs.writeFileSync(file, "A=1\nB=2\n");
		const env: NodeJS.ProcessEnv = { B: "keep" };
		expect(loadEnvFile(file, env)).toEqual(["A"]);
		expect(env.A).toBe("1");
		expect(env.B).toBe("keep");
	});

	it("returns an empty list when the file is missing", () => {
		expect(loadEnvFile(path.join(tmpDir, "missing.env"), {})).toEqual([]);
	});
});
