import { describe, it, expect } from "vitest";
import { appToolJsonSchema, appToolContent, type AppTool } from "../src/tools/appTool";

const tool: AppTool = {
	name: "crm_browser_text",
	description: "Текст страницы",
	params: {
		selector: { type: "string", description: "CSS-селектор", optional: true },
		timeout: { type: "number", description: "Таймаут, мс" },
		visible: { type: "boolean", description: "Только видимые" }
	},
	execute: async () => ({ text: "", isError: false })
};

describe("appToolJsonSchema", () => {
	it("describes an object with each parameter's type and description", () => {
		const schema = appToolJsonSchema(tool);
		expect(schema.type).toBe("object");
		expect(schema.properties).toEqual({
			selector: { type: "string", description: "CSS-селектор" },
			timeout: { type: "number", description: "Таймаут, мс" },
			visible: { type: "boolean", description: "Только видимые" }
		});
	});

	it("lists only non-optional parameters as required", () => {
		expect(appToolJsonSchema(tool).required).toEqual(["timeout", "visible"]);
	});

	it("has an empty required list when all parameters are optional", () => {
		const schema = appToolJsonSchema({ ...tool, params: { path: { type: "string", description: "Путь", optional: true } } });
		expect(schema.required).toEqual([]);
	});

	it("describes a string list as an array of strings", () => {
		const schema = appToolJsonSchema({ ...tool, params: { paths: { type: "string[]", description: "Пути" } } });
		expect(schema.properties).toEqual({ paths: { type: "array", items: { type: "string" }, description: "Пути" } });
	});
});

describe("appToolContent", () => {
	it("returns only a text block when there is no image", () => {
		expect(appToolContent({ text: "ok", isError: false })).toEqual([{ type: "text", text: "ok" }]);
	});

	it("appends the image block after the text when an image is present", () => {
		const content = appToolContent({ text: "снимок", isError: false, image: { data: "AAAA", mimeType: "image/png" } });
		expect(content).toEqual([
			{ type: "text", text: "снимок" },
			{ type: "image", data: "AAAA", mimeType: "image/png" }
		]);
	});
});
