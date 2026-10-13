// electron-builder afterPack hook.
// Removes native per-platform packages built for other targets from the app's
// node_modules, and checks that the packages for this target are present.
// Missing packages are fetched with scripts/fetch-platform-packages.mjs.

const fs = require('node:fs');
const path = require('node:path');

const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };
const PLATFORM_RE = /^(darwin|win32|linux)-/;
const PAIRS = [
  ['@anthropic-ai', 'claude-agent-sdk-'],
  ['@cursor', 'sdk-'],
];

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = ARCH_NAMES[context.arch];
  const appDir =
    platform === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
          'app',
        )
      : path.join(context.appOutDir, 'resources', 'app');
  const nodeModules = path.join(appDir, 'node_modules');
  const target = `${platform}-${arch}`;

  for (const [scope, prefix] of PAIRS) {
    const scopeDir = path.join(nodeModules, scope);
    if (!fs.existsSync(scopeDir)) continue;
    for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(prefix)) continue;
      if (!PLATFORM_RE.test(entry.name.slice(prefix.length))) continue;
      if (entry.name === `${prefix}${target}`) continue;
      fs.rmSync(path.join(scopeDir, entry.name), { recursive: true, force: true });
      console.log(`afterPack: removed ${scope}/${entry.name}`);
    }
  }

  const hint = `Run: node scripts/fetch-platform-packages.mjs ${platform} ${arch}`;
  const claudeBinary = platform === 'win32' ? 'claude.exe' : 'claude';
  const requiredPaths = [
    path.join(nodeModules, '@anthropic-ai', `claude-agent-sdk-${target}`, claudeBinary),
    path.join(nodeModules, '@cursor', `sdk-${target}`),
  ];
  for (const required of requiredPaths) {
    if (!fs.existsSync(required)) {
      throw new Error(`afterPack: missing ${required}. ${hint}`);
    }
  }

  const knowledgeDir = path.join(nodeModules, '@bpmsoft-agent', 'agent-runtime', 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`afterPack: missing ${knowledgeDir}`);
  }
};
