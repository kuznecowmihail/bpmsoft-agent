import * as fs from "fs";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses KEY=VALUE lines: skips blank lines and # comments, strips BOM, handles CRLF, optional "export " prefix, and matching single/double quotes around the value. */
export function parseEnv(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	const withoutBom = text.replace(/^\uFEFF/, "");
	for (const rawLine of withoutBom.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) {
			continue;
		}
		const withoutExport = line.replace(/^export\s+/, "");
		const eq = withoutExport.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = withoutExport.slice(0, eq).trim();
		if (!KEY_PATTERN.test(key)) {
			continue;
		}
		let value = withoutExport.slice(eq + 1).trim();
		const first = value.charAt(0);
		if (value.length >= 2 && (first === '"' || first === "'") && value.charAt(value.length - 1) === first) {
			value = value.slice(1, -1);
		}
		result[key] = value;
	}
	return result;
}

/** Loads the file into process.env without overriding variables already set; returns the names loaded (not values). Missing file → []. */
export function loadEnvFile(file: string, env: NodeJS.ProcessEnv = process.env): string[] {
	if (!fs.existsSync(file)) {
		return [];
	}
	const parsed = parseEnv(fs.readFileSync(file, "utf8"));
	const loaded: string[] = [];
	for (const [key, value] of Object.entries(parsed)) {
		if (env[key] === undefined) {
			env[key] = value;
			loaded.push(key);
		}
	}
	return loaded;
}
