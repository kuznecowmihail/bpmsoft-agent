import { describe, it, expect } from "vitest";
import { FixLoop, errorSignature, schemaNameFromFile } from "../src/crm/fixLoop";

describe("FixLoop", () => {
	it("sets the checkpoint on the fifth failure of a turn", () => {
		const loop = new FixLoop();
		const notes = [1, 2, 3, 4].map((i) => loop.failure({ signature: `error ${i}`, schemaNames: [] }));

		expect(notes[3].text).not.toContain("Достигнута контрольная точка");
		expect(loop.blocked()).toBeUndefined();

		const fifth = loop.failure({ signature: "error 5", schemaNames: [] });
		expect(fifth.text).toContain("Достигнута контрольная точка");
		expect(loop.blocked()).toBeDefined();
	});

	it("ignores line positions when comparing errors", () => {
		expect(errorSignature("A.cs(10,5): CS0029 x")).toBe(errorSignature("A.cs(12,5): CS0029 x"));
	});

	it("advises a different approach on the second identical failure and checkpoints on the third", () => {
		const loop = new FixLoop();
		const first = loop.failure({ signature: "same", schemaNames: [] });
		expect(first.text).not.toContain("Смени подход");

		const second = loop.failure({ signature: "same", schemaNames: [] });
		expect(second.text).toContain("Смени подход");

		const third = loop.failure({ signature: "same", schemaNames: [] });
		expect(third.text).toContain("Достигнута контрольная точка");
		expect(third.attempt).toBe(3);
	});

	it("restarts the count after a successful compile", () => {
		const loop = new FixLoop();
		for (let i = 1; i <= 4; i++) {
			loop.failure({ signature: `error ${i}`, schemaNames: [] });
		}
		loop.success("compile");
		expect(loop.failure({ signature: "error 5", schemaNames: [] }).attempt).toBe(1);
	});

	it("keeps the count after a successful update", () => {
		const loop = new FixLoop();
		for (let i = 1; i <= 4; i++) {
			loop.failure({ signature: `error ${i}`, schemaNames: [] });
		}
		loop.success("update");
		const fifth = loop.failure({ signature: "error 5", schemaNames: [] });
		expect(fifth.attempt).toBe(5);
		expect(fifth.text).toContain("Достигнута контрольная точка");
	});

	it("notices schemas outside the chat's own schemas", () => {
		const loop = new FixLoop({ ownSchemas: () => new Set(["TestOwn"]) });
		const note = loop.failure({ signature: "x", schemaNames: ["TestOwn", "TestForeign"] });
		expect(note.foreignSchemas).toEqual(["TestForeign"]);
		expect(note.text).toContain("Исправить ошибку в TestForeign?");
	});

	it("allows fixing a foreign schema when the user already asked for it", () => {
		const loop = new FixLoop({ ownSchemas: () => new Set() });
		const note = loop.failure({ signature: "x", schemaNames: ["TestA"] });
		expect(note.foreignSchemas).toEqual(["TestA"]);
		expect(note.text).toContain("Если пользователь в этом чате уже просил исправить");
	});

	it("takes the schema name from a Windows or POSIX path", () => {
		expect(schemaNameFromFile("C:\\app\\Pkg\\P\\Schemas\\TestHelper\\TestHelper.cs")).toBe("TestHelper");
		expect(schemaNameFromFile("/app/Pkg/TestHelper.cs")).toBe("TestHelper");
		expect(schemaNameFromFile("")).toBe("");
	});
});
