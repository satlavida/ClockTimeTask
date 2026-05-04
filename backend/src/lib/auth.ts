import type { SessionRecord, Permission } from '../types.js';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomAlphanumeric(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => ALPHANUMERIC[b % ALPHANUMERIC.length]).join('');
}

export function validateShareCode(
  session: SessionRecord,
  shareCode: string,
  required: Permission
): Permission[] | null {
  const entry = session.shareCodes[shareCode];
  if (!entry) return null;
  if (!entry.permissions.includes(required)) return null;
  return entry.permissions;
}

export function getPermissions(session: SessionRecord, shareCode: string): Permission[] | null {
  return session.shareCodes[shareCode]?.permissions ?? null;
}

export function extractShareCode(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}
