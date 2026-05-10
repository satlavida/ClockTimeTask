# Done

---

## Session count leak on alarm expiry
**File:** `backend/src/SessionDO.ts` — `alarm()`  
The 24h expiry alarm deleted DO storage but never decremented `sessionCount` in KV. Sessions expired by inactivity leaked their slot, causing the 50-session cap to be hit with free slots available.  
**Fix:** Added `getMeta` / `putMeta` decrement inside `alarm()`. **Commit:** 660e1a6

---

## E2E sync tests rewritten for WS architecture
**Files:** `tests/e2e/sync-backoff.spec.ts`, `sync-payload.spec.ts`  
Old tests mocked a `GET /sessions/:id/sync` polling endpoint that was removed. Tests also couldn't intercept WS connections, leaving the sync badge stuck on `error`. Rewritten to use Playwright WS interception. **Commit:** faa94ad

---

## Client-side encryption removed
**File:** `src/logic/sessions.js`  
PBKDF2+AES-GCM encryption was removed when the backend migrated to Durable Objects. State is now stored as plain JSON. The `encryptedData` field name is kept for API compatibility. **Commit:** 660e1a6

---

## Cross-browser sync restored (CRDT + version conflict)
**Files:** `backend/src/SessionDO.ts`, `src/logic/sessions.js`, `src/ui/components/SyncStatus.js`  
Four root causes:  
- Every push sent an empty Yjs doc as `crdtUpdate` → merge was always a no-op  
- Strict version check (409) caused a retry loop that silently discarded the losing client's edits  
- `applyRemoteState` overwrote local state unconditionally, cancelling pending push timers  
- Pusher received its own WS broadcast and re-rendered unnecessarily  

**Fix (Option A — LWW):** Removed 409 path and CRDT entirely; DO serialises writes so last PUT wins atomically. Broadcast goes to all clients; pusher deduplicates client-side. **Commits:** 660e1a6, 88eb644

---

## Offline edit recovery — edits overwritten on reconnect
**File:** `src/ui/components/SyncStatus.js` — `online` event handler  
`connectWS()` was called on `online`, which applied old server state via `connected` message and cancelled `_pushTimer`, discarding local edits made while offline.  
**Fix:** Changed to `forceSync()` — sets `_inflightJSON` before connecting WS so the `connected` message is skipped until the push completes.

---

## `connected` / `sync` messages applied stale state during in-flight push
**File:** `src/ui/components/SyncStatus.js` — `ws.onmessage`  
`connected` had no guard against arriving while a push was in-flight. Echo dedup for `sync` used `_inflightJSON === payload` which failed once the HTTP response cleared `_inflightJSON`.  
**Fix:** Both message types skipped when `_inflightJSON !== null`. `sync` echo also caught via `encryptedData === _lastPushedJSON` for late-arriving echoes.

---

## `_reconnectCount` not reset on session switch
**File:** `src/ui/components/SyncStatus.js` — `syncConnection()`  
Reconnect failures from session A carried into session B → first WS failure on B used max 30s backoff instead of 1s.  
**Fix:** `_reconnectCount = 0` added to `syncConnection()`.

---

## `_sessionNotFoundToastShown` flag not reset on session switch
**File:** `src/ui/components/SyncStatus.js` — `syncConnection()`  
"Session no longer exists" toast was suppressed on session B if session A had already shown it.  
**Fix:** `_sessionNotFoundToastShown = false` added to `syncConnection()`.

---

## `handleDelete` missing session count decrement
**File:** `backend/src/SessionDO.ts` — `handleDelete()`  
Manual `DELETE /sessions` did not decrement `sessionCount` in KV (only the alarm handler did). After any manual delete the 50-session cap became permanently inaccurate.  
**Fix:** Added `getMeta` / `putMeta` decrement identical to `alarm()`.

---

## `handleDelete` missing alarm cancellation
**File:** `backend/src/SessionDO.ts` — `handleDelete()`  
After manual delete, the 24h alarm still fired, ran `deleteAll()` (no-op), and decremented `sessionCount` again — double-decrement.  
**Fix:** Added `await this.ctx.storage.deleteAlarm()` before `deleteAll()`.
