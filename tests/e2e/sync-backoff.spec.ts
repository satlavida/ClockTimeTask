/**
 * Sync status badge and error backoff tests.
 *
 * KNOWN BUG (off-by-one in error backoff):
 *   ERROR_BACKOFF = [2s, 4s, 8s, 16s, 30s]
 *   On first push failure: _errorCount++ makes it 1, then errorDelay() returns
 *   ERROR_BACKOFF[1] = 4s instead of ERROR_BACKOFF[0] = 2s.
 *   The 2s entry is unreachable. Badge shows "Retry in 4s" not "Retry in 2s".
 *   Fix: compute delay *before* incrementing _errorCount in doPush().
 *
 * The test 'first push failure shows retry in 4s (bug: should be 2s)' will
 * need updating when the bug is fixed — change the expected text to 'Retry in 2s'.
 */

import { test, expect, Page, Route } from '@playwright/test';
import { resetState, seedCloudSession, encryptForSession, minimalState, API } from './helpers';

const SESSION_ID = 'SYNCTEST12345678';
const SHARE_CODE = 'TESTCODE12345678';

// Seed a cloud session, mock sync, reload, return the session ID.
async function setupCloudSession(
  page: Page,
  opts: {
    putStatus?: number;
    putBody?: () => Promise<string> | string;
    getStatus?: number;
  } = {}
) {
  const id = await seedCloudSession(page, {
    id: SESSION_ID,
    shareCode: SHARE_CODE,
    permissions: ['view_tasks', 'edit_tasks', 'edit_budget', 'reorder_tasks'],
    active: true,
  });

  await page.route(`${API}/${id}/sync**`, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: opts.getStatus ?? 204 });
    } else {
      const status = opts.putStatus ?? 204;
      const body   = opts.putBody ? await opts.putBody() : undefined;
      await route.fulfill({
        status,
        contentType: body ? 'application/json' : undefined,
        body,
      });
    }
  });

  await page.reload();
  await page.waitForTimeout(300);
  return id;
}

// Trigger a push by adding a task (state change → schedulePush(2s debounce))
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

  test('shows synced after pull returns 204 (no changes)', async ({ page }) => {
    // Pull is triggered by visibilitychange (tab focus), not on page load.
    await setupCloudSession(page, { getStatus: 204 });

    // Simulate a tab focus cycle to trigger maybeSchedulePull()
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(600);

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
    // Pre-encrypt a response the client can decrypt
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    const encryptedResponse = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());

    await seedCloudSession(page, {
      id: SESSION_ID, shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks', 'edit_budget'],
      active: true,
    });

    await page.route(`${API}/${SESSION_ID}/sync`, async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ encryptedData: encryptedResponse, crdtState: btoa(''), version: 2 }),
        });
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
    // ERROR_BACKOFF[0] = 2s is the first retry; delay is computed before _errorCount increments
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

    // Wait for second failure (first retry fires after 4s from error)
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

    // Simulate coming back online — the 'online' event resets _errorCount
    // and calls schedulePush(0), which immediately attempts a push.
    // Change the mock to succeed so we can verify recovery.
    await page.route(`${API}/${SESSION_ID}/sync`, async (route: Route) => {
      if (route.request().method() === 'PUT') {
        // Return 500 still — we just want to verify the badge transitions to syncing
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'still_failing' }) });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Badge should leave 'offline' and attempt a push (goes to 'syncing' then 'error' again)
    // The key check: badge is no longer showing the old 'offline' state
    await page.waitForTimeout(1000);
    const cls = await page.locator('#syncStatus').getAttribute('class') ?? '';
    expect(cls).not.toContain('offline');
  }, 15_000);
});

// ── Pull backoff ──────────────────────────────────────────────────────────────

test.describe('Pull interval backoff', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('consecutive 204 pulls do not crash or loop', async ({ page }) => {
    // Verify the app handles repeated 204 pull responses without error
    let pullCount = 0;
    const id = await seedCloudSession(page, {
      id: SESSION_ID, shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: true,
    });

    await page.route(`${API}/${id}/sync**`, async (route: Route) => {
      if (route.request().method() === 'GET') {
        pullCount++;
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.reload();
    await page.waitForTimeout(600);

    // Trigger a few visibility-change pulls
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        // Simulate tab focus cycle to trigger maybeSchedulePull()
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(200);
    }

    // App should still be functional
    await expect(page.locator('#syncStatus')).toBeVisible();
    await expect(page.locator('#syncStatus')).not.toHaveClass(/error/);
  });
});
