#!/usr/bin/env bun
/**
 * Surfaces dependency vulnerabilities before local builds.
 *
 * Skipped on CI, which has its own audit step plus the weekly-audit workflow —
 * failing CI on an advisory that landed overnight in a transitive dep would
 * block PRs that never touched it.
 *
 * --audit-level=high is load-bearing, not a preference. This workspace carries a
 * documented, accepted MODERATE (brace-expansion, dev-only via nx/eslint ->
 * minimatch) that cannot be overridden without breaking the Nx project graph —
 * see CLAUDE.md. Failing on moderates means `bun run build` exits 1 on a fresh
 * clone, forever, for something no developer can act on. Blocking on high and
 * critical keeps the signal actionable: if this fails, there is something to do.
 */
import { spawnSync } from 'node:child_process';

if (process.env.CI) {
  console.log('CI detected — skipping prebuild audit (ci.yml audits; weekly-audit.yml fixes)');
  process.exit(0);
}

const { status } = spawnSync('bun', ['audit', '--audit-level=high'], { stdio: 'inherit' });

if (status !== 0) {
  console.error('\nHigh or critical advisory found. Fix it, or pin it in package.json#overrides.');
}

process.exit(status ?? 0);
