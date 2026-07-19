import { z } from 'zod';

import type { OperatorBehavior } from '@dx-dz/plugin-sdk';

import { PLUGIN_NAME } from '../plugin-name.js';

/**
 * TDM Echo — the foundation placeholder operator (#432/#433).
 *
 * It emits its input UNCHANGED (optionally logging a note), so it can sit
 * anywhere in a flow as an inspection point. Its only job right now is to
 * prove the standalone-plugin pipeline end to end: authored against
 * `@dx-dz/plugin-sdk`, bundled with no externals, acquired via `plugins-add`,
 * and shown in the editor library. The real Broadcom TDM operators (List Jobs,
 * …) land once the connection/auth layer (#437) is in place.
 */
const EchoConfigSchema = z.object({
  note: z.string().default(''),
});
type EchoConfig = z.infer<typeof EchoConfigSchema>;

export const echoOperator: OperatorBehavior<EchoConfig, unknown, unknown> = {
  pluginName: PLUGIN_NAME,
  operatorId: 'echo',
  category: 'step',

  display: {
    displayName: 'TDM Echo',
    description: 'Emit the input unchanged (placeholder — proves the plugin pipeline).',
    family: 'Broadcom TDM',
    icon: 'sync_alt',
    titleTemplate: 'TDM Echo',
    searchKeywords: ['tdm', 'broadcom', 'placeholder', 'echo'],
  },

  configSchema: EchoConfigSchema,
  configForm: {
    sections: [
      {
        id: 'main',
        title: 'Echo',
        fields: [
          {
            key: 'note',
            label: 'Note',
            widget: 'text',
            hint: 'Optional note logged when this step runs.',
          },
        ],
      },
    ],
  },

  outputs: [{ name: 'out' }],

  execute: (ctx, input, config) => {
    if (config.note) ctx.logger.info(`[tdm-echo] ${config.note}`);
    return Promise.resolve({ port: 'out', data: input });
  },
};
