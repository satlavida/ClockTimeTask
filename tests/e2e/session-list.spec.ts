/**
 * Group 4 — SessionList component.
 *
 * renderSessionList(container, sessions, callbacks) is used in two places:
 *   - SessionSwitcher dropdown  → #sessionList
 *   - SessionModal home view    → #sessionModalList
 *
 * Most tests drive the SessionSwitcher dropdown; 4.4 compares both.
 */

import { test, expect, Page, Route } from '@playwright/test';
import { resetState, seedCloudSession, mockWebSocket, API } from './helpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openDrop(page: Page) {
  await page.click('#btnSessionChip');
  await page.waitForSelector('#sessionDrop.open');
}

async function openSessionModal(page: Page) {
  await page.click('#btnOpenSession');
  await page.waitForSelector('#sessionOverlay.open');
}

async function seedTwo(page: Page) {
  // local is always present; add a cloud session
  return seedCloudSession(page, {
    id: 'CLOUD12345678901',
    name: 'Work Plan',
    shareCode: 'WORKCODE12345678',
    permissions: ['view_tasks', 'edit_tasks', 'manage_share'],
    active: false,
  });
}

// Silence backend calls so sessions don't error during render
async function silenceAPI(page: Page, sessionId: string) {
  await page.route(`${API}/${sessionId}/**`, (route: Route) => route.fulfill({ status: 204 }));
  await page.route(`${API}/${sessionId}`, (route: Route) => route.fulfill({ status: 204 }));
}

// ── 4.1 Rendering ────────────────────────────────────────────────────────────

test.describe('4.1 Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
  });

  test('4.1.1 local session has .ss-dot.local', async ({ page }) => {
    await openDrop(page);
    const localItem = page.locator('#sessionList .ss-item').first();
    await expect(localItem.locator('.ss-dot.local')).toBeVisible();
  });

  test('4.1.2 cloud session has .ss-dot.cloud', async ({ page }) => {
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await expect(cloudItem.locator('.ss-dot.cloud')).toBeVisible();
  });

  test('4.1.3 active session has .ss-item.active', async ({ page }) => {
    // local is active by default
    await openDrop(page);
    const localItem = page.locator('#sessionList .ss-item', { hasText: 'Local' });
    await expect(localItem).toHaveClass(/active/);
  });

  test('4.1.4 non-active session does not have .active', async ({ page }) => {
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await expect(cloudItem).not.toHaveClass(/active/);
  });

  test('4.1.5 session name rendered in .ss-item-name', async ({ page }) => {
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const nameEl = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' }).locator('.ss-item-name');
    await expect(nameEl).toHaveText('Work Plan');
  });

  test('4.1.6 re-rendering clears previous items (no duplicates)', async ({ page }) => {
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    // Count items before
    const countBefore = await page.locator('#sessionList .ss-item').count();

    // Close and re-open to trigger re-render
    await page.click('#btnSessionChip');
    await page.click('#btnSessionChip');
    await page.waitForSelector('#sessionDrop.open');

    const countAfter = await page.locator('#sessionList .ss-item').count();
    expect(countAfter).toBe(countBefore);
  });
});

// ── 4.2 Action buttons ───────────────────────────────────────────────────────

test.describe('4.2 Action buttons', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
  });

  test('4.2.1 cloud + manage_share → share button present', async ({ page }) => {
    await seedTwo(page); // seeded with manage_share
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    // Share button is .ss-item-action without .danger
    await expect(cloudItem.locator('.ss-item-action:not(.danger)')).toBeVisible();
  });

  test('4.2.2 cloud without manage_share → no share button', async ({ page }) => {
    await seedCloudSession(page, {
      id: 'VIEWONLY12345678',
      name: 'View Only',
      shareCode: 'VIEWCODE12345678',
      permissions: ['view_tasks'],
      active: false,
    });
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'View Only' });
    await expect(cloudItem.locator('.ss-item-action:not(.danger)')).toHaveCount(0);
  });

  test('4.2.3 local session → no share button', async ({ page }) => {
    await openDrop(page);
    const localItem = page.locator('#sessionList .ss-item', { hasText: 'Local' });
    await expect(localItem.locator('.ss-item-action:not(.danger)')).toHaveCount(0);
  });

  test('4.2.4 cloud session → delete button present', async ({ page }) => {
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await expect(cloudItem.locator('.ss-item-action.danger')).toBeVisible();
  });

  test('4.2.5 local session → no delete button', async ({ page }) => {
    await openDrop(page);
    const localItem = page.locator('#sessionList .ss-item', { hasText: 'Local' });
    await expect(localItem.locator('.ss-item-action.danger')).toHaveCount(0);
  });
});

// ── 4.3 Callbacks ────────────────────────────────────────────────────────────

test.describe('4.3 Callbacks', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
  });

  test('4.3.1 click share button → dropdown closes (onShare fired)', async ({ page }) => {
    await openDrop(page);
    // Share btn click in switcher closes the dropdown and opens session modal / share modal
    // The SessionSwitcher onShare = () => { closeDrop(); _onShare?.() }
    // _onShare opens the share modal, but we just check the dropdown closes
    await page.route(`${API}/CLOUD12345678901/share-codes`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shareCodes: [] }) })
    );
    await mockWebSocket(page, { behavior: 'silent' });
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.locator('.ss-item-action:not(.danger)').click();
    await expect(page.locator('#sessionDrop')).not.toHaveClass(/open/);
  });

  test('4.3.2 click share button → does not trigger onSwitch (chip label unchanged)', async ({ page }) => {
    const initialLabel = await page.locator('#btnSessionChip .ss-lbl').textContent();
    await openDrop(page);
    await page.route(`${API}/CLOUD12345678901/share-codes`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shareCodes: [] }) })
    );
    await mockWebSocket(page, { behavior: 'silent' });
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.locator('.ss-item-action:not(.danger)').click();
    // Label should not change to 'Work Plan' — onSwitch was NOT called
    const currentLabel = await page.locator('#btnSessionChip .ss-lbl').textContent();
    expect(currentLabel).toBe(initialLabel);
  });

  test('4.3.3 click delete and confirm → session removed from list', async ({ page }) => {
    await page.route(`${API}/CLOUD12345678901`, (route: Route) =>
      route.fulfill({ status: 204 })
    );
    await openDrop(page);
    page.once('dialog', d => d.accept());
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.locator('.ss-item-action.danger').click();
    await page.waitForTimeout(300);
    // onDelete → syncSwitcher() re-renders the list (dropdown stays open)
    // Cloud session should be gone from the re-rendered list
    await expect(page.locator('#sessionList .ss-item', { hasText: 'Work Plan' })).toHaveCount(0);
  });

  test('4.3.4 click delete and dismiss → session still in list', async ({ page }) => {
    await openDrop(page);
    page.once('dialog', d => d.dismiss());
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.locator('.ss-item-action.danger').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#sessionList .ss-item', { hasText: 'Work Plan' })).toBeVisible();
  });

  test('4.3.5 click non-active session → setActiveSession called (chip label changes)', async ({ page }) => {
    await silenceAPI(page, 'CLOUD12345678901');
    await mockWebSocket(page, { behavior: 'silent' });
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.click();
    await page.waitForTimeout(300);
    // Chip label should now show the cloud session name
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText('Work Plan');
  });

  test('4.3.6 click already-active session → chip label unchanged', async ({ page }) => {
    await openDrop(page);
    // Local is active; clicking Local item should do nothing
    const localItem = page.locator('#sessionList .ss-item', { hasText: 'Local' });
    await localItem.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#btnSessionChip .ss-lbl')).toHaveText('Local');
  });
});

// ── 4.4 Shared between SessionSwitcher and SessionModal ──────────────────────

test.describe('4.4 Shared between SessionSwitcher and SessionModal', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
    await seedTwo(page);
    await page.reload();
    await page.waitForTimeout(200);
  });

  test('4.4.1 same sessions appear in both switcher dropdown and modal list', async ({ page }) => {
    // Get names from switcher dropdown
    await openDrop(page);
    const dropNames = await page.locator('#sessionList .ss-item-name').allTextContents();
    // Close dropdown
    await page.click('#btnSessionChip');

    // Get names from session modal
    await openSessionModal(page);
    const modalNames = await page.locator('#sessionModalList .ss-item-name').allTextContents();

    // Same sessions in same order
    expect(dropNames.sort()).toEqual(modalNames.sort());
  });

  test('4.4.2 SessionSwitcher onSwitch closes dropdown', async ({ page }) => {
    await silenceAPI(page, 'CLOUD12345678901');
    await mockWebSocket(page, { behavior: 'silent' });
    await openDrop(page);
    const cloudItem = page.locator('#sessionList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#sessionDrop')).not.toHaveClass(/open/);
  });

  test('4.4.3 SessionModal onSwitch closes modal', async ({ page }) => {
    await silenceAPI(page, 'CLOUD12345678901');
    await mockWebSocket(page, { behavior: 'silent' });
    await openSessionModal(page);
    const cloudItem = page.locator('#sessionModalList .ss-item', { hasText: 'Work Plan' });
    await cloudItem.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#sessionOverlay')).not.toHaveClass(/open/);
  });

  test('4.4.4 SessionModal onShare opens ShareModal for correct session', async ({ page }) => {
    // Switch to cloud session (needs manage_share) and open modal
    await page.evaluate(() => {
      localStorage.setItem('clocktask_active_session_v1', 'CLOUD12345678901');
    });
    await page.route(`${API}/CLOUD12345678901/share-codes`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shareCodes: [] }) })
    );
    await mockWebSocket(page, { behavior: 'silent' });
    await page.reload();
    await page.waitForTimeout(300);

    await openSessionModal(page);
    const cloudItem = page.locator('#sessionModalList .ss-item.active');
    await cloudItem.locator('.ss-item-action:not(.danger)').click();
    await page.waitForTimeout(300);

    // ShareModal should open
    await expect(page.locator('#shareOverlay')).toHaveClass(/open/);
    // Title should contain the session name
    await expect(page.locator('#shareOverlay .modal-title')).toContainText('Work Plan');
  });
});
