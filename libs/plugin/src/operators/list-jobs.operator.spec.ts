import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTdmSession } = vi.hoisted(() => ({ getTdmSession: vi.fn() }));
const { recent, jobFilter, jobIdOf, createJobsApi } = vi.hoisted(() => {
  const recent = vi.fn();
  return {
    recent,
    jobFilter: vi.fn(),
    jobIdOf: vi.fn((job: { jobId?: number }) => job.jobId),
    createJobsApi: vi.fn(() => ({ recent, get: vi.fn(), children: vi.fn() })),
  };
});

vi.mock('../connection.js', async (orig) => ({
  ...(await orig<typeof import('../connection.js')>()),
  getTdmSession,
}));
vi.mock('@bims-ad/tdm-client', () => ({ createJobsApi, jobFilter, jobIdOf }));

import { listJobsOperator } from './list-jobs.operator.js';

function fakeCtx() {
  return {
    // identity template — returns the field verbatim
    expressions: { evaluateTemplate: (t: string) => t },
    templateContext: {},
  };
}

const CONFIG = 'irrelevant-resolved-json';
// The origin toggles, all off — spread + override per test.
const NO_ORIGINS = {
  flowOrigin: false,
  generation: false,
  datamodel: false,
  masking: false,
  modeling: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (config: Record<string, unknown>) => listJobsOperator.execute!(fakeCtx() as any, undefined, config as any);

beforeEach(() => {
  recent.mockReset();
  jobFilter.mockReset();
  getTdmSession.mockResolvedValue({ clients: {} });
});

describe('listJobsOperator', () => {
  it('declares identity + a single output port', () => {
    expect(listJobsOperator.pluginName).toBe('@dxdz/plugin-broadcom-ad-tdm');
    expect(listJobsOperator.operatorId).toBe('list-jobs');
    expect(listJobsOperator.outputs).toEqual([{ name: 'out' }]);
  });

  it('queries one origin (flow_origin default) and emits the jobs', async () => {
    jobFilter.mockReturnValue('(origin=flow_origin)');
    recent.mockResolvedValue([{ jobId: 3 }, { jobId: 2 }]);

    const res = await run({
      connection: CONFIG,
      total: 50,
      sort: 'id',
      order: 'desc',
      ...NO_ORIGINS,
      flowOrigin: true,
      projectId: '',
      type: '',
    });

    expect(getTdmSession).toHaveBeenCalledWith(CONFIG);
    expect(jobFilter).toHaveBeenCalledWith({ origin: 'flow_origin' });
    expect(recent).toHaveBeenCalledTimes(1);
    expect(recent).toHaveBeenCalledWith({ total: 50, sort: 'id', order: 'desc', q: '(origin=flow_origin)' });
    expect(res).toEqual({ port: 'out', data: [{ jobId: 3 }, { jobId: 2 }] });
  });

  it('fans out one query per selected origin, then merges + dedupes + sorts + trims', async () => {
    jobFilter.mockImplementation((parts: { origin?: string }) => `q:${parts.origin}`);
    recent
      .mockResolvedValueOnce([{ jobId: 5 }, { jobId: 3 }]) // flow_origin
      .mockResolvedValueOnce([{ jobId: 4 }, { jobId: 5 }]); // generation (5 is a dup)

    const res = await run({
      connection: CONFIG,
      total: 2,
      sort: 'id',
      order: 'desc',
      ...NO_ORIGINS,
      flowOrigin: true,
      generation: true,
      projectId: '',
      type: '',
    });

    expect(jobFilter).toHaveBeenCalledTimes(2);
    expect(jobFilter).toHaveBeenCalledWith({ origin: 'flow_origin' });
    expect(jobFilter).toHaveBeenCalledWith({ origin: 'generation' });
    expect(recent).toHaveBeenCalledTimes(2);
    // merged [5,3,4,5] → dedupe [5,3,4] → sort id desc [5,4,3] → trim 2 → [5,4]
    expect(res).toEqual({ port: 'out', data: [{ jobId: 5 }, { jobId: 4 }] });
  });

  it('includes the projectId (as a number) on every origin query', async () => {
    jobFilter.mockReturnValue('q');
    recent.mockResolvedValue([]);

    await run({
      connection: CONFIG,
      total: 200,
      sort: 'name',
      order: 'asc',
      ...NO_ORIGINS,
      flowOrigin: true,
      masking: true,
      projectId: '42',
      type: '',
    });

    expect(jobFilter).toHaveBeenCalledWith({ origin: 'flow_origin', projectId: 42 });
    expect(jobFilter).toHaveBeenCalledWith({ origin: 'masking', projectId: 42 });
  });

  it('rejects a projectId filter when no origin is selected (the TDM 500 case)', async () => {
    await expect(
      run({
        connection: CONFIG,
        total: 200,
        sort: 'id',
        order: 'desc',
        ...NO_ORIGINS,
        projectId: '99',
        type: '',
      }),
    ).rejects.toThrow(/at least one origin/i);
    expect(recent).not.toHaveBeenCalled();
  });

  it('with no origin and no projectId, runs a single unfiltered query', async () => {
    jobFilter.mockReturnValue(undefined);
    recent.mockResolvedValue([{ jobId: 3 }, { jobId: 2 }]);

    const res = await run({
      connection: CONFIG,
      total: 50,
      sort: 'id',
      order: 'desc',
      ...NO_ORIGINS,
      projectId: '',
      type: '',
    });

    expect(recent).toHaveBeenCalledTimes(1);
    expect(recent).toHaveBeenCalledWith({ total: 50, sort: 'id', order: 'desc' });
    expect(res).toEqual({ port: 'out', data: [{ jobId: 3 }, { jobId: 2 }] });
  });
});
