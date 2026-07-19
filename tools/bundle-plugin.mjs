#!/usr/bin/env bun
/**
 * Bundle the plugin into a single self-contained `dist/index.js`.
 *
 * dx-dz plugins are distributed as one entrypoint file: the daemon loads a
 * plugin by dynamic-importing its bundle, so ALL dependencies (the operator
 * code, zod, and — later — the TDM client) must be inlined at build time. The
 * plugin never imports dx-dz internals at runtime; the services operators need
 * arrive via `ctx`. `@dx-dz/plugin-sdk` is type-only here, so it's erased.
 *
 * `target: 'node'` (not 'bun') keeps the bundle from emitting Bun-specific
 * `import.meta.require` calls — the daemon dynamic-imports via plain `import()`,
 * which hits "__require is not a function" under `target: 'bun'`. Node-targeted
 * ESM runs identically under Bun.
 *
 * After bundling, stamps `plugin.json#version` from `package.json#version` so the
 * manifest version has a single source of truth. (#434 will add the content-hash
 * seal + drift gate; the foundation keeps this deliberately simple.)
 *
 * Usage: bun tools/bundle-plugin.mjs <plugin-dir> [--minify]
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { effectiveVersion, stampVersionField } from './lib/plugin-version.mjs';

const args = process.argv.slice(2);
const minify = args.includes('--minify');
const pluginDir = args.find((a) => !a.startsWith('--'));
if (!pluginDir) {
  console.error('usage: bun tools/bundle-plugin.mjs <plugin-dir> [--minify]');
  process.exit(1);
}

const absDir = resolve(pluginDir);
const result = await Bun.build({
  entrypoints: [`${absDir}/src/index.ts`],
  outdir: `${absDir}/dist`,
  target: 'node',
  format: 'esm',
  splitting: false,
  minify,
});

if (!result.success) {
  console.error('plugin bundle failed:');
  for (const message of result.logs) console.error(`  ${String(message)}`);
  process.exit(1);
}

const sizeKb = Math.round((result.outputs[0]?.size ?? 0) / 1024);
console.log(`bundled ${pluginDir} → dist/index.js (${sizeKb} KB)`);

// Stamp plugin.json's version from the seal-aware effective version (see
// tools/lib/plugin-version.mjs): the sealed version when in sync, else the
// PENDING next-patch on drift (with a warning) so a locally-built plugin
// resolves at the version it will publish as. `plugins:verify` (CI + pre-push)
// is the hard gate.
if (existsSync(`${absDir}/package.json`) && existsSync(`${absDir}/plugin.json`)) {
  const eff = effectiveVersion(absDir);
  const changed = stampVersionField(`${absDir}/plugin.json`, eff.version);
  if (eff.drifted) {
    console.warn(
      `⚠ ${pluginDir}: source changed since the last seal — stamped pending v${eff.version} ` +
        `(package.json is v${eff.pkgVersion}). Run \`bun run plugins:bump [patch|minor|major]\` ` +
        `before pushing; pre-push + CI hard-fail on drift.`,
    );
  } else if (changed) {
    console.log(`stamped ${pluginDir}/plugin.json version → ${eff.version}`);
  }
}
