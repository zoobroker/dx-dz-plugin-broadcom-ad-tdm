/**
 * Plugin versioning + content-hash drift gate (P3 Workstream B, adapted for a
 * single-plugin standalone repo).
 *
 * The premise: a plugin's published identity is `name@version`, so ANY byte
 * change to its shipped source must come with a version bump — otherwise two
 * different bundles ship under one version and lockfile pins silently resolve
 * the wrong code. We enforce that with a content hash sealed into a committed
 * `plugin.lock.json`, independent of commit messages.
 *
 * Single source of truth for the version stays `libs/plugin/package.json#version`;
 * this layer adds the lock + the drift comparison on top. Shared by
 * `tools/plugins-{hash,bump,verify}.mjs` and `tools/bundle-plugin.mjs`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_ROOT = resolve(HERE, '..', '..');
/** This repo ships exactly one plugin. */
export const PLUGIN_DIR = join(WORKSPACE_ROOT, 'libs', 'plugin');
const LOCK_FILENAME = 'plugin.lock.json';

/**
 * Deterministic content hash of the plugin. Covers everything that shapes the
 * SHIPPED bundle and is human-authored:
 *   - every file under `src/**` (recursive, sorted) EXCEPT `*.spec.ts` /
 *     `*.test.ts` (tests aren't bundled, so they don't force a bump), hashed by
 *     raw bytes;
 *   - `package.json` and `plugin.json`, canonicalized (sorted keys) with the
 *     `version` field REMOVED.
 *
 * Excluding `version` is load-bearing: the bundler stamps `plugin.json`'s
 * version every build and `plugins:bump` rewrites both — if the hash included
 * it, sealing would never converge. The hash answers "did the authored content
 * change?", not "did the version number change?".
 */
export function computeContentHash(pluginDir = PLUGIN_DIR) {
  const h = createHash('sha256');
  for (const file of listSrcFiles(join(pluginDir, 'src'))) {
    h.update('F ' + relative(pluginDir, file).split('\\').join('/') + ' ');
    h.update(readFileSync(file));
    h.update(' ');
  }
  h.update('PKG ' + canonicalJsonMinusVersion(join(pluginDir, 'package.json')) + ' ');
  h.update('MANIFEST ' + canonicalJsonMinusVersion(join(pluginDir, 'plugin.json')) + ' ');
  return 'sha256-' + h.digest('hex');
}

/** Read + parse `plugin.lock.json`, or `null` if it doesn't exist. */
export function readLock(pluginDir = PLUGIN_DIR) {
  const lockPath = join(pluginDir, LOCK_FILENAME);
  if (!existsSync(lockPath)) return null;
  return JSON.parse(readFileSync(lockPath, 'utf8'));
}

/**
 * Seal the lock at the CURRENT package.json version + current content hash.
 * Used by `plugins:bump` (after it sets the new version) and the initial seed.
 */
export function sealLock(pluginDir = PLUGIN_DIR) {
  const version = readPkgVersion(pluginDir);
  const contentHash = computeContentHash(pluginDir);
  const lock = {
    $comment: 'Sealed by `bun run plugins:bump` (P3 content-hash drift gate). Do not hand-edit.',
    version,
    contentHash,
  };
  writeFileSync(join(pluginDir, LOCK_FILENAME), JSON.stringify(lock, null, 2) + '\n');
  return lock;
}

export function readPkgVersion(pluginDir = PLUGIN_DIR) {
  return readJsonVersion(join(pluginDir, 'package.json'));
}

export function readManifestVersion(pluginDir = PLUGIN_DIR) {
  return readJsonVersion(join(pluginDir, 'plugin.json'));
}

/**
 * Surgically rewrite ONLY the `"version"` field value in a JSON file,
 * preserving hand-formatting. Returns true if it changed the file.
 */
export function stampVersionField(filePath, newVersion) {
  const raw = readFileSync(filePath, 'utf8');
  const field = /("version"\s*:\s*")([^"]*)(")/;
  const match = raw.match(field);
  if (!match) throw new Error(`${filePath} has no "version" field to stamp`);
  if (match[2] === newVersion) return false;
  writeFileSync(filePath, raw.replace(field, `$1${newVersion}$3`));
  return true;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseSemver(version) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`not a semver version: '${version}'`);
  return { major: +m[1], minor: +m[2], patch: +m[3], prerelease: m[4] };
}

/** Bump a semver core by `level` (default `patch`). Drops any prerelease tag. */
export function bumpVersion(version, level = 'patch') {
  const { major, minor, patch } = parseSemver(version);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump level '${level}' (expected patch|minor|major)`);
}

/**
 * The version a local build should stamp into `plugin.json`:
 *   - source matches the sealed lock → the sealed `package.json` version;
 *   - source has DRIFTED → the PENDING next-patch version (`drifted: true`) so a
 *     locally-authored flow pins a version that isn't published yet, failing
 *     SAFE instead of silently resolving stale published content;
 *   - no lock yet → the `package.json` version verbatim (`reason: 'no-lock'`).
 */
export function effectiveVersion(pluginDir = PLUGIN_DIR) {
  const pkgVersion = readPkgVersion(pluginDir);
  const hash = computeContentHash(pluginDir);
  const lock = readLock(pluginDir);
  if (!lock) return { version: pkgVersion, drifted: false, pkgVersion, hash, reason: 'no-lock' };
  if (hash === lock.contentHash) return { version: pkgVersion, drifted: false, pkgVersion, hash };
  return { version: bumpVersion(pkgVersion, 'patch'), drifted: true, pkgVersion, hash };
}

// ---------------------------------------------------------------------------
// internals

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listSrcFiles(srcDir) {
  const out = [];
  if (!existsSync(srcDir)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (isDir(p)) {
        walk(p);
        continue;
      }
      if (p.endsWith('.spec.ts') || p.endsWith('.test.ts')) continue;
      out.push(p);
    }
  };
  walk(srcDir);
  return out;
}

function readJsonVersion(filePath) {
  const v = JSON.parse(readFileSync(filePath, 'utf8')).version;
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${filePath} has no usable "version"`);
  }
  return v;
}

function canonicalJsonMinusVersion(filePath) {
  const obj = JSON.parse(readFileSync(filePath, 'utf8'));
  delete obj.version;
  return canonicalize(obj);
}

/** Stable stringify: object keys sorted recursively, so a key-order or
 *  whitespace reformat of package.json/plugin.json doesn't move the hash. */
function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonicalize(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
