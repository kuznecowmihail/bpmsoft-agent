import type { EvalAnswerRule } from "./caseFile";

export interface ChoiceQuestion { text: string; multi: boolean; options: string[]; recommended: string[] }

const CHOICES_OPEN = "<choices>";
const CHOICES_CLOSE = "</choices>";

/** Parses the LAST <choices>…</choices> block; [] when none. A missing closing tag runs to the end of the message. */
export function parseChoices(message: string): ChoiceQuestion[] {
	const open = message.lastIndexOf(CHOICES_OPEN);
	if (open === -1) {
		return [];
	}
	const start = open + CHOICES_OPEN.length;
	const close = message.indexOf(CHOICES_CLOSE, start);
	const body = message.slice(start, close === -1 ? undefined : close);
	const questions: ChoiceQuestion[] = [];
	for (const raw of body.split(/\r?\n/)) {
		const line = raw.trim();
		const question = /^\?(\*?)\s+(.+)$/.exec(line);
		if (question) {
			questions.push({ text: question[2].trim(), multi: question[1] === "*", options: [], recommended: [] });
			continue;
		}
		const option = /^([-*])\s+(.+)$/.exec(line);
		const current = questions[questions.length - 1];
		if (option && current) {
			const text = option[2].trim();
			current.options.push(text);
			if (option[1] === "*") {
				current.recommended.push(text);
			}
		}
	}
	return questions;
}

function ruleMatches(rule: EvalAnswerRule, text: string): boolean {
	return new RegExp(rule.when, "i").test(text);
}

/**
 * Answer for the agent's last message: rules first (per question), else recommended option(s) (else the first option).
 * A question without <choices> is matched by a rule against the last 500 chars. undefined when nothing fits.
 */
export function chooseAnswer(message: string, rules: EvalAnswerRule[]): string | undefined {
	const questions = parseChoices(message);
	if (questions.length === 0) {
		const tail = message.slice(-500);
		return rules.find((rule) => ruleMatches(rule, tail))?.text;
	}
	const answers: string[] = [];
	for (const question of questions) {
		const rule = rules.find((r) => ruleMatches(r, question.text));
		let answer: string | undefined;
		if (rule) {
			answer = rule.text;
		} else if (question.recommended.length > 0) {
			answer = question.recommended.join(", ");
		} else {
			answer = question.options[0];
		}
		if (answer === undefined) {
			return undefined;
		}
		answers.push(answer);
	}
	if (questions.length === 1) {
		return answers[0];
	}
	return questions.map((q, i) => `${i + 1}. ${q.text} — ${answers[i]}`).join("\n");
}
