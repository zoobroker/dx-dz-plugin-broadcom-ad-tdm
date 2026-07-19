import { projects } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';

/**
 * TDM: List Projects — every project the connection's user can see
 * (`GET /projects`). The SDK op is `getUserProjects`; there is no unfiltered
 * "all projects" endpoint — this is scoped to the authenticated user.
 */
const ListProjectsConfigSchema = z.object({
  connection: z.string().default(''),
});
type ListProjectsConfig = z.infer<typeof ListProjectsConfigSchema>;

export const listProjectsOperator: OperatorBehavior<ListProjectsConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'list-projects',
  category: 'step',

  display: {
    displayName: 'TDM: List Projects',
    description: 'Every TDM project visible to the connection’s user.',
    family: 'Broadcom TDM',
    icon: 'folder_open',
    titleTemplate: 'TDM: List Projects',
    searchKeywords: ['tdm', 'broadcom', 'projects', 'list'],
  },

  configSchema: ListProjectsConfigSchema,
  configForm: {
    sections: [{ id: 'connection', title: 'Connection', fields: [connectionField] }],
  },

  outputs: [{ name: 'out' }],
  captureByteCap: 1_000_000,

  async execute(_ctx, _input, config) {
    const session = await getTdmSession(config.connection);
    const { data } = await projects.getUserProjects({
      client: session.clients.projects,
      throwOnError: true,
    });
    return { port: 'out', data };
  },
};
