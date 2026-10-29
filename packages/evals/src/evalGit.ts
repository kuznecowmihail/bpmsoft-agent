import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

/** Base branch of the eval repository and of its remote. */
export const EVAL_GIT_BASE = "develop";
/** MR link the fake remote prints on push, like GitLab does. */
export const EVAL_MR_URL = "https://gitlab.eval.test/eval/project/-/merge_requests/1";

/** Git state of a case: the agent starts on `branch`; `remoteBranches` exist only on the remote. */
export interface EvalGitSetup {
	branch: string;
	remoteBranches?: string[];
}

/** Repository made for a case: the bare remote, the file with the last push options, and cleanup. */
export interface EvalGitRepo {
	remote: string;
	pushOptionsFile: string;
	cleanup(): void;
}

/** Runs git in a folder without a shell; returns stdout. */
export function gitOut(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Makes the package its own git repository with a temporary bare remote (push options, MR link) and checks out `setup.branch`. */
export function setupEvalGit(packageDir: string, setup: EvalGitSetup): EvalGitRepo {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bpmsoft-eval-git-"));
	const remote = path.join(tmp, "remote.git");
	const pushOptionsFile = path.join(tmp, "push-options.txt");
	fs.rmSync(path.join(packageDir, ".git"), { recursive: true, force: true });
	execFileSync("git", ["init", "--bare", "-b", EVAL_GIT_BASE, remote], { stdio: "ignore" });
	gitOut(remote, ["config", "receive.advertisePushOptions", "true"]);
	const hook = path.join(remote, "hooks", "pre-receive");
	fs.writeFileSync(
		hook,
		[
			"#!/bin/sh",
			`out="${pushOptionsFile.replace(/\\/g, "/")}"`,
			': > "$out"',
			"i=0",
			'while [ $i -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do',
			'  eval "echo \\$GIT_PUSH_OPTION_$i" >> "$out"',
			"  i=$((i+1))",
			"done",
			`echo "View merge request: ${EVAL_MR_URL}"`,
			"",
		].join("\n"),
	);
	fs.chmodSync(hook, 0o755);
	gitOut(packageDir, ["init", "-b", EVAL_GIT_BASE]);
	gitOut(packageDir, ["config", "user.email", "eval@example.com"]);
	gitOut(packageDir, ["config", "user.name", "bpmsoft eval"]);
	gitOut(packageDir, ["add", "-A"]);
	gitOut(packageDir, ["commit", "--allow-empty", "-m", "eval: base"]);
	gitOut(packageDir, ["remote", "add", "origin", remote]);
	gitOut(packageDir, ["push", "-u", "origin", EVAL_GIT_BASE]);
	gitOut(packageDir, ["remote", "set-head", "origin", EVAL_GIT_BASE]);
	for (const name of setup.remoteBranches ?? []) {
		gitOut(packageDir, ["branch", name]);
		gitOut(packageDir, ["push", "origin", name]);
		gitOut(packageDir, ["branch", "-D", name]);
	}
	gitOut(packageDir, ["switch", "-c", setup.branch]);
	gitOut(packageDir, ["commit", "--allow-empty", "-m", "eval: чужая правка"]);
	return {
		remote,
		pushOptionsFile,
		cleanup: () => {
			fs.rmSync(path.join(packageDir, ".git"), { recursive: true, force: true });
			fs.rmSync(tmp, { recursive: true, force: true });
		},
	};
}
