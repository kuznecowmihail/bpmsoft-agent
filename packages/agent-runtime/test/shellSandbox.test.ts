import * as path from "path";
import { describe, it, expect } from "vitest";
import { hasOsShellSandbox, buildShellSandbox, homeReadDirs } from "../src/safety/shellSandbox";

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

	describe("homeReadDirs", () => {
		it.skipIf(process.platform === "win32")("keeps tool folders in home and drops the rest", () => {
			const pathEnv = ["/Users/u/.nvm/versions/node/v22/bin", "/usr/bin", "/Users/u/.config/x/bin", "/Users/u"].join(path.delimiter);
			expect(homeReadDirs("/Users/u", pathEnv)).toEqual(["/Users/u/.nvm/versions/node/v22", "/Users/u/.gitconfig"]);
		});
	});

	describe("buildShellSandbox", () => {
		const settings = buildShellSandbox({ writeRoots: ["/p/Pkg"], readRoots: ["/p/app"], homeDir: "/Users/u", pathEnv: "/usr/bin" });

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

		it("denies reading the home directory itself", () => {
			expect(settings.filesystem?.denyRead).toContain("/Users/u");
		});

		it("allows reading the given read roots", () => {
			expect(settings.filesystem?.allowRead).toContain("/p/app");
		});

		it("unsets the API key variables for sandboxed commands", () => {
			expect(settings.credentials?.envVars).toContainEqual({ name: "ANTHROPIC_API_KEY", mode: "deny" });
		});
	});
});
