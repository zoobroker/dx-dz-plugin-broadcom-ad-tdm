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
  configDefaults: { total: 200 },
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
            hint: 'How many of the newest jobs to return (paged + deduped). Size above a period’s volume for watermark discovery.',
            widgetOptions: { min: 1 },
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
      ...(q ? { q } : {}),
    });

    return { port: 'out', data: jobs };
  },
};
