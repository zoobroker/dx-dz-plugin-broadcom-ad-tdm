#!/usr/bin/env bun
/**
 * Print the plugin's current content hash + how it compares to the sealed
 * `plugin.lock.json`. Diagnostic only — the gate is `plugins:verify`.
 */
import { computeContentHash, effectiveVersion, readLock, readPkgVersion } from './lib/plugin-version.mjs';

const hash = computeContentHash();
const lock = readLock();
const eff = effectiveVersion();

console.log(`package.json version : ${readPkgVersion()}`);
console.log(`content hash         : ${hash}`);
console.log(`sealed hash          : ${lock ? lock.contentHash : '(no plugin.lock.json)'}`);
console.log(`sealed version       : ${lock ? lock.version : '—'}`);
console.log(
  eff.drifted
    ? `→ DRIFTED — source changed since seal; would publish as ${eff.version} after \`plugins:bump\``
    : `→ in sync${lock ? '' : ' (unsealed — run `plugins:bump` to seal)'}`,
);
