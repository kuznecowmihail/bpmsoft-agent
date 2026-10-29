import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findPkgGitRepos } from "../src/lint/pkgGitRepos";

describe("findPkgGitRepos", () => {
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
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-git-repos-")));
		pkg = path.join(tmp, "Pkg");
		fs.mkdirSync(pkg, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("Pkg is a repository: one repository for all packages", () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		write(pkg, "P2/Schemas/TestC/descriptor.json", "{}");
		git(pkg, "init");
		git(pkg, "add", "-A");
		git(pkg, "commit", "-m", "init");
		write(pkg, "P1/Schemas/TestA/metadata.json", '{"a": 1}');
		write(pkg, "P2/Schemas/TestB/descriptor.json", "{}");

		const layout = findPkgGitRepos(pkg);
		expect(layout.withoutGit).toEqual([]);
		expect(layout.repos).toHaveLength(1);
		const [repo] = layout.repos;
		expect(repo.root).toBe(fs.realpathSync(pkg));
		expect(repo.dir).toBe(path.resolve(pkg));
		expect(repo.packages).toEqual(["P1", "P2"]);
		expect(repo.files).toContain(path.join(pkg, "P1", "Schemas", "TestA", "metadata.json"));
		expect(repo.files).toContain(path.join(pkg, "P2", "Schemas", "TestB", "descriptor.json"));
	});

	it("each package is its own repository when Pkg is not in git", () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		write(pkg, "P2/Schemas/TestC/metadata.json", "{}");
		write(pkg, "P3/Schemas/TestD/metadata.json", "{}");
		for (const name of ["P1", "P2"]) {
			git(path.join(pkg, name), "init");
			git(path.join(pkg, name), "add", "-A");
			git(path.join(pkg, name), "commit", "-m", "init");
		}
		write(pkg, "P1/Schemas/TestA/metadata.json", '{"a": 1}');

		const layout = findPkgGitRepos(pkg);
		expect(layout.repos).toHaveLength(2);
		expect(layout.withoutGit).toEqual(["P3"]);
		const p1 = layout.repos.find((repo) => repo.dir === path.join(pkg, "P1"));
		const p2 = layout.repos.find((repo) => repo.dir === path.join(pkg, "P2"));
		expect(p1).toBeDefined();
		expect(p1?.root).toBe(fs.realpathSync(path.join(pkg, "P1")));
		expect(p1?.packages).toEqual(["P1"]);
		expect(p1?.files).toHaveLength(1);
		expect(p2).toBeDefined();
		expect(p2?.files).toEqual([]);
		expect(p2?.packages).toEqual([]);
	});

	it("mixed: a package with its own .git is left out of the outer repository", () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		git(pkg, "init");
		git(pkg, "add", "P1");
		git(pkg, "commit", "-m", "init");
		write(pkg, "P2/Schemas/TestB/metadata.json", "{}");
		git(path.join(pkg, "P2"), "init");
		git(path.join(pkg, "P2"), "add", "-A");
		git(path.join(pkg, "P2"), "commit", "-m", "init");
		write(pkg, "P1/Schemas/TestA/metadata.json", '{"a": 1}');
		write(pkg, "P2/Schemas/TestB/metadata.json", '{"a": 1}');

		const layout = findPkgGitRepos(pkg);
		expect(layout.withoutGit).toEqual([]);
		const outer = layout.repos.find((repo) => repo.dir === path.resolve(pkg));
		const inner = layout.repos.find((repo) => repo.dir === path.join(pkg, "P2"));
		expect(outer).toBeDefined();
		expect(outer?.files).toEqual([path.join(pkg, "P1", "Schemas", "TestA", "metadata.json")]);
		expect(outer?.packages).toEqual(["P1"]);
		expect(outer?.files.some((file) => file.startsWith(path.join(pkg, "P2") + path.sep))).toBe(false);
		expect(inner).toBeDefined();
		expect(inner?.files).toEqual([path.join(pkg, "P2", "Schemas", "TestB", "metadata.json")]);
		expect(inner?.packages).toEqual(["P2"]);
	});

	it("nothing in git: no repositories, every package is without git", () => {
		write(pkg, "P1/Schemas/TestA/metadata.json", "{}");
		write(pkg, "P2/Schemas/TestB/metadata.json", "{}");

		const layout = findPkgGitRepos(pkg);
		expect(layout.repos).toEqual([]);
		expect(layout.withoutGit).toEqual(["P1", "P2"]);
	});
});
