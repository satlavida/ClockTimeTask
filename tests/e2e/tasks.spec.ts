import { test, expect, Page } from '@playwright/test';

async function resetState(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
}

async function addTask(page: Page, name: string, hours = '0', mins = '30') {
  await page.fill('#fName', name);
  await page.fill('#fHours', hours);
  await page.fill('#fMins', mins);
  await page.click('#btnAddFree');
  await page.waitForTimeout(100);
}

test.describe('Task management', () => {
  test.beforeEach(({ page }) => resetState(page));

  test('add a task appears in the list', async ({ page }) => {
    await addTask(page, 'Deep Work', '1', '30');
    await expect(
      page.locator('#taskList').locator('.t-name', { hasText: 'Deep Work' })
    ).toBeVisible();
  });

  test('remove a task clears it from the list', async ({ page }) => {
    await addTask(page, 'Temp Task');
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item).toBeVisible();
    await item.locator('.t-del').click();
    await expect(page.locator('#taskList [data-task-id]')).toHaveCount(0);
  });

  test('add multiple tasks preserves insertion order', async ({ page }) => {
    for (const [n, m] of [['Alpha', '30'], ['Beta', '45'], ['Gamma', '60']]) {
      await addTask(page, n, '0', m);
    }
    const names = page.locator('#taskList .t-name');
    await expect(names.nth(0)).toContainText('Alpha');
    await expect(names.nth(1)).toContainText('Beta');
    await expect(names.nth(2)).toContainText('Gamma');
  });
});
