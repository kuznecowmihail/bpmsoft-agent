#!/usr/bin/env node
'use strict';

// Сводка транскриптов прогона эвалов: node summarize.js <папка прогона>

const fs = require('fs');
const path = require('path');

const RUNNER_KINDS = ['preflight', 'baseline_update', 'final_reset', 'final_reset_error', 'stop', 'error', 'setup', 'teardown', 'setup_sql'];
const SKIP_TOOLS = /^(Read|Grep|Glob|LS|read_file|grep_files|glob_files|list_dir)$/;

function oneLine(s) {
  return String(s).replace(/\r?\n/g, ' / ');
}

function clip(s, max) {
  s = String(s);
  return s.length > max ? s.slice(0, max) : s;
}

function timeOf(t) {
  const d = new Date(t);
  return isNaN(d.getTime()) ? '--:--:--' : d.toISOString().slice(11, 19);
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

function summarizeFile(filePath) {
  const lines = [];
  let tools = 0;
  let crmFails = 0;
  let turns = 0;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (!r || typeof r !== 'object') continue;
    const time = timeOf(r.t);

    if (RUNNER_KINDS.includes(r.kind)) {
      const rest = {};
      for (const k of Object.keys(r)) {
        if (k !== 't' && k !== 'kind') rest[k] = r[k];
      }
      lines.push(`${time} ${r.kind} ${clip(safeJson(rest), 300)}`);
    } else if (r.kind === 'user') {
      turns++;
      lines.push(`${time} RUNNER → ${clip(oneLine(r.text ?? ''), 300)}`);
    } else if (r.kind === 'crm_action') {
      if (!r.success) crmFails++;
      let s = `${time} CRM ${r.action} ${r.success ? 'ok' : 'FAIL'} ${r.durationMs}ms ${clip(r.summary ?? '', 150)}`;
      if (r.error) s += ` | ${clip(r.error, 200)}`;
      lines.push(s);
    } else if (r.kind === 'event' && r.event) {
      const ev = r.event;
      if (ev.type === 'tool_use') {
        if (!SKIP_TOOLS.test(String(ev.name))) {
          tools++;
          lines.push(`${time} TOOL ${ev.name} ${clip(safeJson(ev.input), 120)}`);
        } else {
          tools++;
        }
      } else if (ev.type === 'text') {
        const text = oneLine(ev.text ?? '');
        const out = text.length <= 400
          ? text
          : `${text.slice(0, 160)} … ${text.slice(-240)}`;
        lines.push(`${time} AGENT ${out}`);
      } else if (ev.type === 'result') {
        const usage = ev.usage ? safeJson(ev.usage) : '-';
        lines.push(`${time} RESULT success=${ev.success} usage=${usage} cost=${ev.totalCostUsd ?? '-'}`);
      }
    }
  }

  lines.push(`tools: ${tools}, crm fails: ${crmFails}, turns(user msgs): ${turns}`);
  return lines;
}

function main() {
  const runDir = process.argv[2];
  if (!runDir) {
    process.stderr.write('Usage: node summarize.js <runDir>\n');
    process.exit(1);
  }

  const out = [];
  const reportPath = path.join(runDir, 'report.md');
  if (fs.existsSync(reportPath)) {
    out.push('=== report.md');
    out.push(fs.readFileSync(reportPath, 'utf8'));
  }

  const files = fs.readdirSync(runDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  for (const f of files) {
    out.push(`=== ${f}`);
    out.push(...summarizeFile(path.join(runDir, f)));
  }

  process.stdout.write(out.join('\n') + '\n');
}

main();
