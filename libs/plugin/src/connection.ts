import { createHash } from 'node:crypto';

import { createTdmSession, type TdmSession } from '@bims-ad/tdm-client';
import type { FormField } from '@dx-dz/plugin-sdk';
import { z } from 'zod';

/**
 * The TDM connection layer.
 *
 * A TDM connection is a JSON blob — `{ origin, username, password, insecureTls? }`
 * — stored as ONE dx-dz secret. Operators reference it with a `secretRef` config
 * field (see {@link connectionField}); the daemon's OperationRunner pre-resolves
 * that field to the secret's literal value BEFORE `execute`, so an operator just
 * receives the JSON string and hands it here.
 *
 * We hold a long-lived {@link TdmSession} per distinct connection, cached
 * module-scoped for the daemon's lifetime. The session owns the JWT lifecycle
 * entirely — proactive `ensureFresh()` + reactive single-flight 401 retry — so
 * operators never touch tokens. Caching means one login per host per process
 * (re-used across every operation + flow run), and a rotated secret transparently
 * yields a fresh session (its config hashes differently).
 *
 * NOTE the secret must be a STRING secret whose value is the JSON (not a
 * `--json`-typed secret): dx-dz's `secretRef` resolver only accepts string
 * secrets. The operator `JSON.parse`s it.
 */

export const TdmConnectionConfigSchema = z.object({
  /** TDM origin — scheme + host + port, no path. e.g. `https://tdm.example.com:8443`. */
  origin: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  /** Accept self-signed / expired certs (lab hosts). Scoped to this connection. */
  insecureTls: z.boolean().optional(),
});
export type TdmConnectionConfig = z.infer<typeof TdmConnectionConfigSchema>;

/**
 * The shared connection config field every TDM operator declares. `secretRef`
 * so the runner pre-resolves it + the analyzer surfaces/provisions it — no
 * dx-dz core change, and it generalises to any third-party plugin.
 */
export const connectionField: FormField = {
  key: 'connection',
  label: 'TDM connection',
  widget: 'secretRef',
  hint:
    'Bind a secret whose value is the TDM connection JSON — ' +
    '{"origin":"https://tdm.example.com:8443","username":"…","password":"…","insecureTls":true}. ' +
    'Store it as a plain string secret (not a JSON-typed one).',
};

/** Module-scoped session cache: connection-config hash → live session. */
const sessions = new Map<string, TdmSession>();

/**
 * Resolve the pre-resolved connection JSON (the value of the `connection`
 * secretRef field) to a live, token-fresh {@link TdmSession}. Cached per
 * distinct connection. Throws a clear error when the field is unbound or the
 * secret's JSON is malformed; the initial login may throw on bad credentials /
 * an unreachable host.
 */
export async function getTdmSession(resolvedConnectionJson: string | undefined): Promise<TdmSession> {
  const raw = resolvedConnectionJson?.trim();
  if (!raw) {
    throw new Error(
      'no TDM connection secret bound — set the "TDM connection" field to a secret holding the connection JSON.',
    );
  }

  const key = createHash('sha256').update(raw).digest('hex');
  let session = sessions.get(key);
  if (session === undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('TDM connection secret is not valid JSON — expected { origin, username, password, insecureTls? }.');
    }
    const config = TdmConnectionConfigSchema.parse(parsed);
    session = await createTdmSession({
      origin: config.origin,
      username: config.username,
      password: config.password,
      ...(config.insecureTls ? { insecureTls: true } : {}),
    });
    sessions.set(key, session);
  }

  await session.ensureFresh();
  return session;
}

/** Test seam — clear the session cache between unit tests. */
export function __clearSessionCacheForTests(): void {
  sessions.clear();
}
