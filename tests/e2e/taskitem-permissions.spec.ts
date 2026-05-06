/**
 * Groups 3.1–3.6 from issue_05.md:
 * TaskItem permission-aware controls.
 *
 * DOM structure from createTaskItem():
 *   .grip          — drag handle, visibility:hidden when no reorder_tasks
 *   .t-edit        — edit button, hidden when no edit_tasks
 *   .t-del         — delete button, hidden when no edit_tasks
 *   input[type=color] — color swatch, disabled when no edit_tasks
 *   .t-name        — task name, click opens inline edit only with edit_tasks
 *   .sub-del       — subtask delete, hidden when no edit_tasks
 *   .sub-add-btn   — subtask add button, absent when no edit_tasks
 *   .sub-name      — subtask name, click opens inline edit only with edit_tasks
 *   .subtask-dur   — subtask duration, click opens inline edit only with edit_tasks
 *
 * draggable attribute on .task-item is "true" only with reorder_tasks.
 */

import { test, expect, Page, Route } from '@playwright/test';
import { resetState, seedCloudSession, mockWebSocket, API } from './helpers';

const SESSION_ID = 'TASKPERM12345678';
const SHARE_CODE = 'TASKPERMCODE1234';

const TASK_STATE = JSON.stringify({
  tasks: [
    {
      id: 'task-001',
      name: 'Test Task',
      color: '#4a90d9',
      duration: 60,
      subtasks: [{ id: 'sub-001', name: 'Sub One', duration: 30 }],
    },
  ],
  notes: [],
  mode: 'free',
  budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 },
  startTime: new Date().toISOString(),
  settings: {},
});

// Seed a cloud session with a task already in state, then reload.
async function setupWithTask(page: Page, permissions: string[]) {
  await resetState(page);
  const id = await seedCloudSession(page, {
    id: SESSION_ID,
    shareCode: SHARE_CODE,
    permissions,
    active: true,
  });

  // Store task state for the cloud session
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, state),
    { key: `clocktask_session_${SESSION_ID}_v1`, state: TASK_STATE }
  );

  await mockWebSocket(page, { behavior: 'connected', encryptedData: null, version: 1 });

  // Silence sync PUT so pushes don't fail noisily
  await page.route(`${API}/${id}/sync`, async (route: Route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500 });
    } else {
      await route.fulfill({ status: 204 });
    }
  });

  await page.reload();
  await page.waitForTimeout(400);

  return id;
}

const ALL_PERMS = [
  'view_tasks', 'edit_tasks', 'reorder_tasks',
  'view_notes', 'edit_notes', 'edit_budget', 'manage_share',
];

// ── 3.1 Full permissions (local session / all perms) ─────────────────────────

test.describe('3.1 Full permissions — local session', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
    // Add a task via the UI so we test the local session path
    await page.fill('#fName', 'Full Perm Task');
    await page.fill('#fMins', '60');
    await page.click('#btnAddFree');
    await page.waitForTimeout(200);
  });

  test('3.1.1 edit (✎) and delete (×) buttons visible', async ({ page }) => {
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item.locator('.t-edit')).toBeVisible();
    await expect(item.locator('.t-del')).toBeVisible();
  });

  test('3.1.2 grip not visibility:hidden', async ({ page }) => {
    const grip = page.locator('#taskList [data-task-id] .grip').first();
    const visibility = await grip.evaluate(el => getComputedStyle(el).visibility);
    expect(visibility).not.toBe('hidden');
  });

  test('3.1.3 task item draggable="true"', async ({ page }) => {
    const taskDiv = page.locator('#taskList .task-item').first();
    await expect(taskDiv).toHaveAttribute('draggable', 'true');
  });

  test('3.1.6 clicking task name enters inline edit', async ({ page }) => {
    const nameEl = page.locator('#taskList .t-name').first();
    await nameEl.click();
    const input = page.locator('#taskList .t-name-edit').first();
    await expect(input).toBeVisible();
  });
});

// ── 3.2 Missing edit_tasks (view-only session) ───────────────────────────────

test.describe('3.2 Missing edit_tasks — view-only session', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithTask(page, ['view_tasks', 'reorder_tasks']);
  });

  test('3.2.1 edit button hidden', async ({ page }) => {
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item.locator('.t-edit')).toBeHidden();
  });

  test('3.2.2 delete button hidden', async ({ page }) => {
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item.locator('.t-del')).toBeHidden();
  });

  test('3.2.3 color input disabled', async ({ page }) => {
    const colorInput = page.locator('#taskList [data-task-id] input[type=color]').first();
    await expect(colorInput).toBeDisabled();
  });

  test('3.2.4 clicking task name does NOT open inline edit', async ({ page }) => {
    const nameEl = page.locator('#taskList .t-name').first();
    await nameEl.click();
    const input = page.locator('#taskList .t-name-input').first();
    await expect(input).toHaveCount(0);
  });

  test('3.2.5 subtask delete button hidden', async ({ page }) => {
    const subDel = page.locator('#taskList .sub-del').first();
    await expect(subDel).toBeHidden();
  });

  test('3.2.6 subtask add button absent', async ({ page }) => {
    await expect(page.locator('#taskList .sub-add-btn')).toHaveCount(0);
  });

  test('3.2.7 subtask name click does NOT open inline edit', async ({ page }) => {
    const subName = page.locator('#taskList .sub-name').first();
    await subName.click({ force: true });
    await expect(page.locator('#taskList .sub-name-edit')).toHaveCount(0);
  });

  test('3.2.8 subtask duration click does NOT open inline edit', async ({ page }) => {
    const subDur = page.locator('#taskList .subtask-dur').first();
    await subDur.click({ force: true });
    await expect(page.locator('#taskList .sub-dur-edit')).toHaveCount(0);
  });
});

// ── 3.3 Missing reorder_tasks ─────────────────────────────────────────────────

test.describe('3.3 Missing reorder_tasks', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithTask(page, ['view_tasks', 'edit_tasks']);
  });

  test('3.3.1 grip is visibility:hidden', async ({ page }) => {
    const grip = page.locator('#taskList [data-task-id] .grip').first();
    const visibility = await grip.evaluate(el => getComputedStyle(el).visibility);
    expect(visibility).toBe('hidden');
  });

  test('3.3.2 task item draggable="false"', async ({ page }) => {
    const taskDiv = page.locator('#taskList .task-item').first();
    await expect(taskDiv).toHaveAttribute('draggable', 'false');
  });
});

// ── 3.4 Mixed: edit_tasks only, no reorder_tasks ─────────────────────────────

test.describe('3.4 Mixed — edit_tasks only, no reorder_tasks', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithTask(page, ['view_tasks', 'edit_tasks']);
  });

  test('3.4.1 edit and delete buttons visible', async ({ page }) => {
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item.locator('.t-edit')).toBeVisible();
    await expect(item.locator('.t-del')).toBeVisible();
  });

  test('3.4.2 grip hidden, draggable false', async ({ page }) => {
    const grip = page.locator('#taskList [data-task-id] .grip').first();
    const visibility = await grip.evaluate(el => getComputedStyle(el).visibility);
    expect(visibility).toBe('hidden');

    const taskDiv = page.locator('#taskList .task-item').first();
    await expect(taskDiv).toHaveAttribute('draggable', 'false');
  });

  test('3.4.3 subtask add/delete controls visible', async ({ page }) => {
    // sub-add-btn is inside the subtask panel; expand it first
    const toggleBtn = page.locator('#taskList .t-sub-toggle').first();
    const isExpanded = (await toggleBtn.textContent())?.trim() === '▾';
    if (!isExpanded) await toggleBtn.click();
    await page.waitForTimeout(100);
    await expect(page.locator('#taskList .sub-add-btn')).toBeVisible();
    await expect(page.locator('#taskList .sub-del').first()).toBeVisible();
  });
});

// ── 3.5 Mixed: reorder_tasks only, no edit_tasks ─────────────────────────────

test.describe('3.5 Mixed — reorder_tasks only, no edit_tasks', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithTask(page, ['view_tasks', 'reorder_tasks']);
  });

  test('3.5.1 edit and delete buttons hidden', async ({ page }) => {
    const item = page.locator('#taskList [data-task-id]').first();
    await expect(item.locator('.t-edit')).toBeHidden();
    await expect(item.locator('.t-del')).toBeHidden();
  });

  test('3.5.2 grip visible, draggable true', async ({ page }) => {
    const grip = page.locator('#taskList [data-task-id] .grip').first();
    const visibility = await grip.evaluate(el => getComputedStyle(el).visibility);
    expect(visibility).not.toBe('hidden');

    const taskDiv = page.locator('#taskList .task-item').first();
    await expect(taskDiv).toHaveAttribute('draggable', 'true');
  });

  test('3.5.3 subtask add/delete buttons absent/hidden', async ({ page }) => {
    await expect(page.locator('#taskList .sub-add-btn')).toHaveCount(0);
    await expect(page.locator('#taskList .sub-del').first()).toBeHidden();
  });
});

// ── 3.6 Permissions update when session switches ──────────────────────────────

test.describe('3.6 Permissions update on session switch', () => {
  test('3.6.1 switch from local (full perms) to view-only cloud → controls hide', async ({ page }) => {
    await resetState(page);

    // Add a task in local session
    await page.fill('#fName', 'Local Task');
    await page.fill('#fMins', '60');
    await page.click('#btnAddFree');
    await page.waitForTimeout(200);

    // Verify controls visible in local session
    await expect(page.locator('#taskList [data-task-id] .t-edit').first()).toBeVisible();

    // Seed view-only cloud session and switch to it
    const id = await seedCloudSession(page, {
      id: SESSION_ID,
      shareCode: SHARE_CODE,
      permissions: ['view_tasks'],
      active: true,
    });

    // Copy local tasks into cloud session state so there's something to render
    await page.evaluate(
      ({ key, state }) => localStorage.setItem(key, state),
      { key: `clocktask_session_${SESSION_ID}_v1`, state: TASK_STATE }
    );

    await mockWebSocket(page, { behavior: 'connected', encryptedData: null, version: 1 });
    await page.route(`${API}/${id}/sync`, (route: Route) => route.fulfill({ status: 204 }));

    await page.reload();
    await page.waitForTimeout(400);

    await expect(page.locator('#taskList [data-task-id] .t-edit').first()).toBeHidden();
    await expect(page.locator('#taskList [data-task-id] .t-del').first()).toBeHidden();
  });

  test('3.6.2 switch from view-only cloud to local → controls reappear', async ({ page }) => {
    // Start with view-only cloud session containing a task
    await setupWithTask(page, ['view_tasks']);

    // Verify hidden
    await expect(page.locator('#taskList [data-task-id] .t-edit').first()).toBeHidden();

    // Switch to local
    await page.evaluate(() => {
      localStorage.setItem('clocktask_active_session_v1', 'local');
    });
    await page.reload();
    await page.waitForTimeout(300);

    // Local session: add a task to verify controls
    await page.fill('#fName', 'Back to Local');
    await page.fill('#fMins', '60');
    await page.click('#btnAddFree');
    await page.waitForTimeout(200);

    await expect(page.locator('#taskList [data-task-id] .t-edit').first()).toBeVisible();
  });
});
