import type { MetaRecord } from '../types.js';

const META_KEY = 'meta';

export async function getMeta(kv: KVNamespace): Promise<MetaRecord> {
  const raw = await kv.get(META_KEY);
  if (raw) return JSON.parse(raw) as MetaRecord;
  return { sessionCount: 0 };
}

export async function putMeta(kv: KVNamespace, meta: MetaRecord): Promise<void> {
  await kv.put(META_KEY, JSON.stringify(meta));
}
