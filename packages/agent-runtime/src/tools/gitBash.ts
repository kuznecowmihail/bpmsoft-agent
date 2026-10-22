import * as fs from "fs";
import * as path from "path";

export interface GitBashLookup {
	platform: NodeJS.Platform;
	env: NodeJS.ProcessEnv;
	exists: (p: string) => boolean;
}

/** Folder of the WSL bash; it must never be used as a shell for agent commands. */
const SYSTEM32_PATTERN = /system32/i;

/** Candidates from the environment: an explicit override first, then PATH entries of Git for Windows, then default install folders. */
function gitBashCandidates(lookup: GitBashLookup): string[] {
	const { env } = lookup;
	const candidates: string[] = [];

	const override = env.CLAUDE_CODE_GIT_BASH_PATH;
	if (override) {
		candidates.push(override);
	}

	const pathValue = env.PATH ?? env.Path ?? "";
	for (const rawDir of pathValue.split(";")) {
		const dir = rawDir.trim();
		if (!dir || dir.toLowerCase().includes("\\windows\\system32")) {
			continue;
		}
		if (!lookup.exists(path.win32.join(dir, "git.exe"))) {
			continue;
		}
		// <...>\Git\cmd or <...>\Git\bin -> <...>\Git\bin\bash.exe; <...>\Git\mingw64\bin -> <...>\Git\bin\bash.exe
		candidates.push(path.win32.resolve(dir, "..", "bin", "bash.exe"));
		candidates.push(path.win32.resolve(dir, "..", "..", "bin", "bash.exe"));
	}

	if (env.ProgramFiles) {
		candidates.push(path.win32.join(env.ProgramFiles, "Git", "bin", "bash.exe"));
	}
	if (env.ProgramW6432) {
		candidates.push(path.win32.join(env.ProgramW6432, "Git", "bin", "bash.exe"));
	}
	if (env.LOCALAPPDATA) {
		candidates.push(path.win32.join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"));
	}

	return candidates;
}

/** Finds Git Bash on Windows; on other platforms returns /bin/bash. Null when Git Bash is not installed. */
export function findGitBash(lookup: GitBashLookup): string | null {
	if (lookup.platform !== "win32") {
		return "/bin/bash";
	}
	for (const candidate of gitBashCandidates(lookup)) {
		if (SYSTEM32_PATTERN.test(candidate)) {
			continue;
		}
		if (lookup.exists(candidate)) {
			return candidate;
		}
	}
	return null;
}

/** Git Bash of the running system, looked up on the real file system. */
export function resolveGitBash(): string | null {
	return findGitBash({ platform: process.platform, env: process.env, exists: fs.existsSync });
}
