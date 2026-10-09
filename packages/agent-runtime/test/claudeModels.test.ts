import { describe, it, expect } from "vitest";
import { expandClaudeModels, claudeRecommendationRank } from "../src/provider/claudeModels";
import type { ClaudeModelListItem } from "../src/provider/claudeModels";

describe("claudeModels", () => {
	describe("claudeRecommendationRank", () => {
		it("returns 0 for fable-5", () => {
			expect(claudeRecommendationRank("claude-fable-5-1")).toBe(0);
			expect(claudeRecommendationRank("Claude Fable 5")).toBe(0);
		});

		it("returns 1 for opus-5.5", () => {
			expect(claudeRecommendationRank("claude-opus-5-5")).toBe(1);
			expect(claudeRecommendationRank("Claude Opus 5.5")).toBe(1);
		});

		it("returns 2 for sonnet-5.5", () => {
			expect(claudeRecommendationRank("claude-sonnet-5-5")).toBe(2);
			expect(claudeRecommendationRank("Claude Sonnet 5.5")).toBe(2);
		});

		it("returns -1 for non-recommended model", () => {
			expect(claudeRecommendationRank("claude-haiku-4-5")).toBe(-1);
			expect(claudeRecommendationRank("claude-haiku-4-5-20251001")).toBe(-1);
		});
	});

	describe("expandClaudeModels", () => {
		it("puts recommended models first in curated order (fable, opus, sonnet)", () => {
			const input: ClaudeModelListItem[] = [
				{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2024-01-01T00:00:00Z" },
				{ id: "claude-fable-5-1", display_name: "Claude Fable 5", created_at: "2024-02-01T00:00:00Z" },
				{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2024-03-01T00:00:00Z" }
			];
			const result = expandClaudeModels(input);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ id: "claude-fable-5-1", name: "Claude Fable 5", recommended: true });
			expect(result[1]).toEqual({ id: "claude-opus-5-5", name: "Claude Opus 5.5", recommended: true });
			expect(result[2]).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", recommended: true });
		});

		it("puts non-recommended models after recommended ones, sorted by created_at descending", () => {
			const input: ClaudeModelListItem[] = [
				{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2024-01-01T00:00:00Z" },
				{ id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", created_at: "2024-02-15T00:00:00Z" },
				{ id: "claude-haiku-3-5-20240620", display_name: "Claude Haiku 3.5", created_at: "2024-02-01T00:00:00Z" }
			];
			const result = expandClaudeModels(input);
			expect(result).toHaveLength(3);
			// First: recommended (sonnet)
			expect(result[0].recommended).toBe(true);
			// Then: non-recommended sorted by created_at descending (newer first)
			expect(result[1]).toEqual({ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", recommended: false });
			expect(result[2]).toEqual({ id: "claude-haiku-3-5-20240620", name: "Claude Haiku 3.5", recommended: false });
		});

		it("creates effort variants when capabilities.effort.supported is true", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-sonnet-5-5",
					display_name: "Claude Sonnet 5.5",
					created_at: "2024-01-01T00:00:00Z",
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true },
							medium: { supported: true },
							high: { supported: true },
							xhigh: { supported: false },
							max: { supported: true }
						}
					}
				}
			];
			const result = expandClaudeModels(input);
			// Base + Low + Medium + Max (no High variant, no XHigh) = 4 total
			expect(result).toHaveLength(4);
			expect(result[0]).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", recommended: true });
			expect(result[1]).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 · Low", effort: "low", recommended: true });
			expect(result[2]).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 · Medium", effort: "medium", recommended: true });
			expect(result[3]).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 · Max", effort: "max", recommended: true });
		});

		it("produces only base option when capabilities is null", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-haiku-4-5",
					display_name: "Claude Haiku 4.5",
					created_at: "2024-01-01T00:00:00Z",
					capabilities: null
				}
			];
			const result = expandClaudeModels(input);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", recommended: false });
		});

		it("produces only base option when capabilities is undefined", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-haiku-4-5",
					display_name: "Claude Haiku 4.5",
					created_at: "2024-01-01T00:00:00Z"
				}
			];
			const result = expandClaudeModels(input);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", recommended: false });
		});

		it("deduplicates by id and effort, keeping first occurrence", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-sonnet-5-5",
					display_name: "Claude Sonnet 5.5",
					created_at: "2024-01-01T00:00:00Z",
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true }
						}
					}
				},
				{
					id: "claude-sonnet-5-5",
					display_name: "Claude Sonnet 5.5 (Duplicate)",
					created_at: "2024-01-02T00:00:00Z",
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true }
						}
					}
				}
			];
			const result = expandClaudeModels(input);
			// Should dedupe: base + low from first model only
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Claude Sonnet 5.5");
			expect(result[1].name).toBe("Claude Sonnet 5.5 · Low");
		});

		it("uses display_name when available, falls back to id", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-sonnet-5-5",
					display_name: "Claude Sonnet 5.5",
					created_at: "2024-01-01T00:00:00Z"
				},
				{
					id: "claude-haiku-4-5-20251001",
					display_name: "",
					created_at: "2024-01-01T00:00:00Z"
				}
			];
			const result = expandClaudeModels(input);
			expect(result[0].name).toBe("Claude Sonnet 5.5");
			expect(result[1].name).toBe("claude-haiku-4-5-20251001");
		});

		it("handles models with only some effort variants supported", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-test",
					display_name: "Claude Test",
					created_at: "2024-01-01T00:00:00Z",
					capabilities: {
						effort: {
							supported: true,
							low: null,
							medium: { supported: false },
							xhigh: { supported: true },
							max: null
						}
					}
				}
			];
			const result = expandClaudeModels(input);
			// Base + XHigh = 2
			expect(result).toHaveLength(2);
			expect(result[1].effort).toBe("xhigh");
		});

		it("sorts recommended models by rank and non-recommended by date", () => {
			const input: ClaudeModelListItem[] = [
				// Non-recommended, older
				{ id: "claude-haiku-3", display_name: "Haiku 3", created_at: "2024-01-01T00:00:00Z" },
				// Recommended (sonnet = rank 2)
				{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2024-01-02T00:00:00Z" },
				// Non-recommended, newer
				{ id: "claude-haiku-4-5", display_name: "Haiku 4.5", created_at: "2024-01-03T00:00:00Z" },
				// Recommended (opus = rank 1)
				{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2024-01-04T00:00:00Z" }
			];
			const result = expandClaudeModels(input);
			// Expected order: opus (rank 1), sonnet (rank 2), then haiku-4-5 (newer), then haiku-3
			expect(result[0].id).toBe("claude-opus-5-5");
			expect(result[1].id).toBe("claude-sonnet-5-5");
			expect(result[2].id).toBe("claude-haiku-4-5");
			expect(result[3].id).toBe("claude-haiku-3");
		});

		it("handles empty input", () => {
			const result = expandClaudeModels([]);
			expect(result).toHaveLength(0);
		});

		it("does not include high as a variant (it is the SDK default)", () => {
			const input: ClaudeModelListItem[] = [
				{
					id: "claude-sonnet-5-5",
					display_name: "Claude Sonnet 5.5",
					created_at: "2024-01-01T00:00:00Z",
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true },
							high: { supported: true },
							max: { supported: true }
						}
					}
				}
			];
			const result = expandClaudeModels(input);
			// Base + Low + Max (no High variant) = 3
			expect(result).toHaveLength(3);
			const efforts = result.map((opt) => opt.effort);
			expect(efforts).not.toContain("high");
		});
	});
});
