# dx-dz-plugin-broadcom-ad-tdm — Claude orientation

A **standalone dx-dz operator plugin** for Broadcom TDM. This repo is developed
independently (its own git history/CI), like the sibling `broadcom-tdm-client`. It
is NOT part of the `dx-dz` workspace.

## What it is

- Manifest identity: **`@dxdz/plugin-broadcom-ad-tdm`** (`libs/plugin/plugin.json`).
- Authored against **`@dx-dz/plugin-sdk`** (published; the operator-authoring surface —
  `OperatorBehavior`, `FormDef`, `Ctx`, manifest/integrity tooling). It's a **devDependency**:
  type-only, erased at bundle time.
- Wraps **`@bims-ad/tdm-client`** (published; `loginToTdm`, `createTdmClients`,
  `jobEngine.getAllJobs`, …) — a runtime dep, **inlined** into the bundle.
- Ships as ONE self-contained `dist/index.js` (`tools/bundle-plugin.mjs` = `bun build`
  `target:'node'`, `--no-external`). Distribution is a **GitHub Release zip** (URL+SRI),
  acquired by `dxdz plugins-add --github/--url/--path`. NOT published to npm.

## Conventions (inherited from the workspace)

- **bun** package manager (`bun@1.3.13`), Node 24 (`.nvmrc`), nx monorepo (one lib).
- **Conventional commits** (husky + commitlint). Valid types only — `feat`/`fix`/`docs`/
  `chore`/`refactor`/`test`/`ci` (NOT `feature`/`decision`).
- `package.json` scripts are thin — logic lives in `tools/*.mjs`. No `postinstall`.
- Operators: one `*.operator.ts` per operator exporting a typed `OperatorBehavior`;
  `plugin.json#operators[]` maps `operatorId → exportName`; `src/index.ts` re-exports each.
  The version is single-sourced from `package.json#version` (stamped into `plugin.json`
  by the bundler) — operators do NOT declare `pluginVersion`.

## Build target nuance

The plugin's `build` is the **bun bundle** (not tsc) — defined explicitly in
`libs/plugin/project.json` (`nx:run-commands`). `typecheck` is a separate explicit
`tsc --noEmit`. `test`/`lint` are inferred by `@nx/vitest`/`@nx/eslint`. There is no
`@nx/js/typescript` plugin (it would infer a conflicting tsc `build`).

## Roadmap (dx-dz TDM milestone, Phase 3)

- **#432/#433 (DONE — foundation):** skeleton + `echo` placeholder operator, bundled +
  acquired-into-editor. Proves the SDK-bundling path with no TDM auth.
- **#434:** content-hash seal (`plugin.lock.json`) + CI seal-verify + release job (#435).
- **#437:** TDM connection — `<alias>.tdm.config.json` = `{origin,username,password,insecureTls?}`
  as a JSON global secret `tdmProfile<Alias>`; transparent alias (no "Login" operator);
  JWT cached module-scoped (TTL from `loginToTdm`'s `expiresAt`). Needs a small dx-dz-core
  change: `role:'tdm-connection'` field marker → analyzer `tdmProfiles`.
- **#439+:** real operators (List Jobs via `getAllJobs`), then run/deploy.

Verify the acquisition end-to-end from the dx-dz repo:
`bun apps/headless/src/main.ts plugins-add --path <this>/libs/plugin --repo <flow-repo>`.
