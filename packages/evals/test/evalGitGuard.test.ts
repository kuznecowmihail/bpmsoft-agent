import { describe, it, expect } from "vitest";
import { gitConfirmRepos, isEvalPackageOnly } from "../src/evalGitGuard";

describe("gitConfirmRepos", () => {
	it("reads repository labels of create-MR and switch-branch texts", () => {
		const create = "Создать ветку и MR: PRJ-1 title\n\nРепозиторий: EvalPackage\nВетка: x";
		const switched = "Переключить ветку git в Pkg: main → develop\nФайлы Pkg изменятся";
		expect(gitConfirmRepos(create)).toEqual(["EvalPackage"]);
		expect(gitConfirmRepos(switched)).toEqual(["Pkg"]);
	});

	it("returns an empty list when no repository line is present", () => {
		expect(gitConfirmRepos("Описание MR:\nтекст")).toEqual([]);
	});
});

describe("isEvalPackageOnly", () => {
	it("approves a create-MR text that names only the eval package", () => {
		expect(isEvalPackageOnly("Создать ветку и MR: PRJ-1 x\n\nРепозиторий: EvalPackage\nВетка: a", "EvalPackage")).toBe(true);
	});

	it("refuses a create-MR text that also names another repository", () => {
		const text = "Создать ветку и MR: PRJ-1 x\n\nРепозиторий: EvalPackage\nВетка: a\n\nРепозиторий: Pkg\nВетка: b";
		expect(isEvalPackageOnly(text, "EvalPackage")).toBe(false);
	});

	it("approves a switch-branch text in the eval package and refuses another package", () => {
		const own = "Переключить ветку git в EvalPackage: feature/x → develop\nФайлы Pkg изменятся";
		const other = "Переключить ветку git в Pkg: feature/x → develop\nФайлы Pkg изменятся";
		expect(isEvalPackageOnly(own, "EvalPackage")).toBe(true);
		expect(isEvalPackageOnly(other, "EvalPackage")).toBe(false);
	});

	it("approves a fast-forward text in the eval package and refuses another package", () => {
		const own = "Обновить ветку git в EvalPackage: develop ← origin/develop, 1 коммит(ов)\nФайлы Pkg изменятся";
		const other = "Обновить ветку git в Pkg: develop ← origin/develop, 1 коммит(ов)\nФайлы Pkg изменятся";
		expect(isEvalPackageOnly(own, "EvalPackage")).toBe(true);
		expect(isEvalPackageOnly(other, "EvalPackage")).toBe(false);
	});

	it("refuses a text without repository lines", () => {
		expect(isEvalPackageOnly("Что-то другое", "EvalPackage")).toBe(false);
	});
});
