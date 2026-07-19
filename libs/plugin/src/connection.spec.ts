import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createTdmSession } = vi.hoisted(() => ({ createTdmSession: vi.fn() }));
vi.mock('@bims-ad/tdm-client', () => ({ createTdmSession }));

import { __clearSessionCacheForTests, getTdmSession } from './connection.js';

function fakeSession() {
  return {
    ensureFresh: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(() => Promise.resolve()),
    clients: {},
    token: 'tok',
    userName: 'u',
    expiresAt: undefined,
  };
}

const CONFIG = JSON.stringify({
  origin: 'https://tdm.example.com:8443',
  username: 'u',
  password: 'p',
  insecureTls: true,
});

describe('getTdmSession', () => {
  beforeEach(() => {
    __clearSessionCacheForTests();
    createTdmSession.mockReset();
    createTdmSession.mockImplementation(() => Promise.resolve(fakeSession()));
  });
  afterEach(() => vi.clearAllMocks());

  it('parses the resolved JSON and creates a session from the exact config', async () => {
    const s = await getTdmSession(CONFIG);
    expect(createTdmSession).toHaveBeenCalledWith({
      origin: 'https://tdm.example.com:8443',
      username: 'u',
      password: 'p',
      insecureTls: true,
    });
    expect(s.ensureFresh).toHaveBeenCalledOnce();
  });

  it('omits insecureTls when not set', async () => {
    await getTdmSession(JSON.stringify({ origin: 'https://h:8443', username: 'u', password: 'p' }));
    expect(createTdmSession).toHaveBeenCalledWith({ origin: 'https://h:8443', username: 'u', password: 'p' });
  });

  it('caches by config: same JSON reuses the session, different JSON creates a new one', async () => {
    const a = await getTdmSession(CONFIG);
    const a2 = await getTdmSession(CONFIG);
    expect(a2).toBe(a);
    expect(createTdmSession).toHaveBeenCalledTimes(1);

    await getTdmSession(JSON.stringify({ origin: 'https://other:8443', username: 'u', password: 'p' }));
    expect(createTdmSession).toHaveBeenCalledTimes(2);
  });

  it('runs ensureFresh on every call (proactive refresh)', async () => {
    const s = await getTdmSession(CONFIG);
    await getTdmSession(CONFIG);
    expect(s.ensureFresh).toHaveBeenCalledTimes(2);
  });

  it('rejects an unbound connection field', async () => {
    await expect(getTdmSession('')).rejects.toThrow(/no TDM connection/i);
    await expect(getTdmSession(undefined)).rejects.toThrow(/no TDM connection/i);
    expect(createTdmSession).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    await expect(getTdmSession('not json')).rejects.toThrow(/not valid JSON/i);
  });

  it('rejects JSON missing required fields', async () => {
    await expect(getTdmSession(JSON.stringify({ origin: 'https://h:8443' }))).rejects.toThrow();
    expect(createTdmSession).not.toHaveBeenCalled();
  });
});
