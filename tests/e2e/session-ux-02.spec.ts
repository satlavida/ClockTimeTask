/**
 * UI regression tests for UX improvements in Wave 02 (issue_02.md).
 *
 *  Issue 1 — Session modal home view lists existing sessions
 *  Issue 2 — Joined sessions use the creator's name from the backend response
 *  Issue 3 — After create, session modal closes and ShareModal opens with banner
 *  Issue 4 — ShareModal title includes the active session name  [status: todo]
 */

import { test, expect, Route } from '@playwright/test';
import {
  resetState, openSessionModal, seedCloudSession,
  encryptForSession, minimalState, mockWebSocket, API,
} from './helpers';

const SESSION_ID  = 'WAVE02SESSION1234';
const SHARE_CODE  = 'WAVE02CODE1234567';
const SESSION_NAME = 'Work Planning';

// ── Issue 1 — Session modal home lists sessions ────────────────────────────────

test.describe('Issue 1 — Session modal home lists sessions', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('home view renders a session list container', async ({ page }) => {
    await openSessionModal(page);
    await expect(page.locator('#sessionView-home')).toBeVisible();
    await expect(page.locator('#sessionModalList')).toBeVisible();
  });

  test('local session always appears in the modal list', async ({ page }) => {
    await openSessionModal(page);
    const list = page.locator('#sessionModalList');
    await expect(list.locator('.ss-item', { hasText: 'Local' })).toBeVisible();
  });

  test('cloud session appears in modal list after being added', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks'],
      active: false,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);
    const list = page.locator('#sessionModalList');
    await expect(list.locator('.ss-item', { hasText: SESSION_NAME })).toBeVisible();
  });

  test('active session is marked active in the modal list', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: true,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);
    const activeItem = page.locator('#sessionModalList .ss-item.active');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText(SESSION_NAME);
  });

  test('share button only appears for sessions with manage_share permission', async ({ page }) => {
    // Session without manage_share
    await seedCloudSession(page, {
      id: 'NOSHAREPERM12345',
      name: 'No Share',
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks'],
      active: false,
    });
    // Session with manage_share
    await seedCloudSession(page, {
      id: 'HASSHAREPERM1234',
      name: 'Has Share',
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'manage_share'],
      active: false,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);

    const noShareItem = page.locator('#sessionModalList .ss-item', { hasText: 'No Share' });
    const hasShareItem = page.locator('#sessionModalList .ss-item', { hasText: 'Has Share' });

    await expect(noShareItem.locator('.ss-item-action:not(.danger)')).toHaveCount(0);
    await expect(hasShareItem.locator('.ss-item-action:not(.danger)')).toBeVisible();
  });

  test('switching session from modal list closes the modal', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: false,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);
    await page.locator('#sessionModalList .ss-item', { hasText: SESSION_NAME }).click();

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 3000 });
  });

  test('switching session from modal updates the session chip label', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: false,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);
    await page.locator('#sessionModalList .ss-item', { hasText: SESSION_NAME }).click();

    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText(SESSION_NAME, { timeout: 3000 });
  });

  test('delete button appears only for cloud sessions in modal list', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: false,
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    await openSessionModal(page);

    const localItem = page.locator('#sessionModalList .ss-item', { hasText: 'Local' });
    const cloudItem = page.locator('#sessionModalList .ss-item', { hasText: SESSION_NAME });

    await expect(localItem.locator('.ss-item-action.danger')).toHaveCount(0);
    await expect(cloudItem.locator('.ss-item-action.danger')).toBeVisible();
  });

  test('New session and Join session remain as secondary actions', async ({ page }) => {
    await openSessionModal(page);
    await expect(page.locator('#btnGoCreate')).toBeVisible();
    await expect(page.locator('#btnGoJoin')).toBeVisible();
  });
});

// ── Issue 2 — Joined session uses creator's name ───────────────────────────────

test.describe('Issue 2 — Joined session uses creator name from backend', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('session stored with creator name returned by join API', async ({ page }) => {
    const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encryptedData: encrypted,
          permissions: ['view_tasks', 'edit_tasks'],
          version: 1,
          name: SESSION_NAME,
        }),
      });
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
        id: string; name: string;
      }[];
      return list.find(s => s.id === id) ?? null;
    }, SESSION_ID);

    expect(stored).not.toBeNull();
    expect(stored!.name).toBe(SESSION_NAME);
  });

  test('session chip shows creator name (not synthesised Session XXXXXX)', async ({ page }) => {
    const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encryptedData: encrypted,
          permissions: ['view_tasks', 'edit_tasks'],
          version: 1,
          name: SESSION_NAME,
        }),
      });
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
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText(SESSION_NAME);
  });

  test('fallback to Session <id6> when join response has no name', async ({ page }) => {
    const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());
    const expectedFallback = `Session ${SESSION_ID.slice(0, 6)}`;

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encryptedData: encrypted,
          permissions: ['view_tasks'],
          version: 1,
          // no 'name' field — tests the fallback path
        }),
      });
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
        id: string; name: string;
      }[];
      return list.find(s => s.id === id) ?? null;
    }, SESSION_ID);

    expect(stored!.name).toBe(expectedFallback);
  });

  test('creator name appears in modal session list after join', async ({ page }) => {
    const encrypted = await encryptForSession(page, SESSION_ID, SHARE_CODE, minimalState());

    await page.route(`${API}/${SESSION_ID}/join`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encryptedData: encrypted,
          permissions: ['view_tasks'],
          version: 1,
          name: SESSION_NAME,
        }),
      });
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

    // Re-open modal and verify the list shows the creator name
    await openSessionModal(page);
    await expect(page.locator('#sessionModalList .ss-item', { hasText: SESSION_NAME })).toBeVisible();
  });
});

// ── Issue 3 — Post-create opens ShareModal with banner ────────────────────────

test.describe('Issue 3 — Post-create opens ShareModal directly', () => {
  test.beforeEach(({ page }) => resetState(page));

  async function setupCreateMocks(page: import('@playwright/test').Page) {
    await page.route(API, async (route: Route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: SESSION_ID, ownerShareCode: SHARE_CODE }),
      });
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 1 }) });
    });
    await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { shareCode: SHARE_CODE, permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks',
              'view_notes', 'edit_notes', 'edit_budget', 'manage_share'], createdAt: new Date().toISOString() },
        ]),
      });
    });
  }

  test('session modal closes after successful create', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/, { timeout: 5000 });
  });

  test('ShareModal opens automatically after successful create', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/, { timeout: 5000 });
  });

  test('"Session created" banner is visible in ShareModal after create', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/, { timeout: 5000 });
    await expect(page.locator('#shareCreatedBanner')).toBeVisible();
  });

  test('"Session created" banner is not shown when ShareModal opened normally', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'manage_share'],
      active: true,
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });
    await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    // Open share modal via the share (⇄) button in the session switcher dropdown
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)').click();
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    await expect(page.locator('#shareCreatedBanner')).toBeHidden();
  });

  test('"Session created" banner is hidden when ShareModal is closed and reopened', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/, { timeout: 5000 });
    await expect(page.locator('#shareCreatedBanner')).toBeVisible();

    // Close ShareModal
    await page.click('#btnCloseShare');
    await expect(page.locator('#shareOverlay')).not.toHaveClass(/open/);

    // Reopen ShareModal via the share (⇄) button in the session switcher dropdown
    await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)').click();
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    await expect(page.locator('#shareCreatedBanner')).toBeHidden();
  });

  test('no success view is shown — sessionView-success does not exist or stays hidden', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/, { timeout: 5000 });

    // The old success view should either not exist or remain hidden
    const successView = page.locator('#sessionView-success');
    const count = await successView.count();
    if (count > 0) {
      await expect(successView).toBeHidden();
    }
  });

  test('new session appears as active in the chip after create', async ({ page }) => {
    await setupCreateMocks(page);
    await mockWebSocket(page, { behavior: 'silent' });

    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.fill('#sessionNameInput', SESSION_NAME);
    await page.click('#btnCreateSession');

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/, { timeout: 5000 });
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText(SESSION_NAME);
  });
});

// ── Issue 4 — Session name in ShareModal title [status: todo] ─────────────────

test.describe('Issue 4 — ShareModal title shows active session name', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('ShareModal title contains the active session name', async ({ page }) => {
    await seedCloudSession(page, {
      id: SESSION_ID,
      name: SESSION_NAME,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'manage_share'],
      active: true,
    });
    await page.route(`${API}/${SESSION_ID}/sync**`, async (route: Route) => {
      await route.fulfill({ status: 204 });
    });
    await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    // Open ShareModal via the share (⇄) button in the session switcher dropdown
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)').click();
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);

    // The modal title should include the active session name
    await expect(page.locator('#shareOverlay .modal-title')).toContainText(SESSION_NAME);
  });

  test('ShareModal title updates when active session changes', async ({ page }) => {
    const ID_A = 'SESSIONA12345678';
    const ID_B = 'SESSIONB12345678';

    await seedCloudSession(page, {
      id: ID_A,
      name: 'Session Alpha',
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'manage_share'],
      active: false,
    });
    await seedCloudSession(page, {
      id: ID_B,
      name: 'Session Beta',
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'manage_share'],
      active: true,
    });
    for (const id of [ID_A, ID_B]) {
      await page.route(`${API}/${id}/sync**`, async (route: Route) => {
        await route.fulfill({ status: 204 });
      });
      await page.route(`${API}/${id}/share-codes`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
    }
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(200);

    // Open ShareModal for Session Beta (currently active)
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)').click();
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    await expect(page.locator('#shareOverlay .modal-title')).toContainText('Session Beta');

    await page.click('#btnCloseShare');

    // Switch to Session Alpha via the switcher
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item', { hasText: 'Session Alpha' }).click();
    await page.waitForTimeout(200);

    // Open ShareModal for Session Alpha
    await page.click('#btnSessionChip');
    await page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)').click();
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    await expect(page.locator('#shareOverlay .modal-title')).toContainText('Session Alpha');
  });
});
