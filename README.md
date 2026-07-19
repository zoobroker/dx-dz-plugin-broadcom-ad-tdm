# dx-dz-plugin-broadcom-ad-tdm

A **standalone [dx-dz](https://github.com/zoobroker/dx-dz) operator plugin** for
**Broadcom TDM** (Test Data Manager). Manifest identity: `@dxdz/plugin-broadcom-ad-tdm`.

It adds TDM operators (list jobs, …) to the dx-dz operator catalog. The plugin is
authored against the published [`@dx-dz/plugin-sdk`](https://www.npmjs.com/package/@dx-dz/plugin-sdk)
and wraps [`@bims-ad/tdm-client`](https://www.npmjs.com/package/@bims-ad/tdm-client),
then ships as a single self-contained bundle.

## How it's consumed

Not via npm. dx-dz acquires plugins from a **GitHub Release zip** (URL + SRI):

```bash
# from a flow repo, once a release exists:
dxdz plugins-add --github zoobroker/dx-dz-plugin-broadcom-ad-tdm
# local dev loop (build first):
dxdz plugins-add --path /path/to/dx-dz-plugin-broadcom-ad-tdm/libs/plugin --repo <flow-repo>
```

## Layout

```
libs/plugin/
  src/
    index.ts                    # exports each operator (resolved by plugin.json)
    plugin-name.ts              # single-sourced manifest identity
    operators/*.operator.ts     # OperatorBehavior definitions
  plugin.json                   # manifest (operatorId → exportName); version stamped from package.json
  project.json                  # nx build (bun bundle) + typecheck targets
tools/bundle-plugin.mjs         # bun build --no-external → dist/index.js
```

## Develop

```bash
bun install
bun run typecheck && bun run lint && bun run test
bun run build          # → libs/plugin/dist/index.js
```

`build` produces a self-contained bundle (the SDK's types are erased; `zod` and the
TDM client are inlined). Distribution is the release zip (see `.github/workflows`).

## Status

**Foundation** (echo placeholder operator) — proves the SDK-bundling + acquisition
pipeline. The real TDM connection (profile → JWT) and operators land next.

## License

MIT.
