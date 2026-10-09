import Anthropic from "@anthropic-ai/sdk";

/** Reasoning effort accepted by the Claude Agent SDK (`Options.effort`). */
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** One entry of the Claude model picker: a model in its default effort, or one of its effort variants. */
export interface ClaudeModelOption {
	id: string;
	name: string;
	/** Absent for the model's default effort (the SDK default, "high"). */
	effort?: ClaudeEffort;
	recommended: boolean;
}

/** The subset of the Anthropic `GET /v1/models` item we use. */
export interface ClaudeModelListItem {
	id: string;
	display_name: string;
	created_at: string;
	capabilities?: {
		effort?: ({ supported: boolean } & Partial<Record<ClaudeEffort, { supported: boolean } | null>>) | null;
	} | null;
}

/** Curated models for long agentic BPMSoft tasks, in display order; matched against id and display name. */
const RECOMMENDED_CLAUDE_MODEL_PATTERNS: RegExp[] = [
	/fable[\s-]*5/i,
	/opus[\s-]*5[.-]5/i,
	/sonnet[\s-]*5[.-]5/i
];

/** Position in the recommended list, or -1. */
export function claudeRecommendationRank(text: string): number {
	return RECOMMENDED_CLAUDE_MODEL_PATTERNS.findIndex((pattern) => pattern.test(text));
}

const VARIANT_EFFORTS: Array<{ effort: ClaudeEffort; label: string }> = [
	{ effort: "low", label: "Low" },
	{ effort: "medium", label: "Medium" },
	{ effort: "xhigh", label: "XHigh" },
	{ effort: "max", label: "Max" }
];

/**
 * Expands the API model list into picker options: each model in its default effort plus
 * its supported effort variants. Recommended models come first (in curated order), the rest
 * sorted by created_at descending (newer first).
 */
export function expandClaudeModels(models: ClaudeModelListItem[]): ClaudeModelOption[] {
	const entries: Array<{ option: ClaudeModelOption; rank: number; createdAt: number; index: number }> = [];

	for (const model of models) {
		const idRank = claudeRecommendationRank(model.id);
		const nameRank = claudeRecommendationRank(model.display_name);
		// Use first rank >= 0; if both -1, rank is -1
		const rank = idRank >= 0 ? idRank : nameRank >= 0 ? nameRank : -1;
		const recommended = rank >= 0;
		const createdAt = model.created_at ? Date.parse(model.created_at) : 0;

		// Base option (default effort)
		entries.push({
			option: { id: model.id, name: model.display_name || model.id, recommended },
			rank,
			createdAt,
			index: entries.length
		});

		// Effort variants
		if (model.capabilities?.effort?.supported === true) {
			for (const variant of VARIANT_EFFORTS) {
				if (model.capabilities.effort[variant.effort]?.supported === true) {
					entries.push({
						option: {
							id: model.id,
							name: `${model.display_name || model.id} · ${variant.label}`,
							effort: variant.effort,
							recommended
						},
						rank,
						createdAt,
						index: entries.length
					});
				}
			}
		}
	}

	// Sort: recommended first by rank, then non-recommended by created_at descending
	entries.sort((a, b) => {
		const aRecommended = a.rank >= 0;
		const bRecommended = b.rank >= 0;
		if (aRecommended !== bRecommended) {
			return aRecommended ? -1 : 1;
		}
		if (aRecommended && bRecommended) {
			return a.rank - b.rank;
		}
		return b.createdAt - a.createdAt;
	});

	// Dedupe by id + effort
	const seenOptions = new Set<string>();
	const uniqueOptions = entries.filter((entry) => {
		const key = `${entry.option.id}|${entry.option.effort ?? ""}`;
		if (seenOptions.has(key)) {
			return false;
		}
		seenOptions.add(key);
		return true;
	});

	return uniqueOptions.map((entry) => entry.option);
}

/** Lists models available to the Anthropic API key (for the model picker). */
export async function listClaudeModels(apiKey: string): Promise<ClaudeModelOption[]> {
	try {
		const client = new Anthropic({ apiKey });
		const items: ClaudeModelListItem[] = [];
		for await (const model of client.models.list({ limit: 100 })) {
			items.push(model as unknown as ClaudeModelListItem);
		}
		return expandClaudeModels(items);
	} catch (error) {
		throw new Error(`Не удалось получить список моделей Claude: ${(error as Error).message}`);
	}
}
