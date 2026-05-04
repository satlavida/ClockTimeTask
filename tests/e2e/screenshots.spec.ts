import { test, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.resolve(__dirname, '../screenshots');

async function shot(page: Page, name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: false });
}

async function freshPage(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
}

async function addTask(page: Page, name: string, hours = '0', mins = '30') {
  await page.fill('#fName', name);
  await page.fill('#fHours', hours);
  await page.fill('#fMins', mins);
  await page.click('#btnAddFree');
  await page.waitForTimeout(100);
}

test.describe('Screenshot sweep', () => {
  test('01-empty-state', async ({ page }) => {
    await freshPage(page);
    await shot(page, '01-empty-state');
  });

  test('02-one-task', async ({ page }) => {
    await freshPage(page);
    await addTask(page, 'Morning Focus', '1', '30');
    await shot(page, '02-one-task');
  });

  test('03-multiple-tasks', async ({ page }) => {
    await freshPage(page);
    await addTask(page, 'Deep Work', '2', '0');
    await addTask(page, 'Lunch', '0', '45');
    await addTask(page, 'Admin', '1', '0');
    await shot(page, '03-multiple-tasks');
  });

  test('04-budget-mode', async ({ page }) => {
    await freshPage(page);
    await page.click('#btnBudget');
    await page.waitForTimeout(100);
    await shot(page, '04-budget-mode');
  });

  test('05-settings-modal', async ({ page }) => {
    await freshPage(page);
    await page.click('#btnOpenSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await shot(page, '05-settings-modal');
  });

  test('06-task-edit-modal', async ({ page }) => {
    await freshPage(page);
    await addTask(page, 'Edit Me', '0', '30');
    await page.locator('#taskList .t-edit').first().click();
    await page.waitForSelector('#taskEditOverlay.open');
    await shot(page, '06-task-edit-modal');
  });

  test('07-privacy-modal', async ({ page }) => {
    await freshPage(page);
    await page.click('#btnOpenPrivacy');
    await page.waitForSelector('#privacyOverlay.open');
    await shot(page, '07-privacy-modal');
  });

  test('08-24h-clock', async ({ page }) => {
    await freshPage(page);
    await page.click('#btnOpenSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.locator('#setClock24h').locator('..').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await shot(page, '08-24h-clock');
  });
});
