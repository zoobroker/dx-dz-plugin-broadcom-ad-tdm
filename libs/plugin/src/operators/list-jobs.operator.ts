import { createJobsApi, jobFilter } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';
import { renderTemplate } from '../templating.js';

/**
 * TDM: List Jobs — the *discover* half of Approach-A job monitoring. Returns the
 * N most recent jobs newest-first, correctly paged (1-indexed) + deduped by
 * jobId via the client's `recent()` primitive (the TDM job list's pagination is
 * quirky; the client encodes the gotchas). Optional origin/projectId/type filter
 * builds the origin-leading `q` string (projectId alone 500s — an origin is
 * required with it).
 */
const ListJobsConfigSchema = z.object({
  connection: z.string().default(''),
  total: z.number().int().positive().default(200),
  // An unset/cleared select serializes ''; coerce to the default so the enum
  // never sees an invalid member. Only `id` (jobId) + `name` sort reliably
  // server-side — timestamps sort only to ~minute precision (id as tiebreak).
  sort: z.preprocess((v) => (v === '' ? 'id' : v), z.enum(['id', 'name'])).default('id'),
  order: z.preprocess((v) => (v === '' ? 'desc' : v), z.enum(['asc', 'desc'])).default('desc'),
  origin: z.string().default(''),
  projectId: z.string().default(''),
  type: z.string().default(''),
});
type ListJobsConfig = z.infer<typeof ListJobsConfigSchema>;

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
  configDefaults: { total: 200, sort: 'id', order: 'desc' },
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
            hint: 'How many jobs to return (paged + deduped). Size above a period’s volume for watermark discovery.',
            widgetOptions: { min: 1 },
          },
          {
            key: 'sort',
            label: 'Sort by',
            widget: 'select',
            hint: 'Field the server sorts on. Only `id` (jobId) and `name` sort reliably — timestamps sort coarsely (~minute, id as tiebreak).',
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
            key: 'origin',
            templated: true,
            label: 'Origin filter',
            widget: 'text',
            hint: 'Optional — restrict to one origin (flow_origin / generation / datamodel / masking / modeling). Liquid-templated.',
          },
          {
            key: 'projectId',
            templated: true,
            label: 'Project id filter',
            widget: 'text',
            hint: 'Optional — restrict to one project. Requires an origin (a projectId-only filter 500s). Liquid-templated.',
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
    const origin = renderTemplate(ctx, input, config.origin).trim();
    const projectIdStr = renderTemplate(ctx, input, config.projectId).trim();
    const type = renderTemplate(ctx, input, config.type).trim();

    const q = jobFilter({
      ...(origin ? { origin } : {}),
      ...(projectIdStr ? { projectId: Number(projectIdStr) } : {}),
      ...(type ? { type } : {}),
    });

    const jobs = await createJobsApi(session.clients).recent({
      total: config.total,
      sort: config.sort,
      order: config.order,
      ...(q ? { q } : {}),
    });

    return { port: 'out', data: jobs };
  },
};
