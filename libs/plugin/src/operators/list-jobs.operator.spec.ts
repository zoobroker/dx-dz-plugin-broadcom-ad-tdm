import { describe, expect, it, vi } from 'vitest';

const { getTdmSession } = vi.hoisted(() => ({ getTdmSession: vi.fn() }));
const { recent, jobFilter, createJobsApi } = vi.hoisted(() => {
  const recent = vi.fn();
  return {
    recent,
    jobFilter: vi.fn(),
    createJobsApi: vi.fn(() => ({ recent, get: vi.fn(), children: vi.fn() })),
  };
});

vi.mock('../connection.js', async (orig) => ({
  ...(await orig<typeof import('../connection.js')>()),
  getTdmSession,
}));
vi.mock('@bims-ad/tdm-client', () => ({ createJobsApi, jobFilter }));

import { listJobsOperator } from './list-jobs.operator.js';

function fakeCtx() {
  return {
    // identity template — returns the field verbatim
    expressions: { evaluateTemplate: (t: string) => t },
    templateContext: {},
  };
}

const CONFIG = 'irrelevant-resolved-json';

describe('listJobsOperator', () => {
  it('declares identity + a single output port', () => {
    expect(listJobsOperator.pluginName).toBe('@dxdz/plugin-broadcom-ad-tdm');
    expect(listJobsOperator.operatorId).toBe('list-jobs');
    expect(listJobsOperator.outputs).toEqual([{ name: 'out' }]);
  });

  it('resolves the session, calls recent(total), and emits the jobs', async () => {
    getTdmSession.mockResolvedValue({ clients: {} });
    (jobFilter as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    recent.mockResolvedValue([{ jobId: 3 }, { jobId: 2 }]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await listJobsOperator.execute!(fakeCtx() as any, undefined, {
      connection: CONFIG,
      total: 50,
      sort: 'id',
      order: 'desc',
      origin: '',
      projectId: '',
      type: '',
    });

    expect(getTdmSession).toHaveBeenCalledWith(CONFIG);
    expect(recent).toHaveBeenCalledWith({ total: 50, sort: 'id', order: 'desc' });
    expect(res).toEqual({ port: 'out', data: [{ jobId: 3 }, { jobId: 2 }] });
  });

  it('builds an origin-scoped q filter and passes it to recent', async () => {
    getTdmSession.mockResolvedValue({ clients: {} });
    (jobFilter as ReturnType<typeof vi.fn>).mockReturnValue('(origin=flow_origin)+(projectId=42)');
    recent.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listJobsOperator.execute!(fakeCtx() as any, undefined, {
      connection: CONFIG,
      total: 200,
      sort: 'name',
      order: 'asc',
      origin: 'flow_origin',
      projectId: '42',
      type: '',
    });

    expect(jobFilter).toHaveBeenCalledWith({ origin: 'flow_origin', projectId: 42 });
    expect(recent).toHaveBeenCalledWith({
      total: 200,
      sort: 'name',
      order: 'asc',
      q: '(origin=flow_origin)+(projectId=42)',
    });
  });
});
