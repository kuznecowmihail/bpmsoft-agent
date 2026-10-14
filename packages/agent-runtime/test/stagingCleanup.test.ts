import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { removeStagingDir, cleanupStagingDirs } from "../src/tools/stagingCleanup";

describe("stagingCleanup", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeStagingDir(dir: string): void {
		fs.mkdirSync(path.join(dir, ".claude", ".cc-writes"), { recursive: true });
	}

	describe("removeStagingDir", () => {
		it("removes .claude/.cc-writes and the now-empty .claude", () => {
			const dir = path.join(tmpDir, "X");
			makeStagingDir(dir);

			removeStagingDir(dir);

			expect(fs.existsSync(path.join(dir, ".claude"))).toBe(false);
			expect(fs.existsSync(dir)).toBe(true);
		});

		it("keeps a .claude folder that contains another file, but removes .cc-writes inside it", () => {
			const dir = path.join(tmpDir, "X");
			makeStagingDir(dir);
			fs.writeFileSync(path.join(dir, ".claude", "settings.json"), "{}");

			removeStagingDir(dir);

			expect(fs.existsSync(path.join(dir, ".claude", ".cc-writes"))).toBe(false);
			expect(fs.existsSync(path.join(dir, ".claude", "settings.json"))).toBe(true);
		});

		it("does nothing and does not throw when the directory has no .claude", () => {
			const dir = path.join(tmpDir, "X");
			fs.mkdirSync(dir, { recursive: true });

			expect(() => removeStagingDir(dir)).not.toThrow();
			expect(fs.existsSync(dir)).toBe(true);
		});
	});

	describe("cleanupStagingDirs", () => {
		it("sweeps nested write roots and keeps the other folders", () => {
			const root = path.join(tmpDir, "Pkg");
			const nested = path.join(root, "a", "Schemas", "X");
			makeStagingDir(nested);
			makeStagingDir(root);

			cleanupStagingDirs([], [root]);

			expect(fs.existsSync(path.join(nested, ".claude"))).toBe(false);
			expect(fs.existsSync(path.join(root, ".claude"))).toBe(false);
			expect(fs.existsSync(nested)).toBe(true);
			expect(fs.existsSync(path.join(root, "a", "Schemas"))).toBe(true);
		});

		it("keeps a staging dir deeper than the sweep unless its parent is in touchedDirs", () => {
			const root = path.join(tmpDir, "Pkg");
			const deep = path.join(root, "a", "b", "c", "d", "e");
			makeStagingDir(deep);

			cleanupStagingDirs([], [root]);
			expect(fs.existsSync(path.join(deep, ".claude", ".cc-writes"))).toBe(true);

			cleanupStagingDirs([deep]);
			expect(fs.existsSync(path.join(deep, ".claude"))).toBe(false);
			expect(fs.existsSync(deep)).toBe(true);
		});
	});
});
