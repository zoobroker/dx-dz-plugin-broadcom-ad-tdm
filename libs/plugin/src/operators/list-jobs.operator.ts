import { createJobsApi, jobFilter, jobIdOf, type Job } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';
import { renderTemplate } from '../templating.js';

/**
 * TDM: List Jobs — the *discover* half of Approach-A job monitoring. Returns the
 * N most recent jobs newest-first, correctly paged (1-indexed) + deduped by
 * jobId via the client's `recent()` primitive (the TDM job list's pagination is
 * quirky; the client encodes the gotchas).
 *
 * The origin filter is a **multi-select** (toggles): the TDM `q` string is
 * origin-leading and takes ONE origin (and a projectId-only filter 500s), so we
 * fan out **one query per selected origin** — each carrying the projectId/type
 * filter — then merge, dedupe by jobId, re-sort by the chosen field, and trim to
 * `total`. Net: the `total` most-recent jobs ACROSS the selected origins, with a
 * projectId filter that "just works" instead of a raw 500.
 */

/** The TDM job origins, as (config key → wire value). Defaults to flow_origin. */
const ORIGINS = [
  { key: 'flowOrigin', value: 'flow_origin' },
  { key: 'generation', value: 'generation' },
  { key: 'datamodel', value: 'datamodel' },
  { key: 'masking', value: 'masking' },
  { key: 'modeling', value: 'modeling' },
] as const;

const ListJobsConfigSchema = z.object({
  connection: z.string().default(''),
  total: z.number().int().positive().default(200),
  // An unset/cleared select serializes ''; coerce to the default so the enum
  // never sees an invalid member. Only `id` (jobId) + `name` sort reliably
  // server-side — timestamps sort only to ~minute precision (id as tiebreak).
  sort: z.preprocess((v) => (v === '' ? 'id' : v), z.enum(['id', 'name'])).default('id'),
  order: z.preprocess((v) => (v === '' ? 'desc' : v), z.enum(['asc', 'desc'])).default('desc'),
  // Origin multi-select — one toggle per origin; flow_origin on by default.
  flowOrigin: z.boolean().default(true),
  generation: z.boolean().default(false),
  datamodel: z.boolean().default(false),
  masking: z.boolean().default(false),
  modeling: z.boolean().default(false),
  projectId: z.string().default(''),
  type: z.string().default(''),
});
type ListJobsConfig = z.infer<typeof ListJobsConfigSchema>;

/** The wire origin values whose toggle is on, in catalog order. */
function selectedOrigins(config: ListJobsConfig): string[] {
  return ORIGINS.filter((o) => config[o.key]).map((o) => o.value);
}

/** Dedupe jobs by numeric jobId (first wins); jobs without a jobId are all kept. */
function dedupeByJobId(jobs: Job[]): Job[] {
  const seen = new Set<number>();
  const out: Job[] = [];
  for (const job of jobs) {
    const id = jobIdOf(job);
    if (id === undefined) {
      out.push(job);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(job);
  }
  return out;
}

/** Re-sort a merged set by the chosen field/order; undefined keys sort last. */
function sortJobs(jobs: Job[], sort: 'id' | 'name', order: 'asc' | 'desc'): Job[] {
  const dir = order === 'asc' ? 1 : -1;
  return [...jobs].sort((a, b) => {
    if (sort === 'name') {
      const an = a.name,
        bn = b.name;
      if (an === undefined) return 1;
      if (bn === undefined) return -1;
      return dir * an.localeCompare(bn);
    }
    const ai = jobIdOf(a),
      bi = jobIdOf(b);
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return dir * (ai - bi);
  });
}

export const listJobsOperator: OperatorBehavior<ListJobsConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'list-jobs',
  category: 'step',

  display: {
    displayName: 'TDM: List Jobs',
    description: 'The most recent TDM jobs, newest-first (paged + deduped) — the discover half of job monitoring.',
    family: 'Broadcom TDM',
    icon: 'format_list_bulleted',
    titleTemplate: 'TDM: List Jobs',
    searchKeywords: ['tdm', 'broadcom', 'jobs', 'monitor', 'list'],
  },

  configSchema: ListJobsConfigSchema,
  configDefaults: { total: 200, sort: 'id', order: 'desc', flowOrigin: true },
  configForm: {
    sections: [
      { id: 'connection', title: 'Connection', fields: [connectionField] },
      {
        id: 'query',
        title: 'Query',
        fields: [
          {
            key: 'total',
            label: 'Max jobs',
            widget: 'number',
            hint: 'How many jobs to return across all selected origins (merged, deduped, trimmed). Size above a period’s volume for watermark discovery.',
            widgetOptions: { min: 1 },
          },
          {
            key: 'sort',
            label: 'Sort by',
            widget: 'select',
            hint: 'Field to sort the merged result on. Only `id` (jobId) and `name` sort reliably — timestamps sort coarsely (~minute, id as tiebreak).',
            widgetOptions: {
              options: [
                { value: 'id', label: 'Job id' },
                { value: 'name', label: 'Name' },
              ],
            },
          },
          {
            key: 'order',
            label: 'Order',
            widget: 'select',
            hint: 'Sort direction.',
            widgetOptions: {
              options: [
                { value: 'desc', label: 'Descending (newest first)' },
                { value: 'asc', label: 'Ascending' },
              ],
            },
          },
          {
            key: 'flowOrigin',
            label: 'Origin: flow_origin',
            widget: 'toggle',
            hint: 'Origins to include. Each selected origin is queried separately, then merged — pick one or more.',
          },
          { key: 'generation', label: 'Origin: generation', widget: 'toggle' },
          { key: 'datamodel', label: 'Origin: datamodel', widget: 'toggle' },
          { key: 'masking', label: 'Origin: masking', widget: 'toggle' },
          { key: 'modeling', label: 'Origin: modeling', widget: 'toggle' },
          {
            key: 'projectId',
            templated: true,
            label: 'Project id filter',
            widget: 'text',
            hint: 'Optional — restrict to one project. Requires at least one origin selected above (a project-id-only filter 500s). Liquid-templated.',
          },
          {
            key: 'type',
            templated: true,
            label: 'Type filter',
            widget: 'text',
            hint: 'Optional — restrict to one job type (PUBLISH / GROUPJOB / DELETEGENERATOR / …). Liquid-templated.',
          },
        ],
      },
    ],
  },

  outputs: [{ name: 'out' }],
  captureByteCap: 1_000_000,

  async execute(ctx, input, config) {
    const session = await getTdmSession(config.connection);
    const projectIdStr = renderTemplate(ctx, input, config.projectId).trim();
    const type = renderTemplate(ctx, input, config.type).trim();

    let projectId: number | undefined;
    if (projectIdStr !== '') {
      projectId = Number(projectIdStr);
      if (!Number.isInteger(projectId)) {
        throw new Error(`Project id filter must be an integer, got '${projectIdStr}'.`);
      }
    }

    const origins = selectedOrigins(config);

    // The TDM server 500s on a projectId-only filter — an origin must lead it.
    if (origins.length === 0 && projectId !== undefined) {
      throw new Error('Select at least one origin — TDM rejects a project-id filter with no origin.');
    }

    // One query per selected origin (each carrying projectId/type). With no
    // origin selected (and no projectId), fall back to a single query — filtered
    // by type if given, otherwise the whole recent list.
    const filters =
      origins.length > 0
        ? origins.map((origin) =>
            jobFilter({
              origin,
              ...(projectId !== undefined ? { projectId } : {}),
              ...(type ? { type } : {}),
            }),
          )
        : [jobFilter({ ...(type ? { type } : {}) })];

    const api = createJobsApi(session.clients);
    const perQuery = await Promise.all(
      filters.map((q) =>
        api.recent({
          total: config.total,
          sort: config.sort,
          order: config.order,
          ...(q ? { q } : {}),
        }),
      ),
    );

    // Merge → dedupe by jobId → re-sort → trim: the `total` most-recent jobs
    // across the selected origins, as one flat array (no map needed downstream).
    const merged = sortJobs(dedupeByJobId(perQuery.flat()), config.sort, config.order);
    return { port: 'out', data: merged.slice(0, config.total) };
  },
};
