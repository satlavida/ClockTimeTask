/**
 * Group 5 — Session modal UX (issue_05.md §5).
 *
 * After commit f0cdc51 the create flow changed:
 *   OLD: create → sessionView-success (shows ID and code inline)
 *   NEW: create → closeSessionModal() → openShareModal({ justCreated: true })
 *
 * Tests here cover §5.1-§5.4.
 */

import { test, expect, Page, Route } from '@playwright/test';
import { resetState, seedCloudSession, mockWebSocket, API } from './helpers';

const SESSION_ID   = 'NEWCLSESSION1234';
const OWNER_CODE   = 'OWNERCODE1234567';
const SESSION_NAME = 'Work Planning';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openSessionModal(page: Page) {
  await page.click('#btnOpenSession');
  await page.waitForSelector('#sessionOverlay.open');
}

/** Mock POST /sessions + GET /share-codes so create flow completes without a real backend. */
async function mockCreateFlow(page: Page, opts: { status?: number; body?: object } = {}) {
  const status = opts.status ?? 201;
  const body   = opts.body ?? { sessionId: SESSION_ID, ownerShareCode: OWNER_CODE };

  await page.route(API, async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    } else {
      await route.continue();
    }
  });

  // share-codes GET is called by refreshCodeList() inside openShareModal()
  await page.route(`${API}/${SESSION_ID}/share-codes`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shareCodes: [] }),
    });
  });

  // WS will try to connect when session becomes active
  await mockWebSocket(page, { behavior: 'silent' });
}

async function doCreate(page: Page, name = SESSION_NAME) {
  await openSessionModal(page);
  await page.click('#btnGoCreate');
  await page.waitForSelector('#sessionView-create:not(.hidden)');
  await page.fill('#sessionNameInput', name);
  await page.click('#btnCreateSession');
  await page.waitForTimeout(600);
}

// ── 5.1 Home view — session list ─────────────────────────────────────────────

test.describe('5.1 Home view — session list', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('5.1.1 open session modal → #sessionView-home visible, #sessionModalList present', async ({ page }) => {
    await openSessionModal(page);
    await expect(page.locator('#sessionView-home')).toBeVisible();
    await expect(page.locator('#sessionModalList')).toBeVisible();
  });

  test('5.1.2 local session always listed', async ({ page }) => {
    await openSessionModal(page);
    await expect(page.locator('#sessionModalList .ss-item', { hasText: 'Local' })).toBeVisible();
  });

  test('5.1.3 cloud session listed after seed', async ({ page }) => {
    await seedCloudSession(page, {
      id: 'SEEDSESSION12345',
      name: 'Seeded Cloud',
      shareCode: 'SEEDCODE12345678',
      permissions: ['view_tasks'],
      active: false,
    });
    await page.reload();
    await page.waitForTimeout(200);
    await openSessionModal(page);
    await expect(page.locator('#sessionModalList .ss-item', { hasText: 'Seeded Cloud' })).toBeVisible();
  });

  test('5.1.4 active cloud session row has .active class', async ({ page }) => {
    await seedCloudSession(page, {
      id: 'ACTIVESESSION1234',
      name: 'Active Cloud',
      shareCode: 'ACTIVECODE123456',
      permissions: ['view_tasks'],
      active: true,
    });
    await page.route(`${API}/ACTIVESESSION1234/**`, (route: Route) => route.fulfill({ status: 204 }));
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(300);
    await openSessionModal(page);
    const activeItem = page.locator('#sessionModalList .ss-item', { hasText: 'Active Cloud' });
    await expect(activeItem).toHaveClass(/active/);
  });
});

// ── 5.2 Create → ShareModal flow ─────────────────────────────────────────────

test.describe('5.2 Create → ShareModal flow', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('5.2.1 successful create → #sessionOverlay loses .open', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page);
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('5.2.2 successful create → #shareOverlay gains .open', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page);
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
  });

  test('5.2.3 successful create → #shareCreatedBanner visible in ShareModal', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page);
    await expect(page.locator('#shareCreatedBanner')).toBeVisible();
  });

  test('5.2.4 successful create → session chip label shows new session name', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page, SESSION_NAME);
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText(SESSION_NAME);
  });

  test('5.2.5 successful create → no #sessionView-success element (or it is hidden)', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page);
    // Either the element does not exist or is hidden — both satisfy toBeHidden
    await expect(page.locator('#sessionView-success')).toBeHidden();
  });

  test('5.2.6 create fails (API error) → error shown; modals stay as-is', async ({ page }) => {
    await mockCreateFlow(page, { status: 500, body: { error: 'internal_error' } });
    await mockWebSocket(page, { behavior: 'silent' });
    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.waitForSelector('#sessionView-create:not(.hidden)');
    await page.fill('#sessionNameInput', 'Fail Session');
    await page.click('#btnCreateSession');
    await page.waitForTimeout(600);

    await expect(page.locator('#sessionCreateError')).toBeVisible();
    await expect(page.locator('#sessionCreateError')).toContainText(/Could not create/i);
    // Session modal stays open
    await expect(page.locator('#sessionOverlay')).toHaveClass(/open/);
    // Share modal does NOT open
    await expect(page.locator('#shareOverlay')).not.toHaveClass(/open/);
  });

  test('5.2.7 create fails (429 capacity) → specific capacity error message', async ({ page }) => {
    await mockCreateFlow(page, {
      status: 429,
      body: { error: 'session_limit_reached', limit: 50 },
    });
    await mockWebSocket(page, { behavior: 'silent' });
    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.waitForSelector('#sessionView-create:not(.hidden)');
    await page.click('#btnCreateSession');
    await page.waitForTimeout(600);

    await expect(page.locator('#sessionCreateError')).toBeVisible();
    await expect(page.locator('#sessionCreateError')).toContainText(/capacity/i);
  });
});

// ── 5.3 Banner lifecycle ──────────────────────────────────────────────────────

test.describe('5.3 Banner lifecycle', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('5.3.1 open ShareModal normally (not after create) → banner hidden', async ({ page }) => {
    await seedCloudSession(page, {
      id: 'SHARETEST1234567',
      name: 'ShareTest',
      shareCode: 'SHARECODE1234567',
      permissions: ['view_tasks', 'manage_share'],
      active: true,
    });
    await page.route(`${API}/SHARETEST1234567/share-codes`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shareCodes: [] }) })
    );
    await mockWebSocket(page, { behavior: 'silent' });
    await page.route(`${API}/SHARETEST1234567/**`, (route: Route) => route.fulfill({ status: 204 }));
    await page.reload();
    await page.waitForTimeout(300);

    // Open ShareModal via the session switcher share button
    await page.click('#btnSessionChip');
    await page.waitForSelector('#sessionDrop.open');
    const shareBtn = page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)');
    await shareBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    await expect(page.locator('#shareCreatedBanner')).toBeHidden();
  });

  test('5.3.2 close ShareModal after create; reopen via share button → banner hidden', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page, SESSION_NAME);
    // Banner is visible after create
    await expect(page.locator('#shareCreatedBanner')).toBeVisible();

    // Close ShareModal
    await page.click('#btnCloseShare');
    await page.waitForTimeout(200);

    // Reopen via session switcher share button
    await page.click('#btnSessionChip');
    await page.waitForSelector('#sessionDrop.open');
    const shareBtn = page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)');
    await shareBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('#shareCreatedBanner')).toBeHidden();
  });

  test('5.3.3 banner is hidden immediately on closeShareModal()', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page, SESSION_NAME);
    await expect(page.locator('#shareCreatedBanner')).toBeVisible();

    await page.click('#btnCloseShare');
    await page.waitForTimeout(100);

    // Banner should be hidden synchronously after close
    await expect(page.locator('#shareCreatedBanner')).toBeHidden();
  });
});

// ── 5.4 ShareModal title ──────────────────────────────────────────────────────

test.describe('5.4 ShareModal title', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('5.4.1 open ShareModal for named session → title contains session name', async ({ page }) => {
    await mockCreateFlow(page);
    await doCreate(page, SESSION_NAME);
    await expect(page.locator('#shareOverlay .modal-title')).toContainText(SESSION_NAME);
  });

  test('5.4.2 switch session; open ShareModal → title reflects new active session', async ({ page }) => {
    // Seed two cloud sessions
    await seedCloudSession(page, {
      id: 'SESSION_A_123456',
      name: 'Session A',
      shareCode: 'CODEA12345678901',
      permissions: ['view_tasks', 'manage_share'],
      active: false,
    });
    await seedCloudSession(page, {
      id: 'SESSION_B_123456',
      name: 'Session B',
      shareCode: 'CODEB12345678901',
      permissions: ['view_tasks', 'manage_share'],
      active: true,
    });
    await page.route(`${API}/SESSION_B_123456/share-codes`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shareCodes: [] }) })
    );
    await page.route(`${API}/SESSION_B_123456/**`, (route: Route) => route.fulfill({ status: 204 }));
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(300);

    // Open ShareModal for Session B (the active one)
    await page.click('#btnSessionChip');
    await page.waitForSelector('#sessionDrop.open');
    const shareBtn = page.locator('#sessionList .ss-item.active .ss-item-action:not(.danger)');
    await shareBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('#shareOverlay .modal-title')).toContainText('Session B');
  });

  test('5.4.3 blank session name → title falls back gracefully', async ({ page }) => {
    // Create with empty name — app defaults to "My Session"
    await mockCreateFlow(page);
    await openSessionModal(page);
    await page.click('#btnGoCreate');
    await page.waitForSelector('#sessionView-create:not(.hidden)');
    // Leave name blank
    await page.click('#btnCreateSession');
    await page.waitForTimeout(600);

    // Title should be present and not empty
    const title = await page.locator('#shareOverlay .modal-title').textContent();
    expect(title?.trim().length).toBeGreaterThan(0);
  });
});
