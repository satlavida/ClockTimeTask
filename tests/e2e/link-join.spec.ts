/**
 * Link-join flow tests.
 *
 * Covers the ?action=join&id=X&code=Y URL-based join path:
 *   - modal auto-opens on page load when params are present
 *   - "Save to my sessions" checked  → full persistent join (registry + active session updated)
 *   - "Save to my sessions" unchecked → ephemeral join (registry untouched, local data preserved)
 *   - cancel clears URL params without changing session state
 *   - error cases surface friendly messages without closing the modal
 *   - ShareModal "Copy Link" button generates a correctly-formed URL
 *
 * Key constraint: resetState() must run before any page.evaluate() or
 * crypto API calls, because those require an HTTP page context.
 */

import { test, expect, Route } from '@playwright/test';
import {
  resetState,
  encryptForSession,
  minimalState,
  seedCloudSession,
  API,
} from './helpers';

const SESSION_ID = 'LINKJOINSESS1234';
const SHARE_CODE = 'LINKCODE12345678';

// Build mock API payload — must be called after resetState so the page has
// an HTTP context for crypto.subtle to work.
async function buildMock(page: import('@playwright/test').Page, permissions: string[], version = 1) {
  const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());
  return { encrypted, permissions, version };
}

// Navigate to the app with join params. Call AFTER resetState.
async function gotoWithJoinParams(
  page: import('@playwright/test').Page,
  id = SESSION_ID,
  code = SHARE_CODE,
) {
  await page.goto(`/?action=join&id=${id}&code=${code}`);
  await page.waitForTimeout(300);
}

// ── URL detection ─────────────────────────────────────────────────────────────

test.describe('URL param detection', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('link-join modal opens automatically when ?action=join params are present', async ({ page }) => {
    await gotoWithJoinParams(page);
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/, { timeout: 3000 });
    await expect(page.locator('#sessionView-link-join')).toBeVisible();
    await expect(page.locator('#sessionView-home')).toBeHidden();
    await expect(page.locator('#sessionView-join')).toBeHidden();
  });

  test('no modal on plain navigation (no params)', async ({ page }) => {
    // resetState already navigated to '/' — just verify no modal
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('no modal when action param is missing', async ({ page }) => {
    await page.goto(`/?id=${SESSION_ID}&code=${SHARE_CODE}`);
    await page.waitForTimeout(300);
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('no modal when id param is missing', async ({ page }) => {
    await page.goto(`/?action=join&code=${SHARE_CODE}`);
    await page.waitForTimeout(300);
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('no modal when code param is missing', async ({ page }) => {
    await page.goto(`/?action=join&id=${SESSION_ID}`);
    await page.waitForTimeout(300);
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('"Save to my sessions" checkbox is checked by default', async ({ page }) => {
    await gotoWithJoinParams(page);
    await expect(page.locator('#linkJoinSaveToggle')).toBeChecked();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────────────

test.describe('Cancel link-join', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('cancel closes modal', async ({ page }) => {
    await gotoWithJoinParams(page);
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/, { timeout: 3000 });
    await page.click('#btnLinkJoinCancel');
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('cancel clears URL params', async ({ page }) => {
    await gotoWithJoinParams(page);
    await page.click('#btnLinkJoinCancel');
    const url = page.url();
    expect(url).not.toContain('action=join');
    expect(url).not.toContain('id=');
    expect(url).not.toContain('code=');
  });

  test('cancel leaves active session as Local', async ({ page }) => {
    await gotoWithJoinParams(page);
    await page.click('#btnLinkJoinCancel');
    const active = await page.evaluate(() => localStorage.getItem('clocktask_active_session_v1'));
    expect(active === null || active === 'local').toBe(true);
  });
});

// ── Persistent join (Save checked) ───────────────────────────────────────────

test.describe('Link-join with Save checked (persist=true)', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('modal closes and URL is cleaned after successful join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks', 'edit_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await gotoWithJoinParams(page);
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/, { timeout: 3000 });
    await page.locator('#btnDoLinkJoin').click();

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });
    expect(page.url()).not.toContain('action=join');
  });

  test('session is stored in registry', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const stored = await page.evaluate((id) => {
      const list = JSON.parse(localStorage.getItem('clocktask_sessions_v1') || '[]') as { id: string; type: string; shareCode: string }[];
      return list.find((s) => s.id === id) ?? null;
    }, SESSION_ID);

    expect(stored).not.toBeNull();
    expect(stored!.type).toBe('cloud');
    expect(stored!.shareCode).toBe(SHARE_CODE);
  });

  test('active session is updated to the joined session', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks', 'edit_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const activeId = await page.evaluate(() => localStorage.getItem('clocktask_active_session_v1'));
    expect(activeId).toBe(SESSION_ID);
  });

  test('session chip updates away from Local', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks', 'edit_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    await expect(page.locator('#btnSessionChip .ss-lbl')).not.toHaveText('Local');
  });

  test('view-only permissions hide edit UI after link-join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    await expect(page.locator('#freePanel')).toBeHidden();
    await expect(page.locator('[data-sec="mode"]')).toBeHidden();
  });
});

// ── Ephemeral join (Save unchecked) ──────────────────────────────────────────

test.describe('Link-join with Save unchecked (persist=false)', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('modal closes after successful join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks', 'edit_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#linkJoinSaveToggle').uncheck();
    await page.locator('#btnDoLinkJoin').click();

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });
  });

  test('session is NOT stored in registry', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#linkJoinSaveToggle').uncheck();
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const stored = await page.evaluate((id) => {
      const list = JSON.parse(localStorage.getItem('clocktask_sessions_v1') || '[]') as { id: string }[];
      return list.find((s) => s.id === id) ?? null;
    }, SESSION_ID);

    expect(stored).toBeNull();
  });

  test('active session remains Local after ephemeral join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#linkJoinSaveToggle').uncheck();
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    const activeId = await page.evaluate(() => localStorage.getItem('clocktask_active_session_v1'));
    expect(activeId === null || activeId === 'local').toBe(true);
  });

  test('local data is NOT overwritten in localStorage', async ({ page }) => {
    // Seed a local task before joining
    const localTask = { id: 'T1', label: 'Local task', duration: 30, color: '#fff' };
    await page.evaluate((task) => {
      const state = { tasks: [task], notes: [], mode: 'free',
        budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 },
        startTime: new Date().toISOString(), settings: {} };
      localStorage.setItem('clocktask_v4', JSON.stringify(state));
    }, localTask);

    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#linkJoinSaveToggle').uncheck();
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    // Local key must still contain the original local task
    const localStored = await page.evaluate(() => {
      const raw = localStorage.getItem('clocktask_v4');
      return raw ? JSON.parse(raw) : null;
    });
    expect(localStored?.tasks).toHaveLength(1);
    expect(localStored?.tasks[0].label).toBe('Local task');
  });

  test('URL is cleaned after ephemeral join', async ({ page }) => {
    const { encrypted, permissions, version } = await buildMock(page, ['view_tasks']);
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ encryptedData: encrypted, permissions, version }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#linkJoinSaveToggle').uncheck();
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });

    expect(page.url()).not.toContain('action=join');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('Link-join error handling', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('invalid share code shows error and keeps modal open', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_share_code' }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();

    await expect(page.locator('#sessionLinkJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionLinkJoinError')).toContainText('Invalid share code');
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/);
  });

  test('session not found shows error and keeps modal open', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ error: 'session_not_found' }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();

    await expect(page.locator('#sessionLinkJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionLinkJoinError')).toContainText('not found');
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/);
  });

  test('network failure shows fallback error and keeps modal open', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, (route: Route) => route.abort('failed'));

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();

    await expect(page.locator('#sessionLinkJoinError')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionLinkJoinError')).toContainText('Check your link');
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/);
  });

  test('error does not clear URL params', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_share_code' }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionLinkJoinError')).toBeVisible({ timeout: 3000 });

    expect(page.url()).toContain('action=join');
  });

  test('join button re-enables after error', async ({ page }) => {
    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_share_code' }) });
    });

    await gotoWithJoinParams(page);
    await page.locator('#btnDoLinkJoin').click();
    await expect(page.locator('#sessionLinkJoinError')).toBeVisible({ timeout: 3000 });

    await expect(page.locator('#btnDoLinkJoin')).toBeEnabled();
    await expect(page.locator('#btnDoLinkJoin')).toHaveText('Join Session');
  });
});

// ── ShareModal Copy Link button ───────────────────────────────────────────────

test.describe('Copy Link button in Share modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await seedCloudSession(page, {
      id: SESSION_ID,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks', 'manage_share'],
      active: true,
    });

    await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ shareCodes: [
          { shareCode: 'VIEWCODE12345678', permissions: ['view_tasks'], createdAt: new Date().toISOString() },
        ]}),
      });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });

    await page.reload();
    await page.waitForTimeout(300);
  });

  async function openShareModal(page: import('@playwright/test').Page) {
    await page.click('#btnSessionChip');
    await page.waitForSelector('#sessionDrop.open');
    await page.locator('.ss-item-action[title="Manage share codes"]').first().click();
    await page.waitForSelector('#shareOverlay.open');
  }

  test('"Copy Link" button appears in share code list', async ({ page }) => {
    await openShareModal(page);

    const linkBtn = page.locator('.share-code-actions button', { hasText: 'Copy Link' }).first();
    await expect(linkBtn).toBeVisible({ timeout: 3000 });
  });

  test('"Copy Link" generates a URL with action=join, id, and code params', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await openShareModal(page);

    const linkBtn = page.locator('.share-code-actions button', { hasText: 'Copy Link' }).first();
    await linkBtn.click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const url = new URL(copied);

    expect(url.searchParams.get('action')).toBe('join');
    expect(url.searchParams.get('id')).toBe(SESSION_ID);
    expect(url.searchParams.get('code')).toBe('VIEWCODE12345678');
  });
});
