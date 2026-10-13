import * as path from "path";
import { describe, it, expect } from "vitest";
import { hasOsShellSandbox, buildShellSandbox } from "../src/safety/shellSandbox";

describe("shellSandbox", () => {
	describe("hasOsShellSandbox", () => {
		it("is true on darwin", () => {
			expect(hasOsShellSandbox("darwin")).toBe(true);
		});

		it("is true on linux", () => {
			expect(hasOsShellSandbox("linux")).toBe(true);
		});

		it("is false on win32", () => {
			expect(hasOsShellSandbox("win32")).toBe(false);
		});
	});

	describe("buildShellSandbox", () => {
		const settings = buildShellSandbox(["/p/Pkg"], "/Users/u");

		it("enables the sandbox and fails instead of running unsandboxed", () => {
			expect(settings.enabled).toBe(true);
			expect(settings.failIfUnavailable).toBe(true);
			expect(settings.allowUnsandboxedCommands).toBe(false);
		});

		it("allows no network domains with strict allowlist", () => {
			expect(settings.network?.allowedDomains).toEqual([]);
			expect(settings.network?.strictAllowlist).toBe(true);
		});

		it("allows writes only in the given roots", () => {
			expect(settings.filesystem?.allowWrite).toEqual(["/p/Pkg"]);
		});

		it("denies reading credential folders in the home directory", () => {
			expect(settings.filesystem?.denyRead).toContain(path.join("/Users/u", ".ssh"));
			expect(settings.filesystem?.denyRead).toContain(path.join("/Users/u", "Library", "Keychains"));
		});
	});
});
