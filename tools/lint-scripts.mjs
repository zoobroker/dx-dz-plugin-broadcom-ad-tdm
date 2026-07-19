#!/usr/bin/env bun
/**
 * Enforces the workspace's package.json script conventions. Runs on pre-commit.
 *
 * These rules are otherwise unenforceable: package.json scripts get no linting,
 * no syntax highlighting, and no test coverage, so logic placed in them rots
 * silently. Checks:
 *
 *   1. Forbidden lifecycle hooks — postinstall/preinstall/install. Hard rule, no
 *      exceptions; they execute arbitrary code on every install and are the
 *      primary npm supply-chain vector.
 *   2. Tool references that don't exist — `bun tools/foo.mjs` where the file was
 *      deleted or renamed.
 *   3. Orphan tools/*.mjs — on disk but referenced by no script, no project.json
 *      command, and no peer tool. Surfaces dead recipes.
 *   4. Thin-script violations: inline `-e` blobs, `node` invoking a local script
 *      (use bun), `;` separators, `&&` chains longer than two real commands.
 *   5. Required root scripts — build, test, lint, typecheck.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TOP_LEVEL_DIRS = ['apps', 'libs', 'e2e', 'shared'];
const FORBIDDEN_HOOKS = ['postinstall', 'preinstall', 'install'];
const REQUIRED_ROOT_SCRIPTS = ['build', 'test', 'lint', 'typecheck'];

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

/** Every package.json in the workspace: root + one level under each top-level dir. */
async function packageJsonPaths() {
  const found = ['package.json'];
  for (const dir of TOP_LEVEL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = `${dir}/${entry.name}/package.json`;
      if (existsSync(p)) found.push(p);
    }
  }
  return found;
}

function checkScript(where, name, cmd) {
  if (/\s-e\s+["']/.test(cmd)) {
    fail(where, `script "${name}" has an inline -e blob — move it to tools/<name>.mjs`);
  }
  if (/(^|\s)node\s+[^\s]+\.(mjs|ts|js)(\s|$)/.test(cmd)) {
    fail(where, `script "${name}" invokes a local script with node — use bun`);
  }
  if (cmd.includes(';')) {
    fail(where, `script "${name}" uses ';' as a separator — move it to tools/<name>.mjs`);
  }
  const chained = cmd.split('&&').length;
  if (chained > 2) {
    fail(where, `script "${name}" chains ${chained} commands with && — move it to tools/<name>.mjs`);
  }
}

const referencedTools = new Set();
const TOOL_RE = /tools\/([\w.-]+\.mjs)/g;

for (const path of await packageJsonPaths()) {
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  const scripts = pkg.scripts ?? {};

  for (const hook of FORBIDDEN_HOOKS) {
    if (hook in scripts) {
      fail(path, `forbidden lifecycle hook "${hook}" — generate files via an Nx target with dependsOn instead`);
    }
  }

  for (const [name, cmd] of Object.entries(scripts)) {
    checkScript(path, name, cmd);
    for (const m of cmd.matchAll(TOOL_RE)) referencedTools.add(m[1]);
  }

  if (path === 'package.json') {
    for (const req of REQUIRED_ROOT_SCRIPTS) {
      if (!(req in scripts)) fail(path, `missing required root script "${req}"`);
    }
  }
}

// project.json commands reference tools too.
for (const dir of TOP_LEVEL_DIRS) {
  if (!existsSync(dir)) continue;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}/project.json`;
    if (!entry.isDirectory() || !existsSync(p)) continue;
    for (const m of (await readFile(p, 'utf8')).matchAll(TOOL_RE)) referencedTools.add(m[1]);
  }
}

const onDisk = existsSync('tools')
  ? (await readdir('tools')).filter((f) => f.endsWith('.mjs'))
  : [];

// A tool imported by another tool counts as reachable.
const importedByPeer = new Set();
for (const file of onDisk) {
  for (const m of (await readFile(`tools/${file}`, 'utf8')).matchAll(TOOL_RE)) {
    importedByPeer.add(m[1]);
  }
}

for (const ref of referencedTools) {
  if (!onDisk.includes(ref)) fail('tools', `referenced but missing: tools/${ref}`);
}
for (const file of onDisk) {
  if (!referencedTools.has(file) && !importedByPeer.has(file)) {
    fail('tools', `orphan: tools/${file} is referenced by no script, project.json, or peer tool`);
  }
}

if (errors.length) {
  console.error(`\nScript convention violations (${errors.length}):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`Script conventions OK — ${onDisk.length} tools, all reachable.`);
