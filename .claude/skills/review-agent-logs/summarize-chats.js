'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_TOOLS = /^(Read|Grep|Glob|LS|read_file|grep_files|glob_files|list_dir)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function usage() {
  process.stderr.write(
    'Usage: node summarize-chats.js <logsDir> [--since YYYY-MM-DD] [--chat <path to one .jsonl>]\n'
  );
  process.exit(1);
}

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { logsDir: null, since: null, chat: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') {
      args.since = argv[++i];
      if (!args.since || !DATE_RE.test(args.since)) usage();
    } else if (a === '--chat') {
      args.chat = argv[++i];
      if (!args.chat) usage();
    } else if (!a.startsWith('--') && args.logsDir === null) {
      args.logsDir = a;
    } else {
      usage();
    }
  }
  if (!args.logsDir && !args.chat) usage();
  return args;
}

function flat(v) {
  return String(v ?? '').replace(/\r?\n/g, ' ');
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n) : s;
}

function json(v) {
  const s = JSON.stringify(v);
  return s === undefined ? '' : s;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 19);
}

function toolResultText(content) {
  if (typeof content === 'string') return flat(content);
  if (Array.isArray(content)) {
    return flat(content.map((p) => (p && p.text ? p.text : '')).join(''));
  }
  return '';
}

function listDates(chatsDir, since) {
  const dates = fs
    .readdirSync(chatsDir)
    .filter((d) => DATE_RE.test(d) && fs.statSync(path.join(chatsDir, d)).isDirectory())
    .sort();
  if (since) return dates.filter((d) => d >= since);
  return dates.slice(-1);
}

function listJsonl(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .map((f) => path.join(dir, f));
}

function summarizeFile(file, label) {
  const lines = [`=== ${label}`];
  const counts = { turns: 0, toolErrors: 0, denied: 0, asks: 0, crmFails: 0, errors: 0 };
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  for (const raw of rows) {
    if (!raw.trim()) continue;
    let r;
    try {
      r = JSON.parse(raw);
    } catch (_) {
      continue;
    }
    if (!r || typeof r !== 'object') continue;

    const t = r.ts ? fmtTime(r.ts) : '';
    const out = (text) => lines.push(t ? `${t} ${text}` : text);

    switch (r.kind) {
      case 'user_message': {
        counts.turns++;
        const model = r.model && r.model.id ? r.model.id : 'default';
        const text = String(r.text ?? '').replace(/\r?\n/g, ' / ');
        out(`USER [${r.provider}/${model}] ${clip(text, 300)}`);
        break;
      }

      case 'agent_event': {
        const e = r.event || {};
        switch (e.type) {
          case 'tool_use': {
            if (SKIP_TOOLS.test(e.name)) break;
            out(`TOOL ${e.name} ${clip(json(e.input), 140)}`);
            break;
          }
          case 'text': {
            const s = flat(e.text);
            out(`AGENT ${s.length <= 400 ? s : s.slice(0, 160) + ' … ' + s.slice(-240)}`);
            break;
          }
          case 'result': {
            const dur = e.durationMs == null ? '-' : e.durationMs / 1000;
            const usage = e.usage ? json(e.usage) : '-';
            out(`RESULT success=${e.success} ${dur}s cost=${e.totalCostUsd ?? '-'} usage=${usage}`);
            break;
          }
          case 'other': {
            const content = e.raw && e.raw.message ? e.raw.message.content : null;
            if (!Array.isArray(content)) break;
            for (const item of content) {
              if (!item || item.type !== 'tool_result') continue;
              const text = toolResultText(item.content);
              if (item.is_error) {
                counts.toolErrors++;
                out(`TOOL_ERROR ${clip(text, 220)}`);
              } else if (text.trim().length < 400 && /запрещ|отклон|denied/i.test(text.trim())) {
                counts.denied++;
                out(`DENIED ${clip(text, 220)}`);
              }
            }
            break;
          }
          default:
            break;
        }
        break;
      }

      case 'permission_request': {
        counts.asks++;
        out(`ASK ${r.toolName} ${clip(json(r.input), 160)}`);
        break;
      }

      case 'permission_response': {
        out(`ANSWER approved=${r.approved}`);
        break;
      }

      case 'crm_action': {
        if (!r.success) counts.crmFails++;
        const foreign =
          Array.isArray(r.foreignSchemas) && r.foreignSchemas.length
            ? ` foreign=${r.foreignSchemas.join(',')}`
            : '';
        const attempt = r.attempt ? ` attempt=${r.attempt}` : '';
        const blocked = r.blocked ? ' blocked' : '';
        const denied = r.denied ? ' denied' : '';
        const error = r.error ? ` | ${clip(flat(r.error), 200)}` : '';
        out(
          `CRM ${r.action} ${r.success ? 'ok' : 'FAIL'} ${r.durationMs}ms${attempt}${foreign}${blocked}${denied} ${clip(flat(r.summary), 140)}${error}`
        );
        break;
      }

      case 'db_query':
      case 'crm_browser': {
        const rest = { ...r };
        delete rest.ts;
        delete rest.kind;
        const tag = r.kind === 'db_query' ? 'DB' : 'BROWSER';
        out(`${tag} ${clip(json(rest), 220)}`);
        break;
      }

      case 'error': {
        counts.errors++;
        out(`ERROR ${clip(flat(r.message), 300)}`);
        break;
      }

      case 'turn_end': {
        out(`TURN_END ${r.elapsedMs / 1000}s`);
        break;
      }

      case 'chat_start': {
        out('CHAT_START');
        break;
      }

      default:
        break;
    }
  }

  lines.push(
    `turns=${counts.turns} tool_errors=${counts.toolErrors} denied=${counts.denied} asks=${counts.asks} crm_fails=${counts.crmFails} errors=${counts.errors}`
  );
  return lines;
}

function knowledgeNotes(logsDir, dates) {
  const file = path.join(logsDir, 'knowledge-notes.md');
  if (!fs.existsSync(file)) return null;
  const wanted = new Set(dates);
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let include = false;
  let skipping = false;

  for (const line of rows) {
    if (line.startsWith('## ')) {
      const m = /^## (\d{4}-\d{2}-\d{2})/.exec(line);
      include = !!m && wanted.has(m[1]);
      skipping = false;
      if (include) out.push(line);
      continue;
    }
    if (!include || skipping) continue;
    if (line.trim() === '<choices>') {
      skipping = true;
      continue;
    }
    out.push(line);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = [];
  let dates = [];

  if (args.chat) {
    files.push({ file: path.resolve(args.chat), label: args.chat });
  }

  if (args.logsDir) {
    const chatsDir = path.join(args.logsDir, 'chats');
    if (fs.existsSync(chatsDir)) {
      dates = listDates(chatsDir, args.since);
      if (!args.chat) {
        for (const d of dates) {
          for (const file of listJsonl(path.join(chatsDir, d))) {
            files.push({ file, label: `${d}/${path.basename(file)}` });
          }
        }
      }
    } else if (!args.chat) {
      fail(`No chats folder: ${chatsDir}`);
    }
  }

  const out = [];
  for (const f of files) {
    out.push(...summarizeFile(f.file, f.label));
  }

  if (args.logsDir) {
    const notes = knowledgeNotes(args.logsDir, dates);
    if (notes) {
      const period = (args.since ? `since ${args.since}: ` : '') + (dates.join(', ') || 'no dates');
      out.push(`=== knowledge-notes.md (${period})`);
      out.push(...notes);
    }
  }

  process.stdout.write(out.join('\n') + '\n');
}

try {
  main();
} catch (err) {
  fail(err && err.message ? err.message : String(err));
}
