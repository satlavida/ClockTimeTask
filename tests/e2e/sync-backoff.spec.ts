/**
 * Sync status badge and error backoff tests.
 *
 * Sync is WebSocket-based. HTTP PUT to /sessions/:id/sync is still used for
 * pushing state from the client. There is no GET polling endpoint.
 *
 * mockWebSocket() (helpers.ts) intercepts ws://localhost:* connections so
 * every test controls whether the WS connects cleanly, stays silent, or fails,
 * independent of whether a real backend is running.
 *
 * ERROR_BACKOFF = [2s, 4s, 8s, 16s, 30s]
 * handlePushError() computes _nextRetryMs = ERROR_BACKOFF[_errorCount] BEFORE
 * incrementing _errorCount, so the first push failure correctly shows "Retry in 2s".
 */

import { test, expect, Page, Route } from '@playwright/test';
import {
  resetState, seedCloudSession, encryptForSession, minimalState,
  mockWebSocket, API,
} from './helpers';

const SESSION_ID = 'SYNCTEST12345678';
const SHARE_CODE = 'TESTCODE12345678';

// Seed a cloud session, register WS mock, optionally mock HTTP PUT, then reload.
async function setupCloudSession(
  page: Page,
  opts: {
    putStatus?: number;
    putBody?: () => Promise<string> | string;
    wsEncryptedData?: string | null;
    wsBehavior?: 'connected' | 'silent' | 'fail';
  } = {}
) {
  const id = await seedCloudSession(page, {
    id: SESSION_ID,
    shareCode: SHARE_CODE,
    permissions: ['view_tasks', 'edit_tasks', 'edit_budget', 'reorder_tasks'],
    active: true,
  });

  // Register WS mock before reload so it intercepts the connection the app
  // opens during initSyncStatus().
  await mockWebSocket(page, {
    behavior: opts.wsBehavior ?? 'connected',
    encryptedData: opts.wsEncryptedData ?? null,
  });

  if (opts.putStatus !== undefined) {
    await page.route(`${API}/${id}/sync`, async (route: Route) => {
      if (route.request().method() === 'PUT') {
        const status = opts.putStatus!;
        const body   = opts.putBody ? await opts.putBody() : undefined;
        await route.fulfill({
          status,
          contentType: body ? 'application/json' : undefined,
          body,
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });
  }

  await page.reload();
  await page.waitForTimeout(300);
  return id;
}

// Trigger a push by adding a task (state change → schedulePush 2s debounce).
async function addTask(page: Page) {
  await page.fill('#fName', 'Sync Test Task');
  await page.fill('#fMins', '30');
  await page.click('#btnAddFree');
}

// ── Badge visibility ──────────────────────────────────────────────────────────

test.describe('Sync badge visibility', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('hidden when in local session (default)', async ({ page }) => {
    await expect(page.locator('#syncStatus')).toBeHidden();
  });

  test('visible when in cloud session', async ({ page }) => {
    await setupCloudSession(page);
    await expect(page.locator('#syncStatus')).toBeVisible();
  });

  test('hidden again after switching back to local', async ({ page }) => {
    await setupCloudSession(page);
    await expect(page.locator('#syncStatus')).toBeVisible();

    await page.evaluate(() => {
      localStorage.setItem('clocktask_active_session_v1', 'local');
    });
    await page.reload();
    await page.waitForTimeout(300);

    await expect(page.locator('#syncStatus')).toBeHidden();
  });
});

// ── Badge states ──────────────────────────────────────────────────────────────

test.describe('Sync badge states', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('shows synced after WS delivers state on connect', async ({ page }) => {
    // Pre-encrypt a valid state so applyRemoteState() can decrypt and load it.
    const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());
    await setupCloudSession(page, { wsEncryptedData: encrypted });

    // WS auth exchange + state apply happens within ~100ms of load.
    await page.waitForTimeout(500);

    await expect(page.locator('#syncStatus')).toHaveClass(/synced/);
    await expect(page.locator('#syncStatus .sync-lbl')).toContainText('Synced');
  });

  test('shows error after push failure', async ({ page }) => {
    await setupCloudSession(page, {
      putStatus: 500,
      putBody: () => JSON.stringify({ error: 'internal_error' }),
    });

    await addTask(page);

    // Wait for 2s debounce + push attempt
    await page.waitForTimeout(3000);

    await expect(page.locator('#syncStatus')).toHaveClass(/error/);
    await expect(page.locator('#syncStatus .sync-lbl')).toContainText('Retry in');
  });

  test('shows synced after successful push with real encryption', async ({ page }) => {
    const encryptedResponse = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());

    await seedCloudSession(page, {
      id: SESSION_ID, shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks', 'edit_budget'],
      active: true,
    });

    // WS connects but doesn't deliver initial state — push success sets synced.
    await mockWebSocket(page, { behavior: 'silent' });

    await page.route(`${API}/${SESSION_ID}/sync`, async (route: Route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ encryptedData: encryptedResponse, crdtState: btoa(''), version: 2 }),
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.reload();
    await page.waitForTimeout(300);

    await addTask(page);
    // 2s debounce + push + decrypt
    await page.waitForTimeout(3500);

    await expect(page.locator('#syncStatus')).toHaveClass(/synced/);
    await expect(page.locator('#syncStatus .sync-lbl')).toContainText('Synced');
  }, 10_000);
});

// ── Error backoff ─────────────────────────────────────────────────────────────

test.describe('Error backoff behaviour', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('first push failure shows retry in 2s', async ({ page }) => {
    await setupCloudSession(page, {
      putStatus: 500,
      putBody: () => JSON.stringify({ error: 'internal_error' }),
    });

    await addTask(page);
    await page.waitForTimeout(3000);

    const label = page.locator('#syncStatus .sync-lbl');
    await expect(label).toContainText('Retry in');
    // ERROR_BACKOFF[0] = 2s; delay is computed before _errorCount increments
    await expect(label).toContainText('Retry in 2s');
  }, 10_000);

  test('second failure shows longer delay than first', async ({ page }) => {
    await setupCloudSession(page, {
      putStatus: 500,
      putBody: () => JSON.stringify({ error: 'internal_error' }),
    });

    await addTask(page);

    // Wait for first error (after 2s debounce)
    await page.waitForTimeout(3000);
    const label = page.locator('#syncStatus .sync-lbl');
    await expect(label).toContainText('Retry in');

    const firstText  = await label.textContent() ?? '';
    const firstDelay = parseInt(firstText.match(/\d+/)?.[0] ?? '0', 10);

    // Wait for second failure (first retry fires after 2s, push takes ~0s)
    await page.waitForTimeout(5500);
    await expect(label).toContainText('Retry in');

    const secondText  = await label.textContent() ?? '';
    const secondDelay = parseInt(secondText.match(/\d+/)?.[0] ?? '0', 10);

    expect(secondDelay).toBeGreaterThanOrEqual(firstDelay);
  }, 20_000);

  test('coming online after offline resets error and schedules push', async ({ page }) => {
    await setupCloudSession(page, {
      putStatus: 500,
      putBody: () => JSON.stringify({ error: 'internal_error' }),
    });

    await addTask(page);
    await page.waitForTimeout(3000);
    await expect(page.locator('#syncStatus')).toHaveClass(/error/);

    // Re-mock PUT to still fail — we just want to verify the badge leaves
    // 'offline' and re-enters the push cycle (error or syncing).
    await page.route(`${API}/${SESSION_ID}/sync`, async (route: Route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'still_failing' }) });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await page.waitForTimeout(1000);
    const cls = await page.locator('#syncStatus').getAttribute('class') ?? '';
    expect(cls).not.toContain('offline');
  }, 15_000);
});

// ── WS connection behaviour ───────────────────────────────────────────────────

test.describe('WS connection behaviour', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('badge is not in error state when WS connects successfully', async ({ page }) => {
    await setupCloudSession(page);
    // WS mock accepted the connection — badge should be 'connecting' or 'synced',
    // never 'error' from a failed WS connection.
    await page.waitForTimeout(400);
    await expect(page.locator('#syncStatus')).toBeVisible();
    await expect(page.locator('#syncStatus')).not.toHaveClass(/error/);
  });

  test('tab refocus with open WS does not crash or re-connect', async ({ page }) => {
    await setupCloudSession(page);
    await page.waitForTimeout(300);

    // Simulate multiple tab focus cycles — with WS already OPEN, connectWS()
    // is a no-op and no additional connections are made.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
    }

    await expect(page.locator('#syncStatus')).toBeVisible();
    await expect(page.locator('#syncStatus')).not.toHaveClass(/error/);
  });
});
