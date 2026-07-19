import { createJobsApi } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';
import { renderRequiredInt } from '../templating.js';

/**
 * TDM: Get Job — the *re-check* half of Approach-A monitoring. Fetches one job
 * by id via `GET /job/{id}` (SINGULAR — the job itself). When it's a GROUPJOB
 * (or `Include children` is on) it also fetches the plural `GET /jobs/{id}`
 * children — the group's fan-out. Emits `{ job, children }`.
 */
const GetJobConfigSchema = z.object({
  connection: z.string().default(''),
  jobId: z.string().default(''),
  includeChildren: z.boolean().default(true),
});
type GetJobConfig = z.infer<typeof GetJobConfigSchema>;

export const getJobOperator: OperatorBehavior<GetJobConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'get-job',
  category: 'step',

  display: {
    displayName: 'TDM: Get Job',
    description: 'Fetch one job by id (+ its GROUPJOB children) — the re-check half of job monitoring.',
    family: 'Broadcom TDM',
    icon: 'work_history',
    titleTemplate: 'TDM: Get Job {{ config.jobId }}',
    searchKeywords: ['tdm', 'broadcom', 'job', 'detail', 'children', 'groupjob'],
  },

  configSchema: GetJobConfigSchema,
  configDefaults: { includeChildren: true },
  configForm: {
    sections: [
      { id: 'connection', title: 'Connection', fields: [connectionField] },
      {
        id: 'job',
        title: 'Job',
        fields: [
          {
            key: 'jobId',
            templated: true,
            label: 'Job id',
            widget: 'text',
            hint: 'The job to fetch — usually templated from upstream, e.g. `{{ input.jobId }}`.',
          },
          {
            key: 'includeChildren',
            label: 'Include GROUPJOB children',
            widget: 'toggle',
            hint: 'Also fetch the plural children endpoint (empty for non-group jobs). Off = the job only.',
          },
        ],
      },
    ],
  },

  outputs: [{ name: 'out' }],
  captureByteCap: 1_000_000,

  async execute(ctx, input, config) {
    const session = await getTdmSession(config.connection);
    const jobId = renderRequiredInt(ctx, input, config.jobId, 'Job id');

    const api = createJobsApi(session.clients);
    const job = await api.get(jobId);
    if (job === undefined) throw new Error(`TDM job ${jobId} not found.`);

    const children = config.includeChildren ? await api.children(jobId) : [];
    return { port: 'out', data: { job, children } };
  },
};
