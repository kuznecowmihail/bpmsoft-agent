import type { TokenUsage } from "@bpmsoft-agent/agent-runtime";
import type { CaseRun } from "./runner";

/** Formats a token count for humans: "453 тыс.", "1,2 млн". */
export function formatTokens(n: number): string {
	if (n < 1000) {
		return String(n);
	}
	if (n < 1_000_000) {
		return `${Math.round(n / 1000)} тыс.`;
	}
	return `${(n / 1_000_000).toFixed(1).replace(".", ",")} млн`;
}

/** Input / cache-read / output tokens of a run, as one table cell. */
function tokensCell(tokens: TokenUsage): string {
	return `${formatTokens(tokens.inputTokens)} / ${formatTokens(tokens.cacheReadTokens)} / ${formatTokens(tokens.outputTokens)}`;
}

/** Renders the markdown report of one eval session: a summary table, the failed runs and the notes of passed runs. */
export function renderReport(runs: CaseRun[]): string {
	const lines: string[] = [
		"# Прогон эвалов",
		"",
		"| кейс | провайдер | прогон | итог | ошибок CRM | ходов | токены (вход / кэш / выход) | $ | время, с |",
		"| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
	];
	for (const run of runs) {
		const cost = run.costReported ? run.costUsd.toFixed(2) : "—";
		lines.push(
			`| ${run.caseId} | ${run.provider} | ${run.run} | ${run.passed ? "✅" : "❌"} | ${run.failedCrmActions} | ${run.turns} | ${tokensCell(run.tokens)} | ${cost} | ${Math.round(run.durationMs / 1000)} |`,
		);
	}
	lines.push("");

	const failed = runs.filter((run) => !run.passed);
	const notes = runs.filter((run) => run.passed && run.error !== undefined);
	if (failed.length === 0 && notes.length === 0) {
		lines.push("Все кейсы прошли.");
		return lines.join("\n") + "\n";
	}
	if (failed.length === 0) {
		lines.push("Все кейсы прошли, есть замечания.", "");
	}
	if (failed.length > 0) {
		lines.push("## Не прошло", "");
		for (const run of failed) {
			lines.push(`### ${run.caseId} (${run.provider}, прогон ${run.run})`);
			for (const check of run.checks.filter((item) => !item.passed)) {
				lines.push(`- ${check.check.type}: ${check.detail}`);
			}
			if (run.error !== undefined) {
				lines.push(`- ошибка: ${run.error}`);
			}
			lines.push("");
		}
	}
	if (notes.length > 0) {
		lines.push("## Замечания", "");
		for (const run of notes) {
			lines.push(`### ${run.caseId} (${run.provider}, прогон ${run.run})`);
			lines.push(`- ${run.error}`);
			lines.push("");
		}
	}
	return lines.join("\n") + "\n";
}
