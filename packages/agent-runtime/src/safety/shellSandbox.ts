import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { SandboxSettings } from "@anthropic-ai/claude-agent-sdk";

/** Folders in the user's home with credentials; the sandboxed shell may not read them. */
export const SECRET_HOME_DIRS = [".ssh", ".aws", ".azure", ".gnupg", ".kube", ".docker", ".config", ".netrc", ".npmrc", ".pgpass", ".git-credentials", "Library/Keychains", "Library/Cookies", "Library/Application Support"];

/** The Claude CLI runs Bash inside an OS sandbox on macOS (Seatbelt) and Linux (bubblewrap); Windows has none. */
export function hasOsShellSandbox(platform: NodeJS.Platform = process.platform): boolean {
	return platform === "darwin" || platform === "linux";
}

/**
 * OS sandbox for the agent's shell commands: writes only in `writeRoots`, no network,
 * no reading of credential folders, and no way for the model to run a command outside it.
 */
export function buildShellSandbox(writeRoots: string[], homeDir: string): SandboxSettings {
	return {
		enabled: true,
		failIfUnavailable: true,
		allowUnsandboxedCommands: false,
		network: { allowedDomains: [], strictAllowlist: true },
		filesystem: {
			allowWrite: writeRoots,
			denyRead: SECRET_HOME_DIRS.map((dir) => path.join(homeDir, dir))
		}
	};
}

/** Escapes a path for a Seatbelt (SBPL) string literal. */
function sbplString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Real path of a directory when it exists (Seatbelt matches real paths: /var → /private/var). */
function realDir(dir: string): string {
	try {
		return fs.realpathSync(dir);
	} catch {
		return dir;
	}
}

/**
 * macOS Seatbelt profile for our own shell tool (same limits as the Claude CLI sandbox):
 * writes only in `writeRoots` and the temp folders, no network, no reading of credential folders.
 */
export function buildSeatbeltProfile(writeRoots: string[], homeDir: string, tempDirs: string[] = [os.tmpdir(), "/private/tmp"]): string {
	const writable = [...writeRoots, ...tempDirs].map((dir) => `(subpath ${sbplString(realDir(dir))})`).join(" ");
	const secret = SECRET_HOME_DIRS.map((dir) => `(subpath ${sbplString(path.join(realDir(homeDir), dir))})`).join(" ");
	return [
		"(version 1)",
		"(allow default)",
		"(deny network*)",
		"(deny file-write*)",
		`(allow file-write* ${writable} (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/fd/") (regex #"^/dev/tty"))`,
		`(deny file-read* ${secret})`
	].join("\n");
}
