/** Untyped access to a property of a JSON value. */
export function field(obj: unknown, key: string): unknown {
	return obj !== null && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Non-empty text of a string or number; otherwise undefined. */
export function textOf(value: unknown): string | undefined {
	if (typeof value === "string") {
		return value.trim() === "" ? undefined : value;
	}
	return typeof value === "number" ? String(value) : undefined;
}
