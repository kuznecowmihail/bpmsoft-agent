// crm-probe: records HTTP response shapes of a BPMSoft CRM stand for later analysis.
//
// Usage:
//   CRM_URL=http://localhost:8007 CRM_USER=<login> CRM_PASSWORD=<password> node scripts/crm-probe.mjs <steps>
//
//   steps: comma-separated list of login,update,build,restart (default: login)
//          e.g. login,update,build,restart
//
// Steps run in the given order. If login fails, the run stops.
// Output: ~/Library/Logs/bpmsoft-agent/crm-probe/<YYYY-MM-DD_HH-MM-SS>.json on macOS,
//         ~/.bpmsoft-agent/crm-probe/ on other platforms.
// The password and cookie values are replaced with '***' in the output file.
// Requires Node 20+. No dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STEP_NAMES = ['login', 'update', 'build', 'restart'];
const LOGIN_PATH = '/ServiceModel/AuthService.svc/Login';
const RESTART_PATH = '/ServiceModel/AppInstallerService.svc/RestartApp';
const RESTART_POLL_INTERVAL_MS = 2000;
const RESTART_POLL_LIMIT_SEC = 600;
const RESPONSE_TEXT_LIMIT = 20000;

const rawUrl = process.env.CRM_URL;
const user = process.env.CRM_USER;
const password = process.env.CRM_PASSWORD;

if (!rawUrl || !user || !password) {
  console.error('Задайте CRM_URL, CRM_USER и CRM_PASSWORD');
  process.exit(1);
}

const CRM_URL = rawUrl.replace(/\/+$/, '');
const steps = (process.argv[2] ?? 'login')
  .split(',')
  .map((step) => step.trim())
  .filter(Boolean);

const unknownSteps = steps.filter((step) => !STEP_NAMES.includes(step));
if (unknownSteps.length > 0) {
  console.error(`Неизвестные шаги: ${unknownSteps.join(', ')}. Допустимые: ${STEP_NAMES.join(', ')}`);
  process.exit(1);
}

// Cookie jar: name -> value.
const jar = new Map();
// Every secret value seen during the run (password, cookie values), including
// values that were later cleared from the jar (e.g. before restart).
const secrets = new Set([password]);
const records = [];
const startedDate = new Date();
const startedAt = startedDate.toISOString();

const loginBody = { UserName: user, UserPassword: password };
const maskedLoginBody = { UserName: user, UserPassword: '***' };

function sanitize(text) {
  let result = String(text);
  for (const secret of secrets) {
    if (secret) result = result.replaceAll(secret, '***');
  }
  return result;
}

function parseSetCookie(raw) {
  const pair = raw.split(';')[0];
  const eq = pair.indexOf('=');
  if (eq < 0) return null;
  const name = pair.slice(0, eq).trim();
  if (!name) return null;
  return { name, value: pair.slice(eq + 1).trim() };
}

function storeCookies(cookies) {
  for (const { name, value } of cookies) {
    jar.set(name, value);
    if (value && (value.length >= 8 || name === 'BPMCSRF')) {
      secrets.add(value);
    }
  }
}

function collapse(text) {
  return String(text).replace(/\s*[\r\n]+\s*/g, ' ');
}

function printResult(entry) {
  if (entry.error !== undefined) {
    console.log(`${entry.step}: ошибка — ${sanitize(entry.error)}`);
    return;
  }
  const preview = collapse(sanitize(entry.responseText)).slice(0, 200);
  console.log(`${entry.step}: HTTP ${entry.status} · ${entry.durationMs} мс · ${preview}`);
}

async function call(name, requestPath, body, timeoutMs, options = {}) {
  const { quiet = false, recordBody = body } = options;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
  };
  if (jar.size > 0) {
    headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  }
  if (jar.has('BPMCSRF')) {
    headers.BPMCSRF = jar.get('BPMCSRF');
  }

  const entry = {
    step: name,
    path: requestPath,
    requestBody: recordBody,
    status: null,
    ok: false,
    durationMs: 0,
    responseHeaders: {},
    setCookieNames: [],
    responseText: '',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${CRM_URL}${requestPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    entry.status = response.status;
    entry.ok = response.ok;
    for (const [key, value] of response.headers) {
      if (key !== 'set-cookie') entry.responseHeaders[key] = value;
    }
    const cookies = response.headers.getSetCookie().map(parseSetCookie).filter(Boolean);
    entry.setCookieNames = cookies.map((cookie) => cookie.name);
    storeCookies(cookies);
    entry.responseText = await response.text();
  } catch (error) {
    const message = controller.signal.aborted
      ? `таймаут ${timeoutMs} мс`
      : String(error?.message ?? error);
    const causeCode = error?.cause?.code;
    entry.error = causeCode ? `${message} (${causeCode})` : message;
  } finally {
    clearTimeout(timer);
    entry.durationMs = Date.now() - started;
  }

  if (!quiet) printResult(entry);
  return entry;
}

function isLoginOk(entry) {
  if (entry.error !== undefined || entry.status !== 200) return false;
  try {
    return JSON.parse(entry.responseText).Code === 0;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_`
    + `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Applies sanitization and the response text limit to a record before writing.
function finalizeEntry(entry) {
  const responseHeaders = {};
  for (const [key, value] of Object.entries(entry.responseHeaders)) {
    responseHeaders[key] = sanitize(value);
  }
  return {
    ...entry,
    responseHeaders,
    responseText: sanitize(entry.responseText).slice(0, RESPONSE_TEXT_LIMIT),
    error: entry.error === undefined ? undefined : sanitize(entry.error),
  };
}

let restartDowntimeSec;
let restartFailedAttempts;
let restartLastFailure;
let restartObservedDown;

for (const step of steps) {
  if (step === 'login') {
    const entry = await call('login', LOGIN_PATH, loginBody, 30000, { recordBody: maskedLoginBody });
    records.push(entry);
    if (!isLoginOk(entry)) {
      console.log('Вход не выполнен, остановка.');
      break;
    }
  } else if (step === 'update') {
    records.push(await call('update', '/ServiceModel/AppInstallerService.svc/LoadPackagesToDB', null, 600000));
  } else if (step === 'build') {
    records.push(await call('build', '/ServiceModel/WorkspaceExplorerService.svc/Build', null, 900000));
  } else if (step === 'restart') {
    const restartStarted = Date.now();
    records.push(await call('restart', RESTART_PATH, null, 120000));

    // Poll login every 2 s with a cleared cookie jar until it succeeds or the limit is reached.
    // RestartApp may return before the CRM goes down, so a success counts as "back" only
    // after a failed attempt was seen, or after 60 s without observing any downtime.
    const deadline = restartStarted + RESTART_POLL_LIMIT_SEC * 1000;
    const observeDownLimitMs = 60000;
    restartFailedAttempts = 0;
    let sawDown = false;
    let restartedLogin = null;
    while (Date.now() < deadline) {
      await sleep(RESTART_POLL_INTERVAL_MS);
      jar.clear();
      const attempt = await call('login-after-restart', LOGIN_PATH, loginBody, 30000, {
        quiet: true,
        recordBody: maskedLoginBody,
      });
      if (isLoginOk(attempt)) {
        if (sawDown) {
          restartedLogin = attempt;
          break;
        }
        if (Date.now() - restartStarted < observeDownLimitMs) continue;
        restartedLogin = attempt;
        break;
      }
      sawDown = true;
      restartFailedAttempts += 1;
      restartLastFailure = attempt.error
        ?? `HTTP ${attempt.status}: ${collapse(attempt.responseText).slice(0, 200)}`;
    }
    restartObservedDown = sawDown;

    if (restartedLogin) {
      records.push(restartedLogin);
      restartDowntimeSec = Math.round((Date.now() - restartStarted) / 1000);
      if (restartObservedDown) {
        console.log(`CRM снова доступна через ${restartDowntimeSec} с`);
      } else {
        console.log('Остановку CRM за 60 с не заметил — перезапуск, возможно, не произошёл');
      }
    } else {
      console.log(`CRM не поднялась за ${RESTART_POLL_LIMIT_SEC} с`);
    }
  }
}

const output = {
  url: CRM_URL,
  user,
  startedAt,
  steps: records.map(finalizeEntry),
};
if (restartDowntimeSec !== undefined) output.restartDowntimeSec = restartDowntimeSec;
if (restartObservedDown !== undefined) output.restartObservedDown = restartObservedDown;
if (restartFailedAttempts !== undefined) {
  output.restartFailedAttempts = restartFailedAttempts;
  if (restartLastFailure !== undefined) output.restartLastFailure = sanitize(restartLastFailure);
}

const logDir = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Logs', 'bpmsoft-agent', 'crm-probe')
  : path.join(os.homedir(), '.bpmsoft-agent', 'crm-probe');
fs.mkdirSync(logDir, { recursive: true });
const outFile = path.join(logDir, `${fileStamp(startedDate)}.json`);
fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Результат: ${outFile}`);
