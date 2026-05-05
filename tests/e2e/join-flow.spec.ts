/**
 * Join session flow tests.
 *
 * The join flow requires real AES-GCM decryption — the mock server must return
 * ciphertext that was actually encrypted with the share code and session ID.
 * encryptForSession() in helpers.ts mirrors the algorithm in sessions.js so
 * the client's decryptState() will succeed.
 *
 * Bugs documented here:
 *   - joinSession() always names the session "Session <first 6 chars of ID>"
 *     regardless of any user-supplied name (no name input in the join form).
 */

import { test, expect, Route } from '@playwright/test';
import { resetState, openSessionModal, seedCloudSession, encryptForSession, minimalState, API } from './helpers';

const SESSION_ID = 'JOINSESSION12345';
const SHARE_CODE = 'JOINCODE12345678';

// Pre-encrypt the minimal state before test execution (requires page context)
async function buildJoinMock(page: import('@playwright/test').Page, permissions: string[], version = 1) {
  const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());
  return { encrypted, permissions, version };
}

// ── Validation ────────────────────────────────────────────────────────────────

test.describe('Join form validation', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('empty fields show error without calling the API', async ({ page }) => {
    let apiCalled = false;
    await page.route(`${API}/**`, () => { apiCalled = true; });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionJoinError')).toBeVisible();
    await expect(page.locator('#sessionJoinError')).toContainText('Enter both');
    expect(apiCalled).toBe(false);
  });

  test('session ID only shows error', async ({ page }) => {
    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.click('#btnDoJoin');
    await expect(page.locator('#sessionJoinError')).toBeVisible();
  });

  test('share code only shows error', async ({ page }) => {
    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');
    await expect(page.locator('#sessionJoinError')).toBeVisible();
  });
});

// ── API error handling ────────────────────────────────────────────────────────

test.describe('Join API error handling', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('invalid share code shows user-friendly message', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_share_code' }) });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', 'WRONGCODE1234567');
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionJoinError')).toContainText('Invalid share code');
  });

  test('session not found shows user-friendly message', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ error: 'session_not_found' }) });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionJoinError')).toContainText('not found');
  });

  test('network failure shows fallback error message', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, (route: Route) => route.abort('failed'));

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionJoinError')).toContainText('Could not join');
  });
});

// ── Successful join with real crypto ─────────────────────────────────────────

test.describe('Successful join', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('modal closes and session chip updates after successful join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildJoinMock(page,
      ['view_tasks', 'edit_tasks', 'reorder_tasks', 'view_notes', 'edit_notes']
    );

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    // Modal should close
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    // Chip should no longer say "Local"
    await expect(page.locator('#btnSessionChip .ss-lbl')).not.toHaveText('Local');
  });

  test('session stored in registry with correct permissions', async ({ page }) => {
    const viewOnlyPerms = ['view_tasks'];
    const { encrypted, permissions, version } = await buildJoinMock(page, viewOnlyPerms);

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const stored = await page.evaluate((id) => {
      const list = JSON.parse(localStorage.getItem('clocktask_sessions_v1') || '[]') as {
        id: string; type: string; shareCode: string; permissions: string[];
      }[];
      return list.find((s) => s.id === id) ?? null;
    }, SESSION_ID);

    expect(stored).not.toBeNull();
    expect(stored!.type).toBe('cloud');
    expect(stored!.shareCode).toBe(SHARE_CODE);
    expect(stored!.permissions).toEqual(viewOnlyPerms);
  });

  test('active session ID updated to joined session', async ({ page }) => {
    const { encrypted, permissions, version } = await buildJoinMock(page, ['view_tasks', 'edit_tasks']);

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const activeId = await page.evaluate(() => localStorage.getItem('clocktask_active_session_v1'));
    expect(activeId).toBe(SESSION_ID);
  });

  test('view-only join hides edit UI immediately after modal closes', async ({ page }) => {
    const { encrypted, permissions, version } = await buildJoinMock(page, ['view_tasks']);

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    // Permissions from the join response (view_tasks only) must be applied immediately
    await expect(page.locator('#freePanel')).toBeHidden();
    await expect(page.locator('#btnClearAll')).toBeHidden();
    await expect(page.locator('[data-sec="mode"]')).toBeHidden();
    await expect(page.locator('[data-sec="start"]')).toBeHidden();
  });

  test('full-permissions join leaves all edit UI visible', async ({ page }) => {
    const fullPerms = [
      'view_tasks', 'edit_tasks', 'reorder_tasks',
      'view_notes', 'edit_notes', 'edit_budget', 'manage_share',
    ];
    const { encrypted, permissions, version } = await buildJoinMock(page, fullPerms);

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    await expect(page.locator('#freePanel')).not.toBeHidden();
    await expect(page.locator('[data-sec="mode"]')).not.toBeHidden();
    await expect(page.locator('[data-sec="start"]')).not.toBeHidden();
    await expect(page.locator('#btnClearAll')).not.toBeHidden();
  });
});

// ── Session switcher shows joined session ─────────────────────────────────────

test.describe('Session switcher after join', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('joined session appears in switcher dropdown', async ({ page }) => {
    const { encrypted, permissions, version } = await buildJoinMock(page, ['view_tasks', 'edit_tasks']);

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await openSessionModal(page);
    await page.click('#btnGoJoin');
    await page.fill('#joinSessionId', SESSION_ID);
    await page.fill('#joinShareCode', SHARE_CODE);
    await page.click('#btnDoJoin');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    // Open the switcher dropdown
    await page.click('#btnSessionChip');
    await expect(page.locator('#sessionDrop')).toHaveClass(/open/);

    // The joined session entry should be in the list
    // sessions.js names it "Session <first 6 chars>" (documented behavior, not a bug)
    const expectedName = `Session ${SESSION_ID.slice(0, 6)}`;
    await expect(page.locator('#sessionList')).toContainText(expectedName);
  });

  test('can remove joined session from switcher', async ({ page }) => {
    // Seed session directly (skip join flow for speed)
    const id = await seedCloudSession(page, {
      id: SESSION_ID,
      permissions: ['view_tasks', 'edit_tasks', 'manage_share'],
    });
    // Mock both sync and DELETE so tests don't depend on the real backend
    await page.route(`${API}/${id}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });
    await page.route(`${API}/${id}`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });
    await page.reload();
    await page.waitForTimeout(300);

    await page.click('#btnSessionChip');
    const item = page.locator('#sessionList .ss-item', { hasText: 'Test Cloud' });
    await expect(item).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await item.locator('.ss-item-action.danger').click();
    await page.waitForTimeout(300);

    // Should fall back to Local
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText('Local');
  });
});
