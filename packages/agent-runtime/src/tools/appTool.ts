/** Parameter of an app tool: a flat JSON value. */
export interface AppToolParam { type: "string" | "number" | "boolean"; description: string; optional?: boolean }
export interface AppToolImage { data: string; mimeType: string }   // base64
export interface AppToolResult { text: string; isError: boolean; image?: AppToolImage }
/** A tool implemented by the host app (e.g. the built-in CRM browser), offered to both providers. */
export interface AppTool { name: string; description: string; params: Record<string, AppToolParam>; execute(args: Record<string, unknown>): Promise<AppToolResult> }

/** JSON Schema of the parameters (for Cursor custom tools). */
export function appToolJsonSchema(tool: AppTool): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const [name, param] of Object.entries(tool.params)) {
		properties[name] = { type: param.type, description: param.description };
		if (!param.optional) {
			required.push(name);
		}
	}
	return { type: "object", properties, required };
}

/** MCP-style content blocks of a result: text first, then the image if any. */
export function appToolContent(result: AppToolResult): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
	const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [{ type: "text", text: result.text }];
	if (result.image) {
		content.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
	}
	return content;
}
