# Issue Tracker — UX Improvements (Wave 02)

---

```yaml
status: done
```

## Issue 1 — Session modal should list existing sessions

The cloud button (top-right) opens a modal that only shows "New session" and "Join session". Users have no way to switch between or manage existing sessions from the modal — they must use the sidebar dropdown.

**Expected:** The modal home view lists all sessions (same as the sidebar dropdown), with switch/share/delete actions. New and Join move to secondary actions at the bottom.

**Approach:** Extract a shared `renderSessionList()` component from `SessionSwitcher.js` into `src/ui/components/SessionList.js`. Both the sidebar dropdown and the session modal home view use this shared renderer.

---

```yaml
status: done
```

## Issue 2 — Joined sessions show "Session XXXXXX" instead of creator's name

When a user joins a session via a share link or code, the session appears in their sidebar as `"Session abc123"` (derived from the first 6 chars of the session ID) instead of the name the original creator chose (e.g. "Work planning").

**Root cause:** The backend `SessionRecord` has no `name` field. The join response returns no name, so the client synthesises one.

**Fix:**
- Add `name` to `SessionRecord` in `backend/src/types.ts`
- Accept and store `name` in the POST `/sessions` create route
- Return `name` from the join handler in `SessionDO.ts`
- Pass `name` in the create API call from `sessions.js`
- Use returned `name` (with fallback) in `joinSession()`

---

```yaml
status: done
```

## Issue 3 — Post-creation success screen is redundant; should open ShareModal directly

After creating a cloud session, the modal shows a "success" view with the session ID and owner share code. This is redundant: the ShareModal already lists all share codes (including the owner's full-access code) and provides a better UX for creating restricted codes for collaborators.

The "save your share code — it won't be shown again" warning was also misleading: the owner code is always retrievable via the share codes list.

**Fix:** After `createCloudSession()` succeeds, close the session modal and open the ShareModal directly. Add a brief "Session created" banner at the top of the ShareModal so the context is clear. Remove the success view HTML and its JS event listeners.

**Checked for issues:**
- Owner share code is stored in `entry.shareCode` locally and returned by `listShareCodes()` — no information loss. ✅
- `setActiveSession(sessionId)` called before `openShareModal()` so the modal fetches codes for the new session. ✅
- `openShareModal()` is async; calling without await is fine — modal opens while codes load. ✅

---

```yaml
status: done
```

## Issue 4 — Session name not shown in ShareModal title

When the ShareModal is open, the title just says "Share Session" with no indication of which session is being shared. This is confusing when multiple cloud sessions exist.

**Fix:** Display the active session name in the ShareModal title or subtitle (e.g. "Share — Work planning").
