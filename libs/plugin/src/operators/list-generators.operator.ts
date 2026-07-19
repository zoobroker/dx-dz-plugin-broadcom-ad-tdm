import { generator } from '@bims-ad/tdm-client';
import type { OperatorBehavior } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

import { connectionField, getTdmSession } from '../connection.js';
import { PLUGIN_NAME } from '../plugin-name.js';

/**
 * TDM: List Generators — every generator the connection's user can see
 * (`GET /generators`, SDK op `getGeneratorsByUser`). TDM exposes no
 * "get generator by id" GET, so pick/filter one flow-side from this list.
 */
const ListGeneratorsConfigSchema = z.object({
  connection: z.string().default(''),
});
type ListGeneratorsConfig = z.infer<typeof ListGeneratorsConfigSchema>;

export const listGeneratorsOperator: OperatorBehavior<ListGeneratorsConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'list-generators',
  category: 'step',

  display: {
    displayName: 'TDM: List Generators',
    description: 'Every TDM generator visible to the connection’s user (filter by id flow-side).',
    family: 'Broadcom TDM',
    icon: 'auto_awesome',
    titleTemplate: 'TDM: List Generators',
    searchKeywords: ['tdm', 'broadcom', 'generators', 'list'],
  },

  configSchema: ListGeneratorsConfigSchema,
  configForm: {
    sections: [{ id: 'connection', title: 'Connection', fields: [connectionField] }],
  },

  outputs: [{ name: 'out' }],
  captureByteCap: 1_000_000,

  async execute(_ctx, _input, config) {
    const session = await getTdmSession(config.connection);
    const { data } = await generator.getGeneratorsByUser({
      client: session.clients.generator,
      throwOnError: true,
    });
    return { port: 'out', data };
  },
};
