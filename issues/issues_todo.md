# Todo

---

## Debounce-window sync overwrite (data loss, medium)
**File:** `src/ui/components/SyncStatus.js` — `ws.onmessage`  
The `_inflightJSON` guard only protects against concurrent syncs while the HTTP PUT is in-flight. During the 2s debounce window before the push fires, an inbound `sync` from another client still calls `applyRemoteState`, overwrites local edits, and cancels `_pushTimer`.

**Fix:** Add one guard in the `sync` path:
```js
if (_inflightJSON !== null) return;
if (data.type === 'sync') {
  if (data.encryptedData === _lastPushedJSON) return; // echo
  if (_pushTimer !== null) return;                    // local edit pending
}
applyRemoteState(data);
```
`connected` must still apply regardless of `_pushTimer` — it is the initial state delivery on session join.

**Trade-off:** Remote changes that arrive in the 2s window are dropped on this client; the local edit then wins on the server (true LWW). Acceptable for single-owner + viewers. Medium concern only if two `edit_tasks` users edit simultaneously.

---

## `connecting` state has no CSS rule (cosmetic)
**File:** `src/styles/sync-status.css`  
`SyncStatus.js` sets `el.className = 'sync-status connecting'` but the stylesheet has no `.sync-status.connecting` rule. The spinner dot animates correctly but the container is visually identical to `idle`.

**Fix:** Add `.sync-status.connecting` rule (or alias to `.sync-status.syncing`).

---

## `forceSync()` doesn't pull from server when WS is open (low)
**File:** `src/ui/components/SyncStatus.js` — `forceSync()`  
Old behaviour: push then pull. Current: push only (reconnects WS if closed, but if WS is already open nothing is done to refresh state from server). In normal operation the WS delivers updates instantly, so this rarely matters.

**Fix:** On `forceSync()`, if WS is already open, close and reopen it so the `connected` message delivers latest server state alongside the push.

---

## `MetaRecord.lastSweep` dead code (cosmetic)
**Files:** `backend/src/types.ts`, `backend/src/lib/kv.ts`  
`lastSweep` was written by `sweep.ts` which was deleted. The field is still declared in `MetaRecord` and initialised in `getMeta` but nothing reads or writes it.

**Fix:** Remove `lastSweep` from `MetaRecord` and from the `getMeta` default.

---

## Plain-text data privacy disclosure missing (medium)
**Files:** `src/ui/modals/PrivacyModal.js` (or equivalent)  
Encryption was removed. Session state (tasks, notes, budget) is stored as plain JSON in Cloudflare Durable Objects for up to 24h. The in-app privacy modal does not disclose this.

**Fix:** Add clear disclosure: data stored unencrypted on Cloudflare infra, auto-deleted after 24h of inactivity.

---

## Run E2E suite against sync changes
Several test assertions in the suite were written before the LWW rewrite and the 2026-05-10 echo-dedup changes. Key areas to verify:  
- `sync-backoff.spec.ts` — reconnect backoff ladders  
- `sync-payload.spec.ts` — push payload shape (no `crdtUpdate`, no `clientVersion`)  
- Session switch resets `_reconnectCount` and `_sessionNotFoundToastShown`  
- `forceSync()` triggers push even when state is unchanged  
- `online` event calls `forceSync`, not `connectWS`
