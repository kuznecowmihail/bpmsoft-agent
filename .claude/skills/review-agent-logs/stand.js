#!/usr/bin/env node
'use strict';

// CLI for reviewing a CRM stand: stand info, read-only DB queries, stand logs,
// REST requests and (with explicit user consent) update/compile/restart via crm.js.
// Passwords are read from .claude/stands.env or evals config and are never printed.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cfg = require('./stand-config');

const REPO = path.resolve(__dirname, '..', '..', '..');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_START_RE = /^\d{4}-\d{2}-\d{2} /;
const COMMANDS = ['info', 'db', 'logs', 'request', 'update', 'compile', 'restart'];
const CRM_COMMANDS = ['request', 'update', 'compile', 'restart'];

const USAGE = `Использование:
node .claude/skills/review-agent-logs/stand.js list
node .claude/skills/review-agent-logs/stand.js <стенд|папка> info
node .claude/skills/review-agent-logs/stand.js <стенд|папка> db "<SELECT …>"
node .claude/skills/review-agent-logs/stand.js <стенд|папка> logs [ГГГГ-ММ-ДД] [--file Error] [--grep <рег. выражение>] [--tail 50]
node .claude/skills/review-agent-logs/stand.js <стенд|папка> request <GET|POST> <путь> [JSON|@файл] [--max N]
node .claude/skills/review-agent-logs/stand.js <стенд|папка> update|compile|restart
`;

function fail(message, code = 1) {
	process.stderr.write(message + '\n');
	process.exitCode = code;
}

function usage() {
	process.stderr.write(USAGE);
	process.exitCode = 2;
}

function readTextIfExists(file) {
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

function loadContext() {
	const files = cfg.appDataDirs().map((dir) => path.join(dir, 'settings.json'));
	const connections = cfg.readProjectConnections(files);

	const envText = readTextIfExists(path.join(REPO, '.claude', 'stands.env'));
	const standsEnv = envText === undefined ? {} : cfg.parseEnvFile(envText);

	let evals;
	const localText = readTextIfExists(path.join(REPO, 'packages', 'evals', 'local.json'));
	if (localText !== undefined) {
		evals = JSON.parse(localText.replace(/^\uFEFF/, ''));
		const evEnvText = readTextIfExists(path.join(REPO, 'packages', 'evals', '.env'));
		evals.env = evEnvText === undefined ? {} : cfg.parseEnvFile(evEnvText);
	}
	return { connections, standsEnv, evals };
}

function resolveOrFail(ctx, arg) {
	try {
		return cfg.resolveStand(arg, ctx);
	} catch (error) {
		fail(error.message);
		return undefined;
	}
}

function cmdList(ctx) {
	for (const name of cfg.listStands(ctx)) {
		const stand = cfg.resolveStand(name, ctx);
		process.stdout.write(
			`${stand.name} — ${stand.appRoot} — CRM ${stand.crm.url || 'нет'} — пароли: CRM ${stand.crm.password ? 'да' : 'нет'}, БД ${stand.db.password ? 'да' : 'нет'}\n`
		);
	}
}

async function cmdDb(stand, sql) {
	if (!sql) return usage();
	const distPath = path.join(REPO, 'packages', 'agent-runtime', 'dist');
	if (!fs.existsSync(distPath)) {
		return fail('Соберите agent-runtime: npm run build -w @bpmsoft-agent/agent-runtime');
	}
	if (!stand.db.password) {
		return fail(`Нет пароля БД для стенда «${stand.name}». Впишите ${envKeyName(stand, 'DB')} в .claude/stands.env (шаблон — .claude/stands.env.example).`);
	}
	const { createCrmDbTool } = require(distPath);
	const override = {};
	if (stand.db.host) override.host = stand.db.host;
	if (stand.db.port) override.port = stand.db.port;
	if (stand.db.user) override.user = stand.db.user;
	override.password = stand.db.password;

	const tool = createCrmDbTool({
		connectionStringsPath: stand.connectionStringsPath,
		override,
		maxRows: 200,
		timeoutMs: 20000,
	});
	const result = await tool.execute(sql);
	process.stdout.write(result.text + '\n');
	process.exitCode = result.isError ? 1 : 0;
}

function envKeyName(stand, kind) {
	return `${cfg.envKey(stand.name)}_${kind}_PASSWORD`;
}

function parseLogsArgs(args) {
	const opts = { date: undefined, file: 'Error', grep: undefined, tail: 50 };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--file') {
			opts.file = args[++i];
		} else if (arg === '--grep') {
			opts.grep = args[++i];
		} else if (arg === '--tail') {
			opts.tail = Number(args[++i]);
		} else if (DATE_RE.test(arg)) {
			opts.date = arg;
		} else {
			return { error: `Неизвестный аргумент для logs: ${arg}` };
		}
	}
	if (!opts.file || !opts.file.trim()) return { error: 'Не указано имя журнала после --file' };
	if (!Number.isInteger(opts.tail) || opts.tail <= 0) return { error: '--tail должен быть положительным целым числом' };
	return { opts };
}

function latestLogDate(logsDir) {
	const dates = fs.readdirSync(logsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && DATE_RE.test(e.name))
		.map((e) => e.name)
		.sort();
	return dates[dates.length - 1];
}

/** Splits log text into records: a record starts at a dated line and includes the lines after it (stack traces). */
function splitRecords(lines) {
	const records = [];
	for (const line of lines) {
		if (RECORD_START_RE.test(line) || records.length === 0) {
			records.push([line]);
		} else {
			records[records.length - 1].push(line);
		}
	}
	return records;
}

function cmdLogs(stand, args) {
	const parsed = parseLogsArgs(args);
	if (parsed.error) return fail(parsed.error, 2);
	const { opts } = parsed;

	if (!fs.existsSync(stand.logsDir)) {
		return fail(`Папка журналов стенда не найдена: ${stand.logsDir}`);
	}
	const date = opts.date || latestLogDate(stand.logsDir);
	if (!date) return fail(`В папке журналов нет папок с датой: ${stand.logsDir}`);

	const dayDir = path.join(stand.logsDir, date);
	const fileName = path.extname(path.basename(opts.file)) ? path.basename(opts.file) : path.basename(opts.file) + '.log';
	const filePath = path.join(dayDir, fileName);

	if (!fs.existsSync(filePath)) {
		const available = fs.existsSync(dayDir)
			? fs.readdirSync(dayDir).join(', ')
			: 'папки за эту дату нет';
		return fail(`Журнал «${fileName}» за ${date} не найден. Есть: ${available || 'файлов нет'}`);
	}

	const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
	if (lines.length && lines[lines.length - 1] === '') lines.pop();
	let records = splitRecords(lines);

	if (opts.grep !== undefined) {
		let re;
		try {
			re = new RegExp(opts.grep, 'i');
		} catch (error) {
			return fail(`Некорректное регулярное выражение для --grep: ${error.message}`, 2);
		}
		records = records.filter((record) => re.test(record.join('\n')));
	}

	const shown = records.slice(-opts.tail);
	process.stdout.write(`${fileName} за ${date}: записей ${shown.length} из ${records.length}\n`);
	const text = shown.map((record) => record.join('\n')).join('\n');
	process.stdout.write(text + (text ? '\n' : ''));
}

function cmdCrm(stand, cmd, rest) {
	const crmJs = path.join(REPO, 'packages', 'agent-runtime', 'dist', 'claude-export', 'crm.js');
	if (!fs.existsSync(crmJs)) {
		return fail('Соберите agent-runtime: npm run build -w @bpmsoft-agent/agent-runtime');
	}
	const missing = [];
	if (!stand.crm.url) missing.push('адрес CRM (crmUrl в настройках приложения)');
	if (!stand.crm.user) missing.push('пользователь CRM (crmUser в настройках приложения)');
	if (!stand.crm.password) missing.push(`${envKeyName(stand, 'CRM')} в .claude/stands.env (шаблон — .claude/stands.env.example)`);
	if (missing.length) {
		return fail(`Для стенда «${stand.name}» не хватает: ${missing.join('; ')}.`);
	}

	const args = [...rest];
	if (cmd === 'update' && !args.includes('--no-lint')) args.push('--no-lint');

	const result = spawnSync(process.execPath, [crmJs, cmd, ...args], {
		cwd: stand.appRoot,
		env: {
			...process.env,
			BPMSOFT_CRM_URL: stand.crm.url,
			BPMSOFT_CRM_USER: stand.crm.user,
			BPMSOFT_CRM_PASSWORD: stand.crm.password,
		},
		stdio: 'inherit',
	});
	if (result.error) return fail(`Не удалось запустить crm.js: ${result.error.message}`);
	process.exitCode = result.status === null ? 1 : result.status;
}

async function main(argv) {
	if (argv.length === 0) return usage();

	const ctx = loadContext();
	if (argv[0] === 'list') return cmdList(ctx);

	if (argv.length < 2 || !COMMANDS.includes(argv[1])) return usage();
	const stand = resolveOrFail(ctx, argv[0]);
	if (!stand) return;
	const cmd = argv[1];
	const rest = argv.slice(2);

	if (cmd === 'info') {
		process.stdout.write(cfg.describeStand(stand) + '\n');
		return;
	}
	if (cmd === 'db') return cmdDb(stand, rest[0]);
	if (cmd === 'logs') return cmdLogs(stand, rest);
	if (CRM_COMMANDS.includes(cmd)) return cmdCrm(stand, cmd, rest);
	return usage();
}

main(process.argv.slice(2)).catch((error) => {
	fail(error && error.message ? error.message : String(error));
});
