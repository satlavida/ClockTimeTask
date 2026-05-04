import type { MetaRecord, SessionRecord } from '../types.js';

const SESSION_PREFIX = 'session:';
const META_KEY = 'meta';

export async function getSession(kv: KVNamespace, id: string): Promise<SessionRecord | null> {
  const raw = await kv.get(`${SESSION_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function putSession(kv: KVNamespace, session: SessionRecord): Promise<void> {
  await kv.put(`${SESSION_PREFIX}${session.id}`, JSON.stringify(session));
}

export async function deleteSession(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${id}`);
}

export async function getMeta(kv: KVNamespace): Promise<MetaRecord> {
  const raw = await kv.get(META_KEY);
  if (raw) return JSON.parse(raw) as MetaRecord;
  return { sessionCount: 0, lastSweep: new Date(0).toISOString() };
}

export async function putMeta(kv: KVNamespace, meta: MetaRecord): Promise<void> {
  await kv.put(META_KEY, JSON.stringify(meta));
}

export async function listSessionKeys(kv: KVNamespace): Promise<string[]> {
  const result = await kv.list({ prefix: SESSION_PREFIX });
  return result.keys.map(k => k.name.slice(SESSION_PREFIX.length));
}
