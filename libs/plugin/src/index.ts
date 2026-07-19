/**
 * `@dxdz/plugin-broadcom-ad-tdm` — a standalone dx-dz operator plugin for
 * Broadcom TDM (Test Data Manager).
 *
 * Operators ship as bundled `OperatorBehavior` exports; the daemon's plugin
 * loader resolves them by `exportName` per `plugin.json`'s `operators[]`. The
 * bundle is self-contained (no externals) — `@bims-ad/tdm-client` (auth/session +
 * the typed SDK) and zod are inlined; the SDK's types are erased. All TDM auth
 * is a `secretRef` connection field → a cached `TdmSession` (see connection.ts).
 */
export { listJobsOperator } from './operators/list-jobs.operator.js';
export { getJobOperator } from './operators/get-job.operator.js';
export { listProjectsOperator } from './operators/list-projects.operator.js';
export { getProjectOperator } from './operators/get-project.operator.js';
export { listGeneratorsOperator } from './operators/list-generators.operator.js';
