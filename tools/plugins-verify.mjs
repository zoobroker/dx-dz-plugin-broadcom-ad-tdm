#!/usr/bin/env bun
/**
 * The content-hash drift GATE (runs in CI + `.husky/pre-push`).
 *
 * Fails when the plugin's shipped source changed without a version bump —
 * i.e. the current content hash disagrees with the one sealed in
 * `plugin.lock.json`. That would let two different bundles ship under one
 * `name@version`, silently resolving the wrong code on any pin. Fix by running
 * `bun run plugins:bump [patch|minor|major]` and committing the re-seal.
 *
 * Also checks the sealed version matches `package.json#version` (the single
 * source of truth) so the lock can't fall behind a hand-edited version.
 */
import { computeContentHash, readLock, readPkgVersion } from './lib/plugin-version.mjs';

const fail = (msg) => {
  console.error(`✗ plugins:verify — ${msg}`);
  process.exit(1);
};

const lock = readLock();
if (!lock) fail('no plugin.lock.json — run `bun run plugins:bump` to seal the plugin.');

const pkgVersion = readPkgVersion();
const hash = computeContentHash();

if (lock.version !== pkgVersion) {
  fail(
    `sealed version (${lock.version}) ≠ package.json version (${pkgVersion}). ` +
      'Re-seal with `bun run plugins:bump` after any manual version edit.',
  );
}

if (lock.contentHash !== hash) {
  fail(
    'plugin source changed since the last seal but the version was not bumped.\n' +
      `    sealed  : ${lock.version}  ${lock.contentHash}\n` +
      `    current :        ${hash}\n` +
      '    Run `bun run plugins:bump [patch|minor|major]` and commit the re-seal.',
  );
}

console.log(`✓ plugins:verify — @dxdz/plugin-broadcom-ad-tdm@${pkgVersion} sealed & in sync.`);
