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
