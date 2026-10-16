import { describe, it, expect } from "vitest";
import { chooseAnswer, parseChoices } from "../src/answers";

describe("parseChoices", () => {
	it("parses two questions with recommended and multi-select options", () => {
		const message = [
			"Уточню детали.",
			"<choices>",
			"? Нужна ли колонка?",
			"- Нет",
			"* Да",
			"?* Какие поля вывести?",
			"* Название",
			"- Описание",
			"* Код",
			"</choices>",
		].join("\n");

		expect(parseChoices(message)).toEqual([
			{ text: "Нужна ли колонка?", multi: false, options: ["Нет", "Да"], recommended: ["Да"] },
			{ text: "Какие поля вывести?", multi: true, options: ["Название", "Описание", "Код"], recommended: ["Название", "Код"] },
		]);
	});

	it("uses only the last choices block", () => {
		const message = "<choices>\n? Старый\n- A\n</choices>\ntext\n<choices>\n? Новый\n- B\n</choices>";

		expect(parseChoices(message)).toEqual([{ text: "Новый", multi: false, options: ["B"], recommended: [] }]);
	});

	it("returns [] without a block", () => {
		expect(parseChoices("Какой пакет?")).toEqual([]);
	});
});

describe("chooseAnswer", () => {
	it("takes the recommended option of a single question", () => {
		const message = "<choices>\n? Режим\n- Быстрый\n* Полный\n</choices>";

		expect(chooseAnswer(message, [])).toBe("Полный");
	});

	it("falls back to the first option without a recommendation", () => {
		expect(chooseAnswer("<choices>\n? Режим\n- Быстрый\n- Полный\n</choices>", [])).toBe("Быстрый");
	});

	it("uses a rule over the recommendation", () => {
		const message = "<choices>\n? В каком пакете делать?\n- P1\n* P3\n</choices>";

		expect(chooseAnswer(message, [{ when: "пакет", text: "P2" }])).toBe("P2");
	});

	it("matches rules case-insensitively", () => {
		expect(chooseAnswer("<choices>\n? В КАКОМ ПАКЕТЕ?\n- P1\n</choices>", [{ when: "пакет", text: "P2" }])).toBe("P2");
	});

	it("joins several questions into numbered lines", () => {
		const message = "<choices>\n? Нужна ли колонка?\n* Да\n- Нет\n?* Какие поля вывести?\n* Название\n* Код\n</choices>";

		expect(chooseAnswer(message, [])).toBe("1. Нужна ли колонка? — Да\n2. Какие поля вывести? — Название, Код");
	});

	it("returns undefined for a question without options and without a rule", () => {
		expect(chooseAnswer("<choices>\n? Введите код\n</choices>", [])).toBeUndefined();
	});

	it("uses a rule for a question without options", () => {
		expect(chooseAnswer("<choices>\n? Введите код\n</choices>", [{ when: "код", text: "X1" }])).toBe("X1");
	});

	it("matches a question without choices by a rule in the last 500 chars", () => {
		expect(chooseAnswer("Какой пакет?", [{ when: "пакет", text: "P2" }])).toBe("P2");
	});

	it("returns undefined without choices and without a matching rule", () => {
		expect(chooseAnswer("Какой пакет?", [])).toBeUndefined();
	});

	describe("package rule with a word-form pattern", () => {
		const rules = [{ when: "в как\\S* пакет", text: "P2" }];

		it("matches the masculine locative question", () => {
			expect(chooseAnswer("<choices>\n? В каком пакете делать изменения?\n- P1\n</choices>", rules)).toBe("P2");
		});

		it("matches the feminine accusative question", () => {
			expect(chooseAnswer("<choices>\n? В какой пакет вносить изменения?\n- P1\n</choices>", rules)).toBe("P2");
		});

		it("does not match an unrelated question and falls back to the recommendation", () => {
			const message = "<choices>\n? Что сделать с лишней записью «Телефон» вне пакета?\n* Оставить как есть\n- Удалить\n</choices>";

			expect(chooseAnswer(message, rules)).toBe("Оставить как есть");
		});
	});
});
