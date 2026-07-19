#!/usr/bin/env bun
/**
 * Package the plugin into a GitHub-Release artifact (P3-C/D).
 *
 * Produces `release/dx-dz-plugin-broadcom-ad-tdm-v<version>.zip` — a two-entry
 * archive holding `plugin.json` + `index.js` at the ROOT (by basename), the
 * exact shape the dx-dz daemon's `extractPluginBundle` (fflate `unzipSync`)
 * reads. Built with fflate (not a system `zip` CLI) so it's cross-platform +
 * format-identical to the extractor. Plus a `<zip>.sha256` sidecar for humans.
 *
 * The SRI a consumer's lockfile pins is computed by the daemon over the
 * `index.js` bytes on acquisition — so this zip just has to be a valid archive
 * containing the manifest + bundle; its internal compression is irrelevant.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { zipSync } from 'fflate';

import { PLUGIN_DIR, WORKSPACE_ROOT, readPkgVersion } from './lib/plugin-version.mjs';

const REPO_SLUG = 'dx-dz-plugin-broadcom-ad-tdm';

// 1. Re-bundle minified — the release artifact is release-grade (smaller, opaque).
const built = spawnSync('bun', ['tools/bundle-plugin.mjs', 'libs/plugin', '--minify'], {
  cwd: WORKSPACE_ROOT,
  stdio: 'inherit',
});
if (built.status !== 0) {
  console.error('release aborted — plugin bundle failed');
  process.exit(built.status ?? 1);
}

const version = readPkgVersion();
const indexJs = join(PLUGIN_DIR, 'dist', 'index.js');
const manifest = join(PLUGIN_DIR, 'plugin.json');
if (!existsSync(indexJs)) {
  console.error(`release aborted — missing bundle ${indexJs}`);
  process.exit(1);
}

// 2. Two-entry archive by basename: plugin.json + index.js at the root.
const zip = zipSync({
  'plugin.json': new Uint8Array(readFileSync(manifest)),
  'index.js': new Uint8Array(readFileSync(indexJs)),
});

const outDir = join(WORKSPACE_ROOT, 'release');
mkdirSync(outDir, { recursive: true });
const zipName = `${REPO_SLUG}-v${version}.zip`;
const zipPath = join(outDir, zipName);
writeFileSync(zipPath, zip);

// 3. sha256 sidecar (shasum format) for download verification.
const sha = createHash('sha256').update(zip).digest('hex');
writeFileSync(`${zipPath}.sha256`, `${sha}  ${zipName}\n`);

console.log(`packaged ${zipName}  (${(zip.length / 1024).toFixed(0)} KB)  sha256:${sha.slice(0, 12)}…`);
console.log(`release tag: v${version}`);
