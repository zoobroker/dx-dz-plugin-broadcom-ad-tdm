import { projects } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';
import { renderRequiredInt } from '../templating.js';

/**
 * TDM: Get Project — one project by id (`GET /projects/{projectId}`, SDK op
 * `getProjectInfo`).
 */
const GetProjectConfigSchema = z.object({
  connection: z.string().default(''),
  projectId: z.string().default(''),
});
type GetProjectConfig = z.infer<typeof GetProjectConfigSchema>;

export const getProjectOperator: OperatorBehavior<GetProjectConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'get-project',
  category: 'step',

  display: {
    displayName: 'TDM: Get Project',
    description: 'Fetch one TDM project by id.',
    family: 'Broadcom TDM',
    icon: 'folder',
    titleTemplate: 'TDM: Get Project {{ config.projectId }}',
    searchKeywords: ['tdm', 'broadcom', 'project', 'detail'],
  },

  configSchema: GetProjectConfigSchema,
  configForm: {
    sections: [
      { id: 'connection', title: 'Connection', fields: [connectionField] },
      {
        id: 'project',
        title: 'Project',
        fields: [
          {
            key: 'projectId',
            templated: true,
            label: 'Project id',
            widget: 'text',
            hint: 'The project to fetch — literal or templated, e.g. `{{ input.projectId }}`.',
          },
        ],
      },
    ],
  },

  outputs: [{ name: 'out' }],
  captureByteCap: 1_000_000,

  async execute(ctx, input, config) {
    const session = await getTdmSession(config.connection);
    const projectId = renderRequiredInt(ctx, input, config.projectId, 'Project id');
    const { data } = await projects.getProjectInfo({
      client: session.clients.projects,
      path: { projectId },
      throwOnError: true,
    });
    return { port: 'out', data };
  },
};
