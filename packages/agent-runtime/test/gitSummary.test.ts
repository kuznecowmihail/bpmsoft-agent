import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pkgGitSummary } from "../src/git/gitSummary";

describe("pkgGitSummary", () => {
	let tmp: string;
	let pkg: string;

	/** Runs git in the folder with a test identity; returns stdout. */
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync("git", ["-C", cwd, "-c", "user.email=test@example.com", "-c", "user.name=test", ...args], {
			encoding: "utf8",
		});

	/** Writes a file under the given folder, creating parent folders. */
	const write = (base: string, rel: string, content: string): string => {
		const file = path.join(base, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-summary-")));
		pkg = path.join(tmp, "Pkg");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("Pkg is a repository: branch, target, ahead and changed files", async () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		git(pkg, "init");
		git(pkg, "checkout", "-b", "main");
		git(pkg, "add", "-A");
		git(pkg, "commit", "-m", "init");
		const remote = path.join(tmp, "remote.git");
		git(tmp, "init", "--bare", remote);
		git(pkg, "remote", "add", "origin", remote);
		git(pkg, "push", "-u", "origin", "main");
		write(pkg, "P1/Schemas/TestA/metadata.json", '{"a": 1}');
		git(pkg, "add", "-A");
		git(pkg, "commit", "-m", "local change");
		write(pkg, "P1/Schemas/TestB/metadata.json", "{}");

		const summary = await pkgGitSummary(pkg);
		expect(summary.gitMissing).toBeUndefined();
		expect(summary.withoutGit).toEqual([]);
		expect(summary.repos).toHaveLength(1);
		const [repo] = summary.repos;
		expect(repo.label).toBe("Pkg");
		expect(repo.dir).toBe(path.resolve(pkg));
		expect(repo.branch).toBe("main");
		expect(repo.target).toBe("main");
		expect(repo.ahead).toBe(1);
		expect(repo.behind).toBe(0);
		expect(repo.changed).toBe(1);
	});

	it("each package is its own repository when Pkg is not in git", async () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		write(pkg, "P2/Schemas/TestB/metadata.json", "{}");
		write(pkg, "P3/Schemas/TestC/metadata.json", "{}");
		git(path.join(pkg, "P1"), "init");
		git(path.join(pkg, "P1"), "checkout", "-b", "feature-x");
		git(path.join(pkg, "P1"), "add", "-A");
		git(path.join(pkg, "P1"), "commit", "-m", "init");
		git(path.join(pkg, "P2"), "init");
		git(path.join(pkg, "P2"), "checkout", "-b", "main");
		git(path.join(pkg, "P2"), "add", "-A");
		git(path.join(pkg, "P2"), "commit", "-m", "init");

		const summary = await pkgGitSummary(pkg);
		expect(summary.withoutGit).toEqual(["P3"]);
		expect(summary.repos.map((repo) => repo.label)).toEqual(["P1", "P2"]);
		const [p1, p2] = summary.repos;
		expect(p1.branch).toBe("feature-x");
		expect(p2.branch).toBe("main");
		for (const repo of [p1, p2]) {
			expect(repo.target).toBeUndefined();
			expect(repo.ahead).toBe(0);
			expect(repo.behind).toBe(0);
		}
	});

	it("nothing in git: no repositories, every package is without git", async () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		write(pkg, "P2/Schemas/TestB/metadata.json", "{}");

		const summary = await pkgGitSummary(pkg);
		expect(summary.repos).toEqual([]);
		expect(summary.withoutGit).toEqual(["P1", "P2"]);
	});
});
