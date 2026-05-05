/**
 * Permission gating tests.
 *
 * applyPermissions() in app.js sets el.hidden = !perms.includes(el.dataset.perm)
 * on every refresh().  These tests verify that each cloud-session permission
 * level correctly shows or hides the matching UI elements.
 *
 * Elements under test (from index.html):
 *   data-perm="edit_tasks"  → #freePanel, #btnClearAll
 *   data-perm="edit_budget" → [data-sec="mode"], [data-sec="start"]
 */

import { test, expect, Page, Route } from '@playwright/test';
import { resetState, seedCloudSession, API } from './helpers';
import * as path from 'path';
import * as fs from 'fs';

const ALL_PERMS = [
  'view_tasks', 'edit_tasks', 'reorder_tasks',
  'view_notes', 'edit_notes', 'edit_budget', 'manage_share',
];

// Silence background sync during permission tests — we don't care about sync state here.
async function silenceSync(page: Page, sessionId: string) {
  await page.route(`${API}/${sessionId}/sync**`, async (route: Route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 204 });
    else await route.fulfill({ status: 500 }); // push fails silently
  });
}

async function screenshotDir() {
  const dir = path.join(process.cwd(), 'tests', 'screenshots', 'permissions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Local session (default) ───────────────────────────────────────────────────

test.describe('Local session — all elements visible', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('add-task panel visible', async ({ page }) => {
    await expect(page.locator('#freePanel')).not.toBeHidden();
  });

  test('mode section visible', async ({ page }) => {
    await expect(page.locator('[data-sec="mode"]')).not.toBeHidden();
  });

  test('start-time section visible', async ({ page }) => {
    await expect(page.locator('[data-sec="start"]')).not.toBeHidden();
  });

  test('clear-all button visible', async ({ page }) => {
    await expect(page.locator('#btnClearAll')).not.toBeHidden();
  });
});

// ── View-only session ─────────────────────────────────────────────────────────

test.describe('View-only session (view_tasks only)', () => {
  test.beforeEach(({ page }) => resetState(page));

  async function setup(page: Page) {
    const id = await seedCloudSession(page, { permissions: ['view_tasks'] });
    await silenceSync(page, id);
    await page.reload();
    await page.waitForTimeout(300);
    return id;
  }

  test('add-task panel is hidden', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#freePanel')).toBeHidden();
  });

  test('add-task button is not reachable inside hidden panel', async ({ page }) => {
    await setup(page);
    // #btnAddFree lives inside #freePanel; hidden parent makes it unreachable
    await expect(page.locator('#btnAddFree')).toBeHidden();
  });

  test('clear-all button is hidden', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#btnClearAll')).toBeHidden();
  });

  test('mode section is hidden', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="mode"]')).toBeHidden();
  });

  test('start-time section is hidden', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="start"]')).toBeHidden();
  });

  test('screenshot of view-only state', async ({ page }) => {
    await setup(page);
    const dir = await screenshotDir();
    await page.screenshot({ path: path.join(dir, '01-view-only.png'), fullPage: false });
  });
});

// ── Collaborator session ──────────────────────────────────────────────────────

test.describe('Collaborator session (edit_tasks, no edit_budget)', () => {
  test.beforeEach(({ page }) => resetState(page));

  async function setup(page: Page) {
    const id = await seedCloudSession(page, {
      permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'view_notes', 'edit_notes'],
    });
    await silenceSync(page, id);
    await page.reload();
    await page.waitForTimeout(300);
    return id;
  }

  test('add-task panel is visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#freePanel')).not.toBeHidden();
  });

  test('clear-all button is visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#btnClearAll')).not.toBeHidden();
  });

  test('mode section is hidden (no edit_budget)', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="mode"]')).toBeHidden();
  });

  test('start-time section is hidden (no edit_budget)', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="start"]')).toBeHidden();
  });

  test('screenshot of collaborator state', async ({ page }) => {
    await setup(page);
    const dir = await screenshotDir();
    await page.screenshot({ path: path.join(dir, '02-collaborator.png'), fullPage: false });
  });
});

// ── Full-permissions cloud session ────────────────────────────────────────────

test.describe('Full-permissions cloud session', () => {
  test.beforeEach(({ page }) => resetState(page));

  async function setup(page: Page) {
    const id = await seedCloudSession(page, { permissions: ALL_PERMS });
    await silenceSync(page, id);
    await page.reload();
    await page.waitForTimeout(300);
    return id;
  }

  test('add-task panel visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#freePanel')).not.toBeHidden();
  });

  test('mode section visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="mode"]')).not.toBeHidden();
  });

  test('start-time section visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-sec="start"]')).not.toBeHidden();
  });

  test('clear-all button visible', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#btnClearAll')).not.toBeHidden();
  });

  test('screenshot of full-permissions state', async ({ page }) => {
    await setup(page);
    const dir = await screenshotDir();
    await page.screenshot({ path: path.join(dir, '03-full-permissions.png'), fullPage: false });
  });
});

// ── Session switching restores permissions ────────────────────────────────────

test.describe('Switching sessions updates permission gating', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('switching from restricted cloud to local restores hidden elements', async ({ page }) => {
    const id = await seedCloudSession(page, { permissions: ['view_tasks'] });
    await silenceSync(page, id);
    await page.reload();
    await page.waitForTimeout(300);

    // Verify restricted
    await expect(page.locator('#freePanel')).toBeHidden();

    // Switch to local
    await page.evaluate(() => {
      localStorage.setItem('clocktask_active_session_v1', 'local');
    });
    await page.reload();
    await page.waitForTimeout(300);

    // Elements should be visible again
    await expect(page.locator('#freePanel')).not.toBeHidden();
    await expect(page.locator('[data-sec="mode"]')).not.toBeHidden();
    await expect(page.locator('#btnClearAll')).not.toBeHidden();
  });

  test('switching from full-perms to view-only hides elements', async ({ page }) => {
    // Start with full perms
    const fullId = await seedCloudSession(page, {
      id: 'FULLPERMSESSION1',
      permissions: ALL_PERMS,
    });
    await silenceSync(page, fullId);
    await page.reload();
    await page.waitForTimeout(300);
    await expect(page.locator('#freePanel')).not.toBeHidden();

    // Seed a second session with view-only and switch to it
    const viewId = await seedCloudSession(page, {
      id: 'VIEWONLYSESSION1',
      permissions: ['view_tasks'],
      active: true,
    });
    await silenceSync(page, viewId);
    await page.reload();
    await page.waitForTimeout(300);

    await expect(page.locator('#freePanel')).toBeHidden();
    await expect(page.locator('[data-sec="mode"]')).toBeHidden();
  });
});
