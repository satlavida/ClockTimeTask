import { Page } from '@playwright/test';

export const API = 'http://localhost:8787/api/sessions';

export async function resetState(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
}

export async function openSessionModal(page: Page) {
  await page.click('#btnOpenSession');
  await page.waitForSelector('#sessionOverlay.open');
}

// Inject a cloud session into localStorage and optionally activate it.
// Returns the session ID used.
export async function seedCloudSession(
  page: Page,
  options: {
    id?: string;
    name?: string;
    shareCode?: string;
    permissions: string[];
    active?: boolean;
  }
): Promise<string> {
  const id        = options.id        ?? 'TESTSESSION12345';
  const name      = options.name      ?? 'Test Cloud';
  const shareCode = options.shareCode ?? 'TESTCODE12345678';

  await page.evaluate(
    ({ id, name, shareCode, permissions, active }) => {
      const entry = {
        id, name, type: 'cloud',
        shareCode,
        permissions,
        lastSynced: new Date().toISOString(),
        version: 1,
        createdAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem('clocktask_sessions_v1') || '[]') as { id: string }[];
      const base = existing.find((s) => s.id === 'local')
        ? existing
        : [{ id: 'local', name: 'Local', type: 'local', permissions: [], createdAt: '' }, ...existing];
      const without = base.filter((s) => s.id !== id);
      localStorage.setItem('clocktask_sessions_v1', JSON.stringify([...without, entry]));
      if (active) localStorage.setItem('clocktask_active_session_v1', id);
    },
    { id, name, shareCode, permissions: options.permissions, active: options.active ?? true }
  );
  return id;
}

// Encrypt plaintext using AES-GCM-256 with PBKDF2 key derivation.
// Mirrors the algorithm in src/logic/sessions.js so tests can produce
// ciphertext the real client code will successfully decrypt.
export async function encryptForSession(
  page: Page,
  sessionId: string,
  shareCode: string,
  plaintext: string
): Promise<string> {
  return page.evaluate(
    async ({ sessionId, shareCode, plaintext }) => {
      const km = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(shareCode),
        { name: 'PBKDF2' }, false, ['deriveKey']
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: new TextEncoder().encode(sessionId), iterations: 100_000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
      const out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(ct), 12);
      return btoa(String.fromCharCode(...out));
    },
    { sessionId, shareCode, plaintext }
  );
}

// Minimal valid state JSON the app can load without errors.
export function minimalState(): string {
  return JSON.stringify({
    tasks: [],
    notes: [],
    mode: 'free',
    budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 },
    startTime: new Date().toISOString(),
    settings: {},
  });
}
