// fetch-platform-packages: downloads native per-platform packages for the given
// targets into node_modules, so electron-builder can bundle them.
//
// Usage:
//   node scripts/fetch-platform-packages.mjs <platform> <arch> [<platform> <arch> ...]
//   e.g. node scripts/fetch-platform-packages.mjs darwin x64 darwin arm64
//
// Why: npm installs only the optional platform packages that match the host
// (@anthropic-ai/claude-agent-sdk-<platform>-<arch>, @cursor/sdk-<platform>-<arch>).
// electron-builder needs the packages for each target platform, so they are
// fetched here with `npm pack` and unpacked into node_modules.
// Requires Node 20+. No dependencies.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const args = process.argv.slice(2);

if (args.length === 0 || args.length % 2 !== 0) {
  console.error('Укажите пары <platform> <arch>, например: darwin x64');
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonOrNull(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

const sdkVersions = {
  '@anthropic-ai/claude-agent-sdk': readJson(
    path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json'),
  ).version,
  '@cursor/sdk': readJson(path.join(root, 'node_modules', '@cursor', 'sdk', 'package.json')).version,
};

const packages = [];
for (let i = 0; i < args.length; i += 2) {
  const platform = args[i];
  const arch = args[i + 1];
  packages.push(
    { name: `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`, base: '@anthropic-ai/claude-agent-sdk' },
    { name: `@cursor/sdk-${platform}-${arch}`, base: '@cursor/sdk' },
  );
}

for (const { name, base } of packages) {
  const version = sdkVersions[base];
  const target = path.join(root, 'node_modules', ...name.split('/'));
  const installed = readJsonOrNull(path.join(target, 'package.json'));

  if (installed?.version === version) {
    console.log(`already present: ${name}@${version}`);
    continue;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpmsoft-pkg-'));
  try {
    execFileSync(
      isWin ? 'npm.cmd' : 'npm',
      ['pack', `${name}@${version}`, '--pack-destination', tmp, '--silent'],
      { stdio: ['ignore', 'ignore', 'inherit'], shell: isWin },
    );

    const tgzFiles = fs.readdirSync(tmp).filter((file) => file.endsWith('.tgz'));
    if (tgzFiles.length !== 1) {
      throw new Error(`expected one .tgz for ${name}@${version}, got: ${tgzFiles.join(', ') || 'none'}`);
    }

    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(tmp, tgzFiles[0]), '-C', target, '--strip-components=1'], {
      stdio: 'inherit',
    });
    console.log(`fetched ${name}@${version}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
