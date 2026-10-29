/** Message of an unknown thrown value. */
export function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
