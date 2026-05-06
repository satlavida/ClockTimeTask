# Issues — DO + WebSocket Migration (issues_01)

## Hard bugs

### 1. ~~Session count leaks on DO alarm expiry~~ [DONE]
**File:** `backend/src/SessionDO.ts` — `alarm()`  
**Severity:** High  
The alarm handler deletes DO storage but never updates the KV meta `sessionCount`. Sessions that expire via inactivity (24h) don't decrement the counter. Eventually the counter reaches 50 and blocks all new session creation even though slots are free.

**Fix:** Call `getMeta` / `putMeta` inside `alarm()` — `this.env.SESSIONS` is available.
```typescript
async alarm(): Promise<void> {
  // notify WS clients, delete storage …
  const meta = await getMeta(this.env.SESSIONS);
  await putMeta(this.env.SESSIONS, { ...meta, sessionCount: Math.max(0, meta.sessionCount - 1) });
}
```

---

### 2. ~~E2E sync tests broken~~ [DONE]
**Files:** `tests/e2e/sync-backoff.spec.ts`, possibly `tests/e2e/session.spec.ts`  
**Severity:** High  
Tests mock `GET /sessions/:id/sync` via `page.route()` — that endpoint was removed (WS replaces polling). Additionally, `page.route()` does not intercept WebSocket connections; on every test page load with a cloud session the client tries to open a WS to `ws://localhost:8787`, fails, and enters a reconnect loop. The sync badge shows `error` instead of the states the tests assert against.

**Fix:** Rewrite sync E2E tests to either mock the WS upgrade endpoint or use Playwright's WebSocket interception API.

---

## UI gap

### 3. `connecting` CSS state unstyled
**File:** `src/styles/sync-status.css`  
**Severity:** Low  
`SyncStatus.js` sets `el.className = 'sync-status connecting'` but the stylesheet has no `.sync-status.connecting` rule. The spinner dot animates correctly (`sync-dot.spinning`) but the container inherits no colour/opacity treatment, leaving it visually identical to `idle`.

**Fix:** Add a `.sync-status.connecting` rule (or alias it to `.sync-status.syncing`).

---

## Behaviour change

### 4. Force-sync button no longer pulls from server
**File:** `src/ui/components/SyncStatus.js` — `forceSync()`  
**Severity:** Low  
Old behaviour: push then pull. New behaviour: push only (or reconnect WS if disconnected). If the WS is already open, clicking the button cannot manually refresh state from the server. In normal operation the WS delivers updates instantly, so this rarely matters, but it is a subtle regression.

**Fix:** On `forceSync()`, if WS is open, close and reopen it so the `connected` message delivers the latest server state alongside the push.

---

## Pre-existing issues (carried over, not introduced)

### 5. ~~Unencrypted placeholder in `createCloudSession`~~ [DONE — encryption removed]
**File:** `src/logic/sessions.js`  
Encryption has been removed entirely. State is now stored and transmitted as plain JSON. The two-step create flow has been collapsed to a single POST. Issue is no longer applicable.

### 6. Last-writer-wins for concurrent edits
**Files:** `backend/src/SessionDO.ts` — `handleSyncPut()`, `src/logic/sessions.js`  
**Severity:** Low (personal-use app)  
`encryptedData` is opaque to the server. The CRDT binary merges correctly, but the decryptable application state is always the last client to push. Concurrent edits by two clients will lose one client's changes. Was present before migration; DO serialisation reduces the race window but does not eliminate the semantic conflict.

---

### 8. Plain-text state stored on server — privacy policy update needed
**Files:** `src/logic/sessions.js`, `src/ui/modals/PrivacyModal.js` (or wherever privacy text lives)  
**Severity:** Medium  
Encryption was removed. Session state (tasks, notes, budget) is now stored in plain text in the Cloudflare Durable Object and KV. The privacy policy must be updated to disclose: (a) data is stored unencrypted on the server, and (b) data is retained for up to 24 hours of inactivity before automatic deletion.

**Fix:** Add a clear disclosure in the privacy/about modal and any onboarding copy that creates a cloud session.

---

## Dead code

### 7. `MetaRecord.lastSweep` field unused
**Files:** `backend/src/types.ts`, `backend/src/lib/kv.ts`  
**Severity:** Cosmetic  
`lastSweep` was written and read by `sweep.ts` which was deleted. The field is still declared in `MetaRecord` and initialised in `getMeta` but nothing reads it.

**Fix:** Remove `lastSweep` from `MetaRecord` and from the `getMeta` default.
