import { z } from "zod";
import type { AppTool } from "./appTool";

/** Zod shape of an app tool's parameters (flat string, number or boolean values, or lists of strings). */
export function appToolZodShape(appTool: AppTool): Record<string, z.ZodType> {
	const shape: Record<string, z.ZodType> = {};
	for (const [name, param] of Object.entries(appTool.params)) {
		let schema: z.ZodType = param.type === "number" ? z.number() : param.type === "boolean" ? z.boolean() : param.type === "string[]" ? z.array(z.string()) : z.string();
		schema = schema.describe(param.description);
		shape[name] = param.optional ? schema.optional() : schema;
	}
	return shape;
}
