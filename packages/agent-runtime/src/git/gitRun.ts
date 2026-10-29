import { execFile } from "child_process";

/** Result of one git call; code -1 when git could not be started or timed out. */
export interface GitOutput {
	code: number;
	stdout: string;
	stderr: string;
}

/** Timeout of a local git call. */
export const GIT_TIMEOUT_MS = 30000;
/** Timeout of git calls that go to the remote (fetch, push). */
export const GIT_REMOTE_TIMEOUT_MS = 120000;
/** Text for the user when git is not installed. */
export const GIT_MISSING = "git не найден: установите git — без него ветку и MR не сделать";

/** Runs git in a folder without a shell; never waits for a password prompt and never throws. */
export function runGit(cwd: string, args: string[], timeoutMs: number = GIT_TIMEOUT_MS): Promise<GitOutput> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["-C", cwd, ...args],
			{
				encoding: "utf8",
				timeout: timeoutMs,
				maxBuffer: 16 * 1024 * 1024,
				windowsHide: true,
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
			},
			(error, stdout, stderr) => {
				if (!error) {
					resolve({ code: 0, stdout, stderr });
					return;
				}
				const e = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
				if (e.code === "ENOENT") {
					resolve({ code: -1, stdout: "", stderr: GIT_MISSING });
					return;
				}
				if (e.killed) {
					resolve({ code: -1, stdout, stderr: `git не ответил за ${Math.round(timeoutMs / 1000)} с` });
					return;
				}
				resolve({ code: typeof e.code === "number" ? e.code : 1, stdout, stderr: stderr || e.message });
			},
		);
	});
}

/** True when git cannot be started. */
export async function gitMissing(cwd: string): Promise<boolean> {
	return (await runGit(cwd, ["--version"])).code === -1;
}

/** Last non-empty line of git output, for short error messages. */
export function lastLine(text: string): string {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
	return lines[lines.length - 1] ?? "";
}

/** Message of an unknown thrown value. */
export function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
