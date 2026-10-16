import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { SandboxSettings } from "@anthropic-ai/claude-agent-sdk";
import { isPathInside } from "./sandboxGuard";

/** Folders in the user's home with credentials; the sandboxed shell may not read them. */
export const SECRET_HOME_DIRS = [".ssh", ".aws", ".azure", ".gnupg", ".kube", ".docker", ".config", ".netrc", ".npmrc", ".pgpass", ".git-credentials", "Library/Keychains", "Library/Cookies", "Library/Application Support"];

/** API keys of the providers; sandboxed commands never see them. */
export const SECRET_ENV_VARS = ["ANTHROPIC_API_KEY", "CURSOR_API_KEY"];

/** Folders the sandbox works with: writable roots, readable roots, the home folder and the PATH of commands. */
export interface ShellSandboxRoots {
	writeRoots: string[];
	readRoots: string[];
	homeDir: string;
	/** PATH of the commands; default process.env.PATH. */
	pathEnv?: string;
}

/** The Claude CLI runs Bash inside an OS sandbox on macOS (Seatbelt) and Linux (bubblewrap); Windows has none. */
export function hasOsShellSandbox(platform: NodeJS.Platform = process.platform): boolean {
	return platform === "darwin" || platform === "linux";
}

/**
 * Folders in the home folder that commands must still read: PATH entries there (nvm, volta, ~/.local/bin — node and git live there;
 * for a `bin` folder its parent, where node keeps lib) and ~/.gitconfig.
 */
export function homeReadDirs(homeDir: string, pathEnv: string = process.env.PATH ?? ""): string[] {
	const dirs = pathEnv
		.split(path.delimiter)
		.filter((entry) => entry !== "")
		.filter((entry) => isPathInside(entry, homeDir) && path.resolve(entry) !== path.resolve(homeDir))
		.map((entry) => (path.basename(entry) === "bin" ? path.dirname(entry) : entry))
		// a `bin` folder directly in home would map to home itself: never open the whole home folder
		.filter((entry) => isPathInside(entry, homeDir) && path.resolve(entry) !== path.resolve(homeDir))
		.filter((entry) => !SECRET_HOME_DIRS.some((secret) => isPathInside(entry, path.join(homeDir, secret))));
	const unique = [...new Set(dirs)];
	return [...unique, path.join(homeDir, ".gitconfig")];
}

/**
 * OS sandbox for the agent's shell commands: writes only in `writeRoots`, no network, reads in the home folder only in
 * `readRoots` and tool folders, and no way for the model to run a command outside it. API key variables are unset.
 * allowRead takes precedence over denyRead in the SDK sandbox; credential folders are never readable.
 */
export function buildShellSandbox(roots: ShellSandboxRoots): SandboxSettings {
	return {
		enabled: true,
		failIfUnavailable: true,
		allowUnsandboxedCommands: false,
		network: { allowedDomains: [], strictAllowlist: true },
		filesystem: {
			allowWrite: roots.writeRoots,
			denyRead: [roots.homeDir, ...SECRET_HOME_DIRS.map((dir) => path.join(roots.homeDir, dir))],
			allowRead: [...roots.readRoots, ...homeReadDirs(roots.homeDir, roots.pathEnv)]
		},
		credentials: {
			envVars: SECRET_ENV_VARS.map((name) => ({ name, mode: "deny" as const }))
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
 * macOS Seatbelt profile for our own shell tool (same limits as the Claude CLI sandbox): writes only in `writeRoots` and the temp folders,
 * no network, no reading of the home folder except `readRoots`, `writeRoots` and tool folders, no reading of credential folders.
 * Later rules win in SBPL, so the allows for the home folder come after its denial, and the credential denial comes last.
 */
export function buildSeatbeltProfile(roots: ShellSandboxRoots & { tempDirs?: string[] }): string {
	const tempDirs = roots.tempDirs ?? [os.tmpdir(), "/private/tmp"];
	const pathEnv = roots.pathEnv;
	const writable = [...roots.writeRoots, ...tempDirs].map((dir) => `(subpath ${sbplString(realDir(dir))})`).join(" ");
	const readable = [...roots.readRoots, ...roots.writeRoots, ...homeReadDirs(roots.homeDir, pathEnv)].map((dir) => `(subpath ${sbplString(realDir(dir))})`).join(" ");
	const secret = SECRET_HOME_DIRS.map((dir) => `(subpath ${sbplString(path.join(realDir(roots.homeDir), dir))})`).join(" ");
	return [
		"(version 1)",
		"(allow default)",
		"(deny network*)",
		"(deny file-write*)",
		`(allow file-write* ${writable} (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/fd/") (regex #"^/dev/tty"))`,
		`(deny file-read-data (subpath ${sbplString(realDir(roots.homeDir))}))`,
		`(allow file-read-data ${readable})`,
		`(deny file-read* ${secret})`
	].join("\n");
}
