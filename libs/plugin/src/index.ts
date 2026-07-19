/**
 * `@dxdz/plugin-broadcom-ad-tdm` — a standalone dx-dz operator plugin for
 * Broadcom TDM (Test Data Manager).
 *
 * Operators ship as bundled `OperatorBehavior` exports; the daemon's plugin
 * loader resolves them by `exportName` per `plugin.json`'s `operators[]` list.
 * The bundle is self-contained (no externals) — the SDK + the TDM client are
 * inlined at build time; runtime services arrive via `ctx`.
 */
export { echoOperator } from './operators/echo.operator.js';
