import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EVAL_GIT_BASE, gitOut, setupEvalGit } from "../src/evalGit";
import type { EvalGitRepo } from "../src/evalGit";
import { runChecks } from "../src/checks";
import type { CheckContext } from "../src/checks";

let packageDir: string;
let repo: EvalGitRepo | undefined;

beforeEach(() => {
	packageDir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-git-pkg-"));
	fs.writeFileSync(path.join(packageDir, "descriptor.json"), "{}", "utf8");
});

afterEach(() => {
	repo?.cleanup();
	repo = undefined;
	fs.rmSync(packageDir, { recursive: true, force: true });
});

describe("setupEvalGit", () => {
	it("makes the package a repository on develop with the case branch checked out", () => {
		repo = setupEvalGit(packageDir, { branch: "feature/x", remoteBranches: ["PRJ-1-a"] });

		expect(gitOut(packageDir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("feature/x");
		expect(gitOut(packageDir, ["rev-list", "--count", `origin/${EVAL_GIT_BASE}..HEAD`]).trim()).toBe("1");
		expect(gitOut(packageDir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).trim()).toBe("origin/develop");
	});

	it("pushes the remote branches to the remote only", () => {
		repo = setupEvalGit(packageDir, { branch: "feature/x", remoteBranches: ["PRJ-1-a"] });

		expect(gitOut(repo.remote, ["branch", "--list", "PRJ-1-a"])).toContain("PRJ-1-a");
		expect(gitOut(packageDir, ["branch", "--list", "PRJ-1-a"]).trim()).toBe("");
	});

	it("removes .git of the package and the remote folder on cleanup", () => {
		repo = setupEvalGit(packageDir, { branch: "feature/x" });
		const remote = repo.remote;

		repo.cleanup();
		repo = undefined;

		expect(fs.existsSync(path.join(packageDir, ".git"))).toBe(false);
		expect(fs.existsSync(remote)).toBe(false);
	});
});

describe("git_remote_branch check", () => {
	function contextFor(eval_: EvalGitRepo): CheckContext {
		return {
			packageDir,
			toolNames: [],
			lint: () => {
				throw new Error("no lint");
			},
			gitRemote: eval_.remote,
			gitPushOptionsFile: eval_.pushOptionsFile,
		};
	}

	it("passes for a pushed branch with the file and the push option, fails for another branch name", async () => {
		repo = setupEvalGit(packageDir, { branch: "feature/x" });
		const schemaDir = path.join(packageDir, "Schemas", "TestX");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(path.join(schemaDir, "descriptor.json"), "{}", "utf8");
		gitOut(packageDir, ["switch", "-c", "PRJ-1-b"]);
		gitOut(packageDir, ["add", "-A"]);
		gitOut(packageDir, ["commit", "-m", "eval: schema"]);
		gitOut(packageDir, ["push", "-o", "merge_request.create", "origin", "PRJ-1-b"]);

		const ctx = contextFor(repo);
		const passing = await runChecks(
			[{ type: "git_remote_branch", branch: "^PRJ-1-b$", file: "Schemas/TestX/", pushOption: "merge_request\\.create" }],
			ctx,
		);
		const failing = await runChecks([{ type: "git_remote_branch", branch: "^nope$" }], ctx);

		expect(passing[0].passed).toBe(true);
		expect(failing[0].passed).toBe(false);
	});
});
