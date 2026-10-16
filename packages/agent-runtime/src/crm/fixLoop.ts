/** Failed update/compile attempts allowed per turn before the checkpoint. */
export const DEFAULT_MAX_FAILED_ACTIONS = 5;

export interface FailureInfo { signature: string; schemaNames: string[] }
export interface FailureNote { text: string; attempt: number; foreignSchemas: string[] }

/** Error text without positions, so the same error on another line counts as the same. */
export function errorSignature(error: string): string {
	return error.replace(/\(\d+,\d+\)/g, "").replace(/\s+/g, " ").trim();
}

/** Schema name from a file path: the base name before the first dot. */
export function schemaNameFromFile(fileName: string): string {
	if (!fileName) {
		return "";
	}
	const base = fileName.split(/[\\/]/).pop() ?? "";
	return base.split(".")[0] ?? "";
}

/** Per-turn counter of failed CRM actions: attempt notes, approach hints and a checkpoint. */
export class FixLoop {
	private readonly maxFailures: number;
	private readonly ownSchemas?: () => Set<string>;
	private failures = 0;
	private lastSignature: string | undefined;
	private sameInRow = 0;
	private checkpoint = false;

	constructor(options: { maxFailures?: number; ownSchemas?: () => Set<string> } = {}) {
		this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILED_ACTIONS;
		this.ownSchemas = options.ownSchemas;
	}

	/** Text that blocks the next action after the checkpoint; undefined when the action may run. */
	blocked(): string | undefined {
		return this.checkpoint
			? "Контрольная точка уже достигнута в этом ходе — не вызывай инструмент, спроси пользователя, продолжать ли."
			: undefined;
	}

	/** A successful compile closes the fix cycle; a successful update does not. */
	success(action: "update" | "compile"): void {
		if (action === "compile") {
			this.failures = 0;
			this.lastSignature = undefined;
			this.sameInRow = 0;
		}
	}

	/** Counts a failure and builds the note appended to the tool result. */
	failure(info: FailureInfo): FailureNote {
		this.failures++;
		if (info.signature === this.lastSignature) {
			this.sameInRow++;
		} else {
			this.sameInRow = 1;
		}
		this.lastSignature = info.signature;

		const own = this.ownSchemas?.();
		const foreignSchemas = own
			? [...new Set(info.schemaNames.filter((name) => name !== "" && !own.has(name)))]
			: [];

		const lines = [`Неудачная попытка ${this.failures} из ${this.maxFailures} в этом ходе.`];
		if (foreignSchemas.length > 0) {
			const names = foreignSchemas.join(", ");
			lines.push(`Ошибка в схемах, которые в этом чате не менялись: ${names}. Не исправляй их молча: сообщи пользователю, где ошибка и в чём, и задай блок <choices> «Исправить ошибку в ${names}?» — «Исправь», «Не трогай». Если пользователь в этом чате уже просил исправить эту ошибку — исправляй.`);
		}
		if (this.sameInRow === 2) {
			lines.push("Та же ошибка, что в прошлой попытке: прошлое исправление не помогло. Смени подход: перечитай рецепт в знаниях, найди рабочий образец в Pkg и сравни с ним.");
		}
		if (this.sameInRow >= 3 || this.failures >= this.maxFailures) {
			this.checkpoint = true;
			lines.push("Достигнута контрольная точка. Не вызывай crm_update_from_fs и crm_compile в этом ходе: напиши пользователю по попыткам, что пробовал и какая ошибка осталась, и закончи ответ блоком <choices> с вопросом «Что дальше?» и вариантами «Продолжай исправлять» и «Остановись, разберусь сам».");
		}

		return { text: lines.join("\n"), attempt: this.failures, foreignSchemas };
	}
}
