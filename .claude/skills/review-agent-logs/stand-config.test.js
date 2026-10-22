'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('./stand-config');

function tmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'stand-config-'));
}

test('appDataDirs for darwin', () => {
	const home = path.join(os.tmpdir(), 'fake-home');
	assert.deepStrictEqual(cfg.appDataDirs('darwin', {}, home), [
		path.join(home, 'Library', 'Application Support', '@bpmsoft-agent', 'desktop'),
		path.join(home, 'Library', 'Application Support', 'BPMSoft Agent'),
	]);
});

test('appDataDirs for win32 uses APPDATA and falls back to home', () => {
	const home = path.join(os.tmpdir(), 'fake-home');
	const base = path.join(os.tmpdir(), 'fake-appdata');
	assert.deepStrictEqual(cfg.appDataDirs('win32', { APPDATA: base }, home), [
		path.join(base, '@bpmsoft-agent', 'desktop'),
		path.join(base, 'BPMSoft Agent'),
	]);
	assert.deepStrictEqual(cfg.appDataDirs('win32', {}, home), [
		path.join(home, 'AppData', 'Roaming', '@bpmsoft-agent', 'desktop'),
		path.join(home, 'AppData', 'Roaming', 'BPMSoft Agent'),
	]);
});

test('appDataDirs for other platforms uses XDG_CONFIG_HOME', () => {
	const home = path.join(os.tmpdir(), 'fake-home');
	const xdg = path.join(os.tmpdir(), 'fake-xdg');
	assert.deepStrictEqual(cfg.appDataDirs('linux', { XDG_CONFIG_HOME: xdg }, home), [
		path.join(xdg, '@bpmsoft-agent', 'desktop'),
		path.join(xdg, 'BPMSoft Agent'),
	]);
	assert.deepStrictEqual(cfg.appDataDirs('linux', {}, home)[0], path.join(home, '.config', '@bpmsoft-agent', 'desktop'));
});

test('readProjectConnections merges files, ignores missing and invalid ones, handles BOM', () => {
	const dir = tmpDir();
	const a = path.join(dir, 'a.json');
	const b = path.join(dir, 'b.json');
	const bad = path.join(dir, 'bad.json');
	const missing = path.join(dir, 'missing.json');
	fs.writeFileSync(a, '\uFEFF' + JSON.stringify({
		projectConnections: { '/x/A': { dbHost: 'h1', crmUrl: 'u1' } },
	}));
	fs.writeFileSync(b, JSON.stringify({
		projectConnections: { '/x/A': { dbHost: 'h2' }, '/x/B': { crmUrl: 'u2' } },
	}));
	fs.writeFileSync(bad, '{not json');

	const result = cfg.readProjectConnections([a, missing, bad, b]);
	assert.deepStrictEqual(result, {
		'/x/A': { dbHost: 'h1', crmUrl: 'u1' },
		'/x/B': { crmUrl: 'u2' },
	});
});

test('appRootOf strips BPMSoft.Configuration/Pkg and BPMSoft.Configuration', () => {
	const base = path.join(os.tmpdir(), 'Root');
	assert.strictEqual(cfg.appRootOf(path.join(base, 'X', 'BPMSoft.Configuration', 'Pkg')), path.join(base, 'X'));
	assert.strictEqual(cfg.appRootOf(path.join(base, 'X', 'bpmsoft.configuration', 'PKG') + path.sep), path.join(base, 'X'));
	assert.strictEqual(cfg.appRootOf(path.join(base, 'X', 'BPMSoft.Configuration')), path.join(base, 'X'));
	assert.strictEqual(cfg.appRootOf(path.join(base, 'X')), path.resolve(path.join(base, 'X')));
});

test('appRootOf accepts backslash separators on any OS', () => {
	assert.strictEqual(
		cfg.appRootOf('C:\\a\\X\\BPMSoft.Configuration\\Pkg'),
		['C:', 'a', 'X'].join(path.sep)
	);
});

test('standName and envKey', () => {
	assert.strictEqual(cfg.standName(path.join('a', 'stand2_100')), 'stand2_100');
	assert.strictEqual(cfg.envKey('stand2_100'), 'STAND2_100');
	assert.strictEqual(cfg.envKey('my-stand'), 'MY_STAND');
});

test('parseEnvFile handles BOM, CRLF, comments, quotes and spaces', () => {
	const text = '\uFEFF# comment\r\nA_CRM_PASSWORD="sec1"\r\n\r\nB_DB_PASSWORD=\'x y\'\r\n  C = plain  \r\n# D=skipped\r\nE="unbalanced\r\n';
	assert.deepStrictEqual(cfg.parseEnvFile(text), {
		A_CRM_PASSWORD: 'sec1',
		B_DB_PASSWORD: 'x y',
		C: 'plain',
		E: '"unbalanced',
	});
});

test('resolveStand by name, by Pkg path, evals fallback and env precedence', () => {
	const root = path.join(tmpDir(), 'Stand1');
	const evalsRoot = path.join(tmpDir(), 'Evals1');
	const ctx = {
		connections: {
			[root]: {
				dbHost: 'db.local', dbPort: '5433', dbUser: 'u',
				crmUrl: 'http://crm', crmUser: 'admin',
			},
		},
		standsEnv: { STAND1_CRM_PASSWORD: 'p1' },
		evals: {
			appRoot: evalsRoot,
			crm: { url: 'http://eval', user: 'ev' },
			db: { host: 'dbE', port: 5432, user: 'eu' },
			env: { BPMSOFT_EVAL_CRM_PASSWORD: 'ecrm', BPMSOFT_EVAL_DB_PASSWORD: 'edb' },
		},
	};

	const byName = cfg.resolveStand('stand1', ctx);
	assert.strictEqual(byName.name, 'Stand1');
	assert.strictEqual(byName.appRoot, path.resolve(root));
	assert.strictEqual(byName.connectionStringsPath, path.join(path.resolve(root), 'ConnectionStrings.config'));
	assert.strictEqual(byName.logsDir, path.join(path.resolve(root), 'Logs'));
	assert.deepStrictEqual(byName.crm, { url: 'http://crm', user: 'admin', password: 'p1' });
	assert.deepStrictEqual(byName.db, { host: 'db.local', port: 5433, user: 'u', password: '' });

	const byPath = cfg.resolveStand(path.join(root, 'BPMSoft.Configuration', 'Pkg'), ctx);
	assert.strictEqual(byPath.name, 'Stand1');
	assert.strictEqual(byPath.appRoot, path.resolve(root));

	const evals = cfg.resolveStand('Evals1', ctx);
	assert.deepStrictEqual(evals.crm, { url: 'http://eval', user: 'ev', password: 'ecrm' });
	assert.deepStrictEqual(evals.db, { host: 'dbE', port: 5432, user: 'eu', password: 'edb' });

	ctx.standsEnv.EVALS1_CRM_PASSWORD = 'mine';
	assert.strictEqual(cfg.resolveStand('Evals1', ctx).crm.password, 'mine');

	// Evals settings must not leak into a stand that is not the evals stand.
	assert.strictEqual(cfg.resolveStand('Stand1', ctx).db.password, '');
});

test('resolveStand not found lists known stands', () => {
	const ctx = {
		connections: { [path.join(tmpDir(), 'Stand1')]: {} },
		standsEnv: {},
		evals: { appRoot: path.join(tmpDir(), 'Evals1'), crm: {}, db: {}, env: {} },
	};
	assert.throws(() => cfg.resolveStand('Nope', ctx), {
		message: 'Стенд «Nope» не найден. Известные: Stand1, Evals1',
	});
	assert.deepStrictEqual(cfg.listStands(ctx), ['Stand1', 'Evals1']);
});

test('describeStand does not contain password values', () => {
	const secretCrm = 'SecretCrmValue123';
	const secretDb = 'SecretDbValue456';
	const ctx = {
		connections: { [path.join(tmpDir(), 'Stand1')]: { crmUrl: 'http://crm', crmUser: 'admin', dbHost: 'db' } },
		standsEnv: { STAND1_CRM_PASSWORD: secretCrm, STAND1_DB_PASSWORD: secretDb },
	};
	const withPasswords = cfg.describeStand(cfg.resolveStand('Stand1', ctx));
	assert.ok(withPasswords.includes('пароль CRM: задан'));
	assert.ok(withPasswords.includes('пароль БД: задан'));
	assert.ok(!withPasswords.includes(secretCrm));
	assert.ok(!withPasswords.includes(secretDb));

	const withoutPasswords = cfg.describeStand(cfg.resolveStand('Stand1', { connections: ctx.connections, standsEnv: {} }));
	assert.ok(withoutPasswords.includes('пароль CRM: нет'));
	assert.ok(withoutPasswords.includes('STAND1_CRM_PASSWORD'));
});
