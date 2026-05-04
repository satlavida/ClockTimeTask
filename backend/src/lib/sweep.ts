import type { MetaRecord } from '../types.js';
import { getSession, deleteSession, listSessionKeys, putMeta } from './kv.js';

const EXPIRY_SECS = 86_400;      // 24 hours
const SWEEP_INTERVAL_SECS = 3_600; // 1 hour

export async function sweepIfNeeded(kv: KVNamespace, meta: MetaRecord): Promise<MetaRecord> {
  const now = Date.now();
  const lastSweepMs = new Date(meta.lastSweep).getTime();
  if ((now - lastSweepMs) / 1000 < SWEEP_INTERVAL_SECS) return meta;

  const ids = await listSessionKeys(kv);
  let deletedCount = 0;

  for (const id of ids) {
    const session = await getSession(kv, id);
    if (!session) continue;
    const ageSecs = (now - new Date(session.lastAccess).getTime()) / 1000;
    if (ageSecs > EXPIRY_SECS) {
      await deleteSession(kv, id);
      deletedCount++;
    }
  }

  const updated: MetaRecord = {
    sessionCount: Math.max(0, meta.sessionCount - deletedCount),
    lastSweep: new Date(now).toISOString(),
  };
  await putMeta(kv, updated);
  return updated;
}
