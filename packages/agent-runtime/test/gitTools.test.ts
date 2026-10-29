import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { branchName, gitCreateMr, pkgRelative, selectTaskFiles } from "../src/git/gitCreateMr";
import { gitBranchStatus, gitSwitchBranch } from "../src/git/gitBranches";

describe("git tools", () => {
	let tmp: string;
	let remote: string;
	let pkg: string;
	let optionsFile: string;

	/** Runs git in the folder and returns stdout. */
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

	/** Writes a file under Pkg, creating parent folders. */
	const write = (rel: string, content: string): void => {
		const file = path.join(pkg, ...rel.split("/"));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	};

	beforeEach(() => {
		tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-tools-")));
		remote = path.join(tmp, "remote.git");
		optionsFile = path.join(tmp, "push-options.txt");
		execFileSync("git", ["init", "--bare", "-b", "develop", remote]);
		git(remote, "config", "receive.advertisePushOptions", "true");
		const hook = path.join(remote, "hooks", "pre-receive");
		fs.writeFileSync(
			hook,
			[
				"#!/bin/sh",
				`out="${optionsFile.replace(/\\/g, "/")}"`,
				': > "$out"',
				"i=0",
				'while [ $i -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do',
				'  eval "echo \\$GIT_PUSH_OPTION_$i" >> "$out"',
				"  i=$((i+1))",
				"done",
				'echo "View merge request: https://gitlab.test/group/project/-/merge_requests/7"',
				"",
			].join("\n"),
		);
		fs.chmodSync(hook, 0o755);
		pkg = path.join(tmp, "Pkg");
		fs.mkdirSync(pkg);
		git(pkg, "init", "-b", "develop");
		git(pkg, "config", "user.email", "test@example.com");
		git(pkg, "config", "user.name", "test");
		write("P1/Schemas/TestA/metadata.json", "{}");
		write("P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "<a/>");
		git(pkg, "add", "-A");
		git(pkg, "commit", "-m", "init");
		git(pkg, "remote", "add", "origin", remote);
		git(pkg, "push", "-u", "origin", "develop");
		git(pkg, "remote", "set-head", "origin", "develop");
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("branchName transliterates the title", () => {
		expect(branchName("PRJ-1", "Добавить поле «Статус»")).toBe("PRJ-1-dobavit-pole-status");
	});

	it("pkgRelative accepts stand-relative and Pkg-relative paths and rejects others", () => {
		expect(pkgRelative(pkg, "BPMSoft.Configuration/Pkg/P1/Schemas/TestA")).toBe(path.join("P1", "Schemas", "TestA"));
		expect(pkgRelative(pkg, "P1/Schemas/TestA")).toBe(path.join("P1", "Schemas", "TestA"));
		expect(pkgRelative(pkg, "../x")).toBeUndefined();
	});

	it("selectTaskFiles takes the schema folder and its resources", () => {
		const files = [
			path.join(pkg, "P1", "Schemas", "TestA", "metadata.json"),
			path.join(pkg, "P1", "Resources", "TestA.ClientUnit", "resource.ru-RU.xml"),
			path.join(pkg, "P1", "Resources", "TestAB.ClientUnit", "resource.ru-RU.xml"),
			path.join(pkg, "P1", "Schemas", "TestB", "metadata.json"),
		];
		expect(selectTaskFiles(pkg, files, [path.join("P1", "Schemas", "TestA")])).toEqual(files.slice(0, 2));
	});

	it("status: the target branch is fine", async () => {
		const result = await gitBranchStatus(pkg, { packages: ["P1"] });
		expect(result.text).toContain("текущая ветка: develop");
		expect(result.text).toContain("итог: ветка подходит");
	});

	it("status: a feature branch with its own commit, candidates with the issue key first", async () => {
		git(pkg, "switch", "-c", "PRJ-5-old");
		git(pkg, "push", "-u", "origin", "PRJ-5-old");
		git(pkg, "switch", "develop");
		git(pkg, "switch", "-c", "feature/x");
		write("P1/Schemas/TestA/metadata.json", '{"x":1}');
		git(pkg, "commit", "-am", "wip");
		const result = await gitBranchStatus(pkg, { packages: ["P1"], issueKey: "PRJ-5" });
		expect(result.text).toContain("1 коммит");
		expect(result.text).toContain("кандидаты на переключение: PRJ-5-old, develop");
		expect(result.text).toContain("спроси пользователя");
	});

	it("switch refuses with uncommitted changes and switches to a branch that exists only on origin", async () => {
		git(pkg, "switch", "-c", "release/1");
		git(pkg, "push", "-u", "origin", "release/1");
		git(pkg, "switch", "develop");
		git(pkg, "branch", "-D", "release/1");
		write("P1/Schemas/TestA/metadata.json", '{"dirty":1}');
		const refused = await gitSwitchBranch(pkg, "P1", "release/1");
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain("незакоммиченные");
		git(pkg, "checkout", "--", ".");
		const switched = await gitSwitchBranch(pkg, "P1", "release/1");
		expect(switched.isError).toBe(false);
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("release/1");
	});

	it("create MR commits only the task files and passes push options", async () => {
		write("P1/Schemas/TestA/metadata.json", '{"a":1}');
		write("P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "<b/>");
		write("P1/Schemas/Other/metadata.json", "{}");
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-7", title: "Поле статус", paths: ["P1/Schemas/TestA"], description: "AC-1: Дано форма\nAC-2: Когда" });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("MR: https://gitlab.test/group/project/-/merge_requests/7");
		expect(result.text).toContain("Файлы задачи остаются в рабочей копии");
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("PRJ-7-pole-status");
		const committed = git(pkg, "show", "--name-only", "--format=", "HEAD").trim().split("\n").sort();
		expect(committed).toEqual(["P1/Resources/TestA.ClientUnit/resource.ru-RU.xml", "P1/Schemas/TestA/metadata.json"]);
		expect(fs.existsSync(path.join(pkg, "P1", "Schemas", "TestA", "metadata.json"))).toBe(true);
		expect(git(pkg, "status", "--porcelain")).toContain("P1/Schemas/Other/");
		const options = fs.readFileSync(optionsFile, "utf8");
		expect(options).toContain("merge_request.create");
		expect(options).toContain("merge_request.target=develop");
		expect(options).toContain("merge_request.title=PRJ-7 Поле статус");
		expect(git(pkg, "log", "-1", "--format=%B")).toContain("AC-1: Дано форма");
	});

	it("create MR without push options support pushes the branch and says the MR is not created", async () => {
		git(remote, "config", "receive.advertisePushOptions", "false");
		fs.rmSync(path.join(remote, "hooks", "pre-receive"));
		write("P1/Schemas/TestA/metadata.json", '{"a":2}');
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-8", title: "x", paths: ["P1/Schemas/TestA"], description: "d" });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("ветка отправлена, MR не создан");
		expect(git(remote, "branch", "--list", "PRJ-8-x")).toContain("PRJ-8-x");
	});

	it("a failed push keeps the commit and a retry only pushes", async () => {
		git(pkg, "remote", "set-url", "origin", path.join(tmp, "missing.git"));
		write("P1/Schemas/TestA/metadata.json", '{"a":3}');
		const input = { issueKey: "PRJ-9", title: "retry", paths: ["P1/Schemas/TestA"], description: "d", target: "develop" };
		const failed = await gitCreateMr(pkg, input);
		expect(failed.isError).toBe(true);
		expect(failed.text).toContain("push не прошёл");
		git(pkg, "remote", "set-url", "origin", remote);
		const retried = await gitCreateMr(pkg, input);
		expect(retried.isError).toBe(false);
		expect(git(pkg, "rev-list", "--count", "develop..PRJ-9-retry").trim()).toBe("1");
	});

	it("create MR on a branch with the issue key commits to that branch", async () => {
		git(pkg, "switch", "-c", "PRJ-11-existing");
		write("P1/Schemas/TestA/metadata.json", '{"a":5}');
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-11", title: "другое название", paths: ["P1/Schemas/TestA"], description: "d" });
		expect(result.isError).toBe(false);
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("PRJ-11-existing");
		expect(git(pkg, "branch", "--list", "PRJ-11-drugoe*").trim()).toBe("");
		expect(git(remote, "rev-list", "--count", "develop..PRJ-11-existing").trim()).toBe("1");
	});

	it("a declined confirmation changes nothing", async () => {
		write("P1/Schemas/TestA/metadata.json", '{"a":4}');
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-10", title: "no", paths: ["P1/Schemas/TestA"], description: "d" }, async () => false);
		expect(result.isError).toBe(true);
		expect(git(pkg, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("develop");
	});

	it("status: a shared branch on origin is the MR target", async () => {
		git(pkg, "switch", "-c", "release/2");
		git(pkg, "push", "-u", "origin", "release/2");
		const result = await gitBranchStatus(pkg, { packages: ["P1"] });
		expect(result.text).toContain("MR пойдёт в: release/2");
		expect(result.text).toContain("итог: ветка подходит");
	});

	it("status: a branch behind its origin asks to update, and switch to the same branch fast-forwards it", async () => {
		git(pkg, "commit", "--allow-empty", "-m", "remote work");
		git(pkg, "push", "origin", "develop");
		git(pkg, "reset", "--hard", "HEAD~1");
		const status = await gitBranchStatus(pkg, { packages: ["P1"] });
		expect(status.text).toContain("отстаёт от origin/develop на 1");
		expect(status.text).toContain("предложи обновить");
		const updated = await gitSwitchBranch(pkg, "P1", "develop");
		expect(updated.isError).toBe(false);
		expect(git(pkg, "rev-parse", "HEAD").trim()).toBe(git(pkg, "rev-parse", "origin/develop").trim());
	});

	it("create MR from a shared branch targets it, remembers the target and puts warnings first", async () => {
		git(pkg, "switch", "-c", "release/3");
		git(pkg, "push", "-u", "origin", "release/3");
		git(pkg, "commit", "--allow-empty", "-m", "newer release work");
		git(pkg, "push", "origin", "release/3");
		git(pkg, "reset", "--hard", "HEAD~1");
		write("P1/Schemas/TestA/metadata.json", '{"a":6}');
		let card = "";
		const result = await gitCreateMr(pkg, { issueKey: "PRJ-12", title: "relz", paths: ["P1/Schemas/TestA"], description: "d" }, async (text) => {
			card = text;
			return true;
		});
		expect(result.isError).toBe(false);
		expect(fs.readFileSync(optionsFile, "utf8")).toContain("merge_request.target=release/3");
		expect(git(pkg, "config", "--get", "branch.PRJ-12-relz.bpmsoftMrTarget").trim()).toBe("release/3");
		expect(card.split("\n")[1]).toContain("ВНИМАНИЕ (Pkg): ветка отстаёт от release/3 на 1");
		const status = await gitBranchStatus(pkg, { packages: ["P1"] });
		expect(status.text).toContain("MR пойдёт в: release/3");
	});
});
