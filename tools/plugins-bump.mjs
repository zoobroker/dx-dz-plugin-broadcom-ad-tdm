#!/usr/bin/env bun
/**
 * Bump the plugin's version + re-seal `plugin.lock.json`.
 *
 *   bun run plugins:bump [patch|minor|major]   (default: patch)
 *
 * Rewrites `version` in package.json + plugin.json (surgical — preserves
 * formatting) and re-seals the lock at the new version + current content hash.
 * Run this whenever `plugins:verify` fails on drift (you changed the shipped
 * source), or to cut a fresh release version. Commit the result.
 */
import { join } from 'node:path';

import {
  PLUGIN_DIR,
  bumpVersion,
  computeContentHash,
  readLock,
  readPkgVersion,
  sealLock,
  stampVersionField,
} from './lib/plugin-version.mjs';

const level = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error(`usage: bun run plugins:bump [patch|minor|major] (got '${level}')`);
  process.exit(1);
}

const current = readPkgVersion();
const next = bumpVersion(current, level);
const lock = readLock();
const drifted = lock ? computeContentHash() !== lock.contentHash : true;

stampVersionField(join(PLUGIN_DIR, 'package.json'), next);
stampVersionField(join(PLUGIN_DIR, 'plugin.json'), next);
const sealed = sealLock();

console.log(`@dxdz/plugin-broadcom-ad-tdm  ${current} → ${next}  (${level})`);
console.log(`  ${drifted ? 'source drifted — ' : ''}re-sealed plugin.lock.json @ ${sealed.contentHash.slice(0, 22)}…`);
console.log('  commit package.json + plugin.json + plugin.lock.json together.');
