import { describe, expect, it, vi } from 'vitest';

import { echoOperator } from './echo.operator.js';

/** Minimal Ctx stub — the echo operator only touches ctx.logger. */
function fakeCtx() {
  return { logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } };
}

describe('echoOperator', () => {
  it('declares the plugin identity + a single output port', () => {
    expect(echoOperator.pluginName).toBe('@dxdz/plugin-broadcom-ad-tdm');
    expect(echoOperator.operatorId).toBe('echo');
    expect(echoOperator.category).toBe('step');
    expect(echoOperator.outputs).toEqual([{ name: 'out' }]);
  });

  it('emits the input unchanged on the out port', async () => {
    const ctx = fakeCtx();
    const input = { hello: 'world' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await echoOperator.execute!(ctx as any, input, { note: '' });
    expect(result).toEqual({ port: 'out', data: input });
    expect(ctx.logger.info).not.toHaveBeenCalled();
  });

  it('logs the note when one is set', async () => {
    const ctx = fakeCtx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await echoOperator.execute!(ctx as any, 42, { note: 'hi' });
    expect(ctx.logger.info).toHaveBeenCalledWith('[tdm-echo] hi');
  });
});
