'use strict';

// Pure helpers for stand.js: finding stands, their CRM/DB settings and passwords.
// No side effects at require time; all functions take their inputs explicitly.

const fs = require('fs');
const os = require('os');
const path = require('path');

const PKG_SUFFIX_RE = /^(.*)[\\/]+bpmsoft\.configuration(?:[\\/]+(pkg))?$/i;

/** Candidate userData directories of the desktop app (packaged and dev builds). */
function appDataDirs(platform = process.platform, env = process.env, home = os.homedir()) {
	if (platform === 'darwin') {
		const base = path.join(home, 'Library', 'Application Support');
		return [
			path.join(base, '@bpmsoft-agent', 'desktop'),
			path.join(base, 'BPMSoft Agent'),
		];
	}
	if (platform === 'win32') {
		const base = env.APPDATA || path.join(home, 'AppData', 'Roaming');
		return [
			path.join(base, '@bpmsoft-agent', 'desktop'),
			path.join(base, 'BPMSoft Agent'),
		];
	}
	const base = env.XDG_CONFIG_HOME || path.join(home, '.config');
	return [
		path.join(base, '@bpmsoft-agent', 'desktop'),
		path.join(base, 'BPMSoft Agent'),
	];
}

/** Reads a JSON file with BOM stripped; returns undefined when missing or invalid. */
function readJsonQuiet(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
	} catch (_error) {
		return undefined;
	}
}

/** Merges projectConnections from settings files; the first file that defines a key wins. */
function readProjectConnections(files) {
	const result = {};
	for (const file of files) {
		if (!fs.existsSync(file)) continue;
		const settings = readJsonQuiet(file);
		const connections = settings && settings.projectConnections;
		if (!connections || typeof connections !== 'object') continue;
		for (const key of Object.keys(connections)) {
			if (Object.prototype.hasOwnProperty.call(result, key)) continue;
			result[key] = connections[key];
		}
	}
	return result;
}

/**
 * Application root for a path. For ".../X/BPMSoft.Configuration/Pkg" and ".../X/BPMSoft.Configuration"
 * it is X; any other path is resolved as is. Separators may be "/" or "\" on any OS.
 */
function appRootOf(p) {
	const raw = String(p).replace(/[\\/]+$/, '');
	const match = PKG_SUFFIX_RE.exec(raw);
	if (!match) return path.resolve(p);
	const prefix = match[1];
	if (!prefix) return path.sep;
	const segments = prefix.split(/[\\/]+/);
	return segments.join(path.sep);
}

function standName(appRoot) {
	return path.basename(appRoot);
}

/** Environment key prefix for a stand name: upper case, every char except [A-Z0-9] becomes "_". */
function envKey(name) {
	return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** Parses KEY=VALUE lines (BOM, CRLF, comments and one pair of surrounding quotes are handled). */
function parseEnvFile(text) {
	const result = {};
	const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (value.length >= 2) {
			const first = value[0];
			const last = value[value.length - 1];
			if ((first === '"' || first === "'") && first === last) {
				value = value.slice(1, -1);
			}
		}
		result[key] = value;
	}
	return result;
}

/** All known stands: entries of projectConnections and the evals stand, normalized by app root. */
function collectEntries(ctx) {
	const entries = [];
	const connections = ctx.connections || {};
	for (const key of Object.keys(connections)) {
		entries.push({ appRoot: path.resolve(appRootOf(key)), conn: connections[key] || {} });
	}
	if (ctx.evals && ctx.evals.appRoot) {
		const evalsRoot = path.resolve(appRootOf(ctx.evals.appRoot));
		const existing = entries.find((e) => e.appRoot === evalsRoot);
		if (!existing) entries.push({ appRoot: evalsRoot, conn: undefined });
	}
	return entries;
}

/**
 * Resolves a stand by folder name or by a path (a path may point to a stand that is not
 * in projectConnections; its connection settings are then empty).
 */
function resolveStand(arg, ctx) {
	const standsEnv = ctx.standsEnv || {};
	const evals = ctx.evals;
	const entries = collectEntries(ctx);
	const isPath = /[\\/]/.test(arg) || path.isAbsolute(arg);

	let appRoot;
	let conn;
	if (isPath) {
		appRoot = path.resolve(appRootOf(arg));
		const found = entries.find((e) => e.appRoot === appRoot);
		conn = found ? found.conn : undefined;
	} else {
		const wanted = String(arg).toLowerCase();
		const found = entries.find((e) => standName(e.appRoot).toLowerCase() === wanted);
		if (!found) {
			const known = entries.map((e) => standName(e.appRoot));
			throw new Error(`Стенд «${arg}» не найден. Известные: ${known.join(', ')}`);
		}
		appRoot = found.appRoot;
		conn = found.conn;
	}

	const name = standName(appRoot);
	const c = conn || {};
	const isEvals = Boolean(evals && evals.appRoot && path.resolve(evals.appRoot) === appRoot);
	const ev = isEvals ? evals : {};
	const evCrm = ev.crm || {};
	const evDb = ev.db || {};
	const evEnv = ev.env || {};
	const K = envKey(name);

	const crm = {
		url: c.crmUrl || (isEvals ? evCrm.url : '') || '',
		user: c.crmUser || (isEvals ? evCrm.user : '') || '',
		password: standsEnv[K + '_CRM_PASSWORD'] || (isEvals ? evEnv.BPMSOFT_EVAL_CRM_PASSWORD : '') || '',
	};
	const db = {
		host: c.dbHost || (isEvals ? evDb.host : '') || '',
		port: Number(c.dbPort || (isEvals && evDb.port) || 0) || undefined,
		user: c.dbUser || (isEvals ? evDb.user : '') || '',
		password: standsEnv[K + '_DB_PASSWORD'] || (isEvals ? evEnv.BPMSOFT_EVAL_DB_PASSWORD : '') || '',
	};

	return {
		name,
		appRoot,
		connectionStringsPath: path.join(appRoot, 'ConnectionStrings.config'),
		logsDir: path.join(appRoot, 'Logs'),
		crm,
		db,
	};
}

/** Names of all known stands (projectConnections and evals), unique. */
function listStands(ctx) {
	const names = [];
	for (const entry of collectEntries(ctx)) {
		const name = standName(entry.appRoot);
		if (!names.includes(name)) names.push(name);
	}
	return names;
}

/** Human-readable stand summary in Russian; never contains password values. */
function describeStand(stand) {
	const K = envKey(stand.name);
	const lines = [
		`Стенд: ${stand.name}`,
		`Папка приложения: ${stand.appRoot}`,
		`CRM: ${stand.crm.url || 'не задан'}`,
		`Пользователь CRM: ${stand.crm.user || 'не задан'}`,
		`пароль CRM: ${stand.crm.password ? 'задан' : 'нет'}`,
		`База данных: ${stand.db.host || 'не задана'}${stand.db.port ? ':' + stand.db.port : ''}, пользователь ${stand.db.user || 'не задан'}`,
		`пароль БД: ${stand.db.password ? 'задан' : 'нет'}`,
	];
	const missing = [];
	if (!stand.crm.password) missing.push(`${K}_CRM_PASSWORD`);
	if (!stand.db.password) missing.push(`${K}_DB_PASSWORD`);
	if (missing.length) {
		lines.push(`Чтобы добавить пароли, впишите в .claude/stands.env (шаблон — .claude/stands.env.example): ${missing.join(', ')}`);
	}
	return lines.join('\n');
}

module.exports = {
	appDataDirs,
	readProjectConnections,
	appRootOf,
	standName,
	envKey,
	parseEnvFile,
	resolveStand,
	listStands,
	describeStand,
};
