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

---

## Sync correctness bug (new)

### 9. Changes on one browser do not appear on another — broken CRDT + version conflict loop

**Files:** `src/logic/sessions.js`, `src/ui/components/SyncStatus.js`, `backend/src/SessionDO.ts`  
**Severity:** High — data loss in multi-client sessions

#### Symptom
Changes made in browser A do not appear in browser B (or appear only after a reload), even when both are in the same cloud session.

#### Root causes

**9a. CRDT update is always empty — the core problem**  
`src/logic/sessions.js:163`
```js
crdtUpdate: emptyYjsState(),   // always an empty Yjs doc
```
Every push sends an empty Yjs document as `crdtUpdate`. `mergeUpdate(session.crdtState, emptyUpdate)` on the server is a no-op — the CRDT state never changes and carries zero information about actual edits. All conflict resolution falls onto the integer `version` field.

The real data lives in `encryptedData` (plain JSON — encryption was removed per issue 5), which the server stores but cannot merge semantically because the architecture was not updated to exploit the removal of encryption.

**9b. Strict version check causes a 409 conflict loop that loses data**  
`backend/src/SessionDO.ts:193`
```ts
if (body.clientVersion !== session.version) {
  return Response.json({ error: 'version_conflict', serverVersion: session.version }, { status: 409 });
}
```
When two clients are both active:
1. Both are at version N.
2. Client A pushes → server advances to N+1, broadcasts via WS.
3. Client B pushes (before the WS message lands) → 409.
4. Client B schedules a retry in 1s **without updating its local version**.
5. WS sync arrives at B → `applyRemoteState` overwrites B's local state with A's version and sets `session.version = N+1`.
6. Client B's retry fires — it now sends version N+1, but the state payload is the server's own state, not B's original changes.

**Result: Client B's edits are silently lost.**

**9c. `applyRemoteState` unconditionally overwrites unsaved local changes**  
`src/ui/components/SyncStatus.js:167–181`
```js
function applyRemoteState({ encryptedData, version }) {
  loadFromJSON(encryptedData);  // wipes local S even if _pushTimer is pending
  save();
  _lastPushedJSON = encryptedData;
  ...
}
```
If a WS `sync` broadcast arrives while client B has a pending `_pushTimer`, local edits are discarded before they can be sent.

**9d. Pusher receives its own broadcast and re-renders unnecessarily**  
`backend/src/SessionDO.ts:208`  
`broadcast()` sends to all authenticated WS clients including the one that just pushed. That client receives its own data back, calls `applyRemoteState`, and re-renders. This masks whether an update is actually from a remote client.

**9e. Server version number returned on 409 is never used**  
`src/logic/sessions.js:166–169` / `src/ui/components/SyncStatus.js:244–247`
```js
if (result.conflict) {
  schedulePush(1_000);   // serverVersion ignored — retry will 409 again
  return;
}
```
The client never fast-forwards its local version from `serverVersion`, so every retry fires with the same stale version until a WS message happens to update it out-of-band.

#### Why Yjs alone cannot fix this as currently architected

Yjs CRDT merging requires the server to inspect and merge document content. When encryption is present the server holds opaque ciphertext. Even with encryption removed (current state), the server only stores raw JSON blobs per session — it never constructs a Yjs doc from the task data, so `mergeUpdate` is merging empty shells. Meaningful content-level merge must happen on the client or the CRDT must track real task payloads.

#### Proposed fix — Option A (last-writer-wins, minimal change)

1. **Remove the strict version check** in `handleSyncPut`. The Durable Object serialises HTTP requests, so no torn writes are possible. Drop the 409 path entirely; last PUT wins.
2. **Skip the pusher's WS connection in `broadcast`**: tag each WS connection with the share code on auth and skip it in `broadcast()` to avoid self-updates.
3. **Gate `applyRemoteState` when a push is pending**: if `_pushTimer` is active, defer the remote state application until after the push resolves (either success or error).
4. Remove `crdtUpdate` and `clientVersion` from the push payload — they are unused.

#### Proposed fix — Option B (real CRDT, larger refactor)

1. Maintain a `Y.Doc` per cloud session on the client. Store task IDs, order, and timestamps (not full content) in the Yjs doc.
2. On each `save()`, compute a delta via `Y.encodeStateAsUpdate(doc, Y.encodeStateVector(lastSyncedDoc))` and send it as `crdtUpdate`.
3. Server merges the delta into `crdtState` via `Y.mergeUpdates`. On conflict the merged CRDT (not a 409) is returned.
4. Client reconciles the merged ordering metadata against its task array and re-pushes only the content diff.

Option B gives real concurrent-edit safety for task ordering/presence. Two clients editing the same task's duration/name simultaneously still falls back to last-writer-wins because content is opaque to the CRDT.

**Recommended: implement Option A now** to stop data loss; revisit Option B if multi-user collaborative editing becomes a goal.

#### Files to change (Option A)

| File | Change |
|---|---|
| `backend/src/SessionDO.ts` | Remove `clientVersion` check; skip pusher in `broadcast` |
| `src/logic/sessions.js` | Remove `crdtUpdate` and `clientVersion` from push body |
| `src/ui/components/SyncStatus.js` | Gate `applyRemoteState` when `_pushTimer` is active |
| `backend/src/lib/crdt.ts` | Can be deleted (no longer called) |
| `backend/src/routes/sessions.ts` | Remove `crdtState` from init body |

---

## Dead code

### 7. `MetaRecord.lastSweep` field unused
**Files:** `backend/src/types.ts`, `backend/src/lib/kv.ts`  
**Severity:** Cosmetic  
`lastSweep` was written and read by `sweep.ts` which was deleted. The field is still declared in `MetaRecord` and initialised in `getMeta` but nothing reads it.

**Fix:** Remove `lastSweep` from `MetaRecord` and from the `getMeta` default.
