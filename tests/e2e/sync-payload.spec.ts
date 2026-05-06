/**
 * Groups 2.6 and 2.7 from issue_05.md:
 *
 * 2.6  Push payload shape — PUT /sync and POST /sessions bodies must not
 *      contain CRDT fields (crdtUpdate, clientVersion, crdtState).
 *
 * 2.7  Yjs removed from bundle — dist/main.js must not reference yjs or Y.Doc.
 */

import { test, expect, Route } from '@playwright/test';
import { resetState, seedCloudSession, mockWebSocket, API } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_ID = 'PAYLOADTEST12345';
const SHARE_CODE = 'PAYLOADCODE12345';

async function setupForPush(page: import('@playwright/test').Page) {
  await resetState(page);
  await seedCloudSession(page, {
    id: SESSION_ID,
    shareCode: SHARE_CODE,
    permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'edit_budget', 'manage_share'],
    active: true,
  });
  await mockWebSocket(page, { behavior: 'connected', encryptedData: null, version: 1 });
  await page.reload();
  await page.waitForTimeout(300);
}

// ── 2.6 Push payload shape ───────────────────────────────────────────────────

test.describe('2.6 Push payload shape', () => {
  test('2.6.1 PUT /sync body has only encryptedData — no crdtUpdate, no clientVersion', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await resetState(page);
    await seedCloudSession(page, {
      id: SESSION_ID,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'edit_budget'],
      active: true,
    });
    await mockWebSocket(page, { behavior: 'connected', encryptedData: null, version: 1 });

    await page.route(`${API}/${SESSION_ID}/sync`, async (route: Route) => {
      if (route.request().method() === 'PUT') {
        capturedBody = await route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ encryptedData: capturedBody!.encryptedData, version: 2 }),
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.reload();
    await page.waitForTimeout(300);

    // Add a task to trigger a push
    await page.fill('#fName', 'Payload Test Task');
    await page.fill('#fMins', '30');
    await page.click('#btnAddFree');

    // Wait for the 2s debounce + push
    await page.waitForTimeout(3000);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody).toHaveProperty('encryptedData');
    expect(capturedBody).not.toHaveProperty('crdtUpdate');
    expect(capturedBody).not.toHaveProperty('clientVersion');
  });

  test('2.6.2 POST /sessions body has only name and encryptedData — no crdtState', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await resetState(page);

    await page.route(`${API}`, async (route: Route) => {
      if (route.request().method() === 'POST') {
        capturedBody = await route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ sessionId: 'NEWSESSION12345', ownerShareCode: 'OWNERCODE1234567' }),
        });
      } else {
        await route.continue();
      }
    });

    // Also intercept the join that follows create
    await page.route(`${API}/NEWSESSION12345/join`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encryptedData: null,
          permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'edit_budget', 'manage_share'],
          version: 1,
          name: 'New Session',
        }),
      });
    });

    // Also intercept share-codes GET that follows join
    await page.route(`${API}/NEWSESSION12345/share-codes`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ shareCodes: [] }),
      });
    });

    await mockWebSocket(page, { behavior: 'silent' });

    // Open session modal and create a new session
    await page.click('#btnOpenSession');
    await page.waitForSelector('#sessionOverlay.open');
    await page.click('#btnGoCreate');
    await page.waitForSelector('#sessionView-create:not(.hidden)', { timeout: 3000 });
    await page.fill('#sessionNameInput', 'New Session');
    await page.click('#btnCreateSession');

    await page.waitForTimeout(1000);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody).toHaveProperty('encryptedData');
    expect(capturedBody).not.toHaveProperty('crdtState');
  });
});

// ── 2.7 Yjs removed from bundle ──────────────────────────────────────────────

test.describe('2.7 Yjs removed from bundle', () => {
  test('2.7.1 dist/main.js does not contain "yjs"', async () => {
    const bundlePath = path.join(process.cwd(), 'dist', 'main.js');
    const content = fs.readFileSync(bundlePath, 'utf-8');
    const count = (content.match(/\byjs\b/g) ?? []).length;
    expect(count, 'Found "yjs" references in dist/main.js').toBe(0);
  });

  test('2.7.2 dist/main.js does not contain "Y.Doc"', async () => {
    const bundlePath = path.join(process.cwd(), 'dist', 'main.js');
    const content = fs.readFileSync(bundlePath, 'utf-8');
    expect(content.includes('Y.Doc'), 'Found "Y.Doc" in dist/main.js').toBe(false);
  });
});
