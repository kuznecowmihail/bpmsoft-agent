/**
 * Repository labels named in a git confirmation text: git_create_mr ("Репозиторий: ..."),
 * git_switch_branch ("Переключить ветку git в ...: ...") and the fast-forward
 * confirmation of the current branch ("Обновить ветку git в ...: ...").
 */
export function gitConfirmRepos(text: string): string[] {
	const labels: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const create = /^Репозиторий: (.+)$/.exec(line);
		const switched = /^Переключить ветку git в (.+?): /.exec(line);
		const updated = /^Обновить ветку git в (.+?): /.exec(line);
		const label = create?.[1] ?? switched?.[1] ?? updated?.[1];
		if (label !== undefined) {
			labels.push(label.trim());
		}
	}
	return labels;
}

/** True when the confirmation touches only the eval package repository. */
export function isEvalPackageOnly(text: string, packageName: string): boolean {
	const labels = gitConfirmRepos(text);
	return labels.length > 0 && labels.every((label) => label === packageName);
}
