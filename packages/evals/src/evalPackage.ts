import * as fs from "fs";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import type { EvalConfig } from "./caseFile";

/** Description of the eval package: the runner resets only packages that carry this marker. */
export const EVAL_PACKAGE_MARKER = "bpmsoft-agent evals";

/** Platform package the eval package depends on by default. */
export const PRODUCT_CORE = {
	UId: "2fabaf6c-0f92-4530-aef8-40345c021da2",
	PackageVersion: "1.0.0",
	Name: "ProductCore",
};

/** Folders every package has, created empty. */
const SUBFOLDERS = ["Assemblies", "Data", "Resources", "Schemas", "SqlScripts"];

const BOM = "\uFEFF";

/** One entry of Descriptor.DependsOn. */
type EvalDependency = NonNullable<EvalConfig["dependsOn"]>[number];

/** Reads a JSON file, dropping a leading BOM. */
function readJsonFile(file: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
}

/**
 * Serializes JSON with 2-space indent. BPMSoft writes dates as "\/Date(<ms>)\/",
 * so the date written as "/Date(<ms>)/" is escaped here.
 */
function stringifyWithDate(value: unknown, now: number): string {
	return JSON.stringify(value, null, 2).replace(`"/Date(${now})/"`, `"\\/Date(${now})\\/"`);
}

/** Reads Descriptor of the package and throws when it is not an eval package. Returns its UId. */
function checkEvalPackage(packageDir: string): string {
	const file = path.join(packageDir, "descriptor.json");
	if (!fs.existsSync(file)) {
		throw new Error(`В пакете ${path.basename(packageDir)} нет descriptor.json — это не пакет эвалов`);
	}
	const descriptor = (readJsonFile(file).Descriptor ?? {}) as { UId?: string; Description?: string };
	if (descriptor.Description !== EVAL_PACKAGE_MARKER) {
		throw new Error(
			`Пакет ${path.basename(packageDir)} не создан раннером эвалов (в Description нет метки «${EVAL_PACKAGE_MARKER}»). Пакет не будет очищен.`,
		);
	}
	return descriptor.UId ?? "";
}

/** UId of the package from its descriptor.json. */
export function readPackageUid(packageDir: string): string {
	const file = path.join(packageDir, "descriptor.json");
	if (!fs.existsSync(file)) {
		throw new Error(`Нет descriptor.json в пакете ${path.basename(packageDir)}`);
	}
	const descriptor = (readJsonFile(file).Descriptor ?? {}) as { UId?: string };
	if (!descriptor.UId) {
		throw new Error(`В descriptor.json пакета ${path.basename(packageDir)} нет UId`);
	}
	return descriptor.UId;
}

/**
 * Creates the eval package `<package>` in Pkg when it is missing; an existing package must carry the marker.
 * The version of BPMSoft is taken from Pkg/Custom/descriptor.json.
 */
export function ensureEvalPackage(
	pkgRoot: string,
	config: EvalConfig,
	now: number = Date.now(),
): { created: boolean; uid: string } {
	const packageDir = path.join(pkgRoot, config.package);
	if (fs.existsSync(path.join(packageDir, "descriptor.json"))) {
		return { created: false, uid: checkEvalPackage(packageDir) };
	}
	if (fs.existsSync(packageDir)) {
		throw new Error(
			`Папка ${config.package} уже есть в Pkg, но descriptor.json в ней нет. Укажите другое имя в local.json (package).`,
		);
	}

	const customFile = path.join(pkgRoot, "Custom", "descriptor.json");
	if (!fs.existsSync(customFile)) {
		throw new Error("Не найден Pkg/Custom/descriptor.json: не из чего взять версию BPMSoft для пакета эвалов");
	}
	const bpmsoftVersion = (readJsonFile(customFile).Descriptor as { BPMSoftVersion?: unknown } | undefined)?.BPMSoftVersion;
	if (typeof bpmsoftVersion !== "string" || bpmsoftVersion === "") {
		throw new Error("В Pkg/Custom/descriptor.json нет Descriptor.BPMSoftVersion");
	}

	const uid = randomUUID();
	fs.mkdirSync(packageDir, { recursive: true });
	for (const folder of SUBFOLDERS) {
		fs.mkdirSync(path.join(packageDir, folder), { recursive: true });
	}
	const descriptor = {
		Descriptor: {
			UId: uid,
			Name: config.package,
			BPMSoftVersion: bpmsoftVersion,
			ModifiedOnUtc: `/Date(${now})/`,
			Maintainer: "Customer",
			Description: EVAL_PACKAGE_MARKER,
			DependsOn: config.dependsOn ?? [PRODUCT_CORE],
		},
	};
	fs.writeFileSync(path.join(packageDir, "descriptor.json"), BOM + stringifyWithDate(descriptor, now), "utf8");
	return { created: true, uid };
}

/**
 * Sets Descriptor.DependsOn back to dependsOn when the agent changed it; the file is rewritten
 * (with a fresh ModifiedOnUtc and the same BOM state) only in that case.
 */
function restoreDependsOn(packageDir: string, dependsOn: EvalDependency[], now: number): void {
	const file = path.join(packageDir, "descriptor.json");
	const raw = fs.readFileSync(file, "utf8");
	const hasBom = raw.startsWith(BOM);
	const body = JSON.parse(hasBom ? raw.slice(BOM.length) : raw) as { Descriptor: Record<string, unknown> };
	if (JSON.stringify(body.Descriptor.DependsOn) === JSON.stringify(dependsOn)) {
		return;
	}
	body.Descriptor.DependsOn = dependsOn;
	body.Descriptor.ModifiedOnUtc = `/Date(${now})/`;
	fs.writeFileSync(file, (hasBom ? BOM : "") + stringifyWithDate(body, now), "utf8");
}

/**
 * Empties the eval package: removes everything except descriptor.json and recreates the empty folders.
 * The DependsOn of descriptor.json is restored to dependsOn when the agent has changed it.
 */
export function resetEvalPackage(
	packageDir: string,
	dependsOn: EvalDependency[] = [PRODUCT_CORE],
	now: number = Date.now(),
): void {
	checkEvalPackage(packageDir);
	restoreDependsOn(packageDir, dependsOn, now);
	for (const entry of fs.readdirSync(packageDir)) {
		if (entry === "descriptor.json") {
			continue;
		}
		fs.rmSync(path.join(packageDir, entry), { recursive: true, force: true });
	}
	for (const folder of SUBFOLDERS) {
		fs.mkdirSync(path.join(packageDir, folder), { recursive: true });
	}
}

/** Replaces {{key}} in text. Unknown keys throw with the fixture name. */
function fillTemplate(text: string, values: Record<string, string>, fixture: string): string {
	return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		if (Object.prototype.hasOwnProperty.call(values, key)) {
			return values[key];
		}
		throw new Error(`Неизвестная подстановка {{${key}}} в заготовке ${fixture}`);
	});
}

/** Copies a fixture folder into the package, substituting {{key}} in names and file text. */
function copyFixtureTree(
	root: string,
	dir: string,
	target: string,
	values: Record<string, string>,
	fixture: string,
): void {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const source = path.join(dir, entry.name);
		const relative = path.relative(root, source).split(path.sep).map((segment) => fillTemplate(segment, values, fixture));
		const out = path.join(target, ...relative);
		if (entry.isDirectory()) {
			fs.mkdirSync(out, { recursive: true });
			copyFixtureTree(root, source, target, values, fixture);
		} else {
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, fillTemplate(fs.readFileSync(source, "utf8"), values, fixture), "utf8");
		}
	}
}

/** Copies the named fixtures from fixturesDir into the package folder with {{key}} substitution. */
export function applyFixtures(
	fixturesDir: string,
	names: string[],
	packageDir: string,
	values: Record<string, string>,
): void {
	for (const name of names) {
		const source = path.join(fixturesDir, name);
		if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
			throw new Error(`Нет заготовки ${name} в ${fixturesDir}`);
		}
		copyFixtureTree(source, source, packageDir, values, name);
	}
}

/** SHA-256 hex digest of file bytes. */
export function sha256(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Recursively lists the files of a folder: relative path with "/" separators → sha256 of the bytes. */
export function snapshotPackage(packageDir: string): Map<string, string> {
	const result = new Map<string, string>();
	if (!fs.existsSync(packageDir)) {
		return result;
	}
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				const key = path.relative(packageDir, full).split(path.sep).join("/");
				result.set(key, sha256(fs.readFileSync(full)));
			}
		}
	};
	walk(packageDir);
	return result;
}

/** Writes SqlScripts/<name>/ (descriptor.json and <name>.sql) for the platform to run. Returns the folder. */
export function writeSqlScript(packageDir: string, name: string, sql: string, now: number = Date.now()): string {
	const folder = path.join(packageDir, "SqlScripts", name);
	fs.mkdirSync(folder, { recursive: true });
	const descriptor = {
		SqlScript: {
			UId: randomUUID(),
			Name: name,
			DBEngineType: 2,
			InstallType: 1,
			ModifiedOnUtc: `/Date(${now})/`,
			DependsOn: [],
		},
	};
	fs.writeFileSync(path.join(folder, "descriptor.json"), BOM + stringifyWithDate(descriptor, now), "utf8");
	fs.writeFileSync(path.join(folder, `${name}.sql`), sql, "utf8");
	return folder;
}
