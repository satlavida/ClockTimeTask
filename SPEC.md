# SPEC_0A — Session Sync & Collaboration

**Status:** Draft  
**Scope:** Backend (Cloudflare Workers) + Frontend (vanilla JS)  
**Applies to:** `clocktask` — clock-based task planner

---

## 1. Overview

### Problem
ClockTimeTask currently runs entirely in `localStorage`. Users cannot access their plan on a second device (phone) or share it with family/friends for viewing or collaborative editing.

### Goal
Introduce opt-in **cloud sessions**: a session can be created, synced across devices, and shared via short codes with fine-grained permissions. The app remains fully usable offline with no account or login required.

### Non-goals (0A)
- Real-time presence / live cursors
- Conflict UI (visual diff of conflicting edits)
- Passphrase recovery or reset
- Session transfer (changing owner)
- WebSocket / push-based sync (polling only in 0A)

---

## 2. Storage: KV vs D1

| | Cloudflare KV (free tier) | Cloudflare D1 (free tier) |
|---|---|---|
| Reads | 100k/day | 5M/day |
| Writes | 1k/day | 100k/day |
| Storage | 1 GB | 5 GB |
| Query model | Key-value | SQL |

**Decision: KV.**  
With a hard cap of 50 sessions, KV's free tier is more than sufficient and avoids SQL complexity. Each session write costs 1–2 KV write operations. The 1k/day write limit supports ~20 active syncing users comfortably.

**D1 migration path:** If the session cap is raised significantly (>500) or per-session audit logs are needed, migrate the sessions map to D1 while keeping the meta key in KV.

---

## 3. KV Data Model

### Namespace: `SESSIONS`

```
meta                 →  MetaRecord
session:{id}         →  SessionRecord
```

### MetaRecord

```typescript
type MetaRecord = {
  sessionCount: number;   // currently active (not expired) sessions
  lastSweep: string;      // ISO-8601 timestamp of last expiry sweep
};
```

### SessionRecord

```typescript
type Permission =
  | 'view_tasks'
  | 'edit_tasks'
  | 'reorder_tasks'
  | 'view_notes'
  | 'edit_notes'
  | 'edit_budget'
  | 'manage_share';

type ShareCodeEntry = {
  permissions: Permission[];
  createdAt: string;      // ISO-8601
};

type SessionRecord = {
  id: string;             // 12-char alphanumeric (random)
  version: number;        // incremented on every write
  createdAt: string;      // ISO-8601
  lastAccess: string;     // ISO-8601; updated on every read or write
  encryptedData: string;  // AES-GCM ciphertext, base64 (IV prepended)
  crdtState: string;      // yjs Y.Doc encoded state vector, base64 (NOT encrypted)
  shareCodes: Record<string, ShareCodeEntry>;
};
```

**Notes:**
- `encryptedData` contains the full state snapshot: `tasks`, `notes`, `startTime`, `mode`, `budget`
- `crdtState` carries no user-readable content — only yjs structural merge metadata — so it is stored unencrypted to allow the worker to perform CRDT merges without the passphrase
- `id` is 12 random alphanumeric characters; `shareCodes` keys are 16 random alphanumeric characters

---

## 4. Permissions Model

Each share code carries an explicit list of permissions. The **owner's share code** always carries all 7 permissions and is generated at session creation.

| Permission | What it gates |
|---|---|
| `view_tasks` | See task list and clock arcs |
| `edit_tasks` | Add / edit / delete tasks and subtasks |
| `reorder_tasks` | Drag-reorder tasks |
| `view_notes` | See notes section |
| `edit_notes` | Edit notes |
| `edit_budget` | Change budget hours, start time, mode |
| `manage_share` | Create / revoke share codes (owner only) |

**Browser settings** (sound alerts, 24h clock, fit clock) are **never synced** — they remain device-local for every participant including the owner.

### Permission presets (UI convenience)

| Preset | Permissions |
|---|---|
| View only | `view_tasks`, `view_notes` |
| Collaborator | `view_tasks`, `edit_tasks`, `reorder_tasks`, `view_notes`, `edit_notes` |
| Full (except manage) | all except `manage_share` |
| Owner | all |

---

## 5. Session Lifecycle

1. **Creation**: Owner calls `POST /api/sessions`. Server checks `sessionCount < 50`; if full, returns `429` with message. On success, owner receives `{ sessionId, ownerShareCode }`.
2. **Access**: Any read or write call updates `lastAccess` on the session record.
3. **Expiry**: Sessions inactive for **>24 hours** (i.e. `now - lastAccess > 86400s`) are considered expired.
4. **Sweep**: Lazy — runs on every write request if `now - meta.lastSweep > 3600s`. Sweep lists all `session:*` keys, deletes expired ones, decrements `sessionCount`, updates `lastSweep`.
5. **Deletion**: Owner can delete a session explicitly via `DELETE /api/sessions/:id`.
6. **Session cap full**: New session requests receive `429 Too Many Requests` with body `{ error: "session_limit_reached", limit: 50 }`. The client shows a warning and does not block local usage.

---

## 6. Encryption Design

### Key derivation

```
key = PBKDF2(
  password: passphrase (UTF-8),
  salt:     sessionId (UTF-8),
  iterations: 100_000,
  hash:     SHA-256,
  keylen:   256 bits
)
```

Uses the Web Crypto API (`SubtleCrypto`) — available in both browsers and Cloudflare Workers (though the worker never derives keys; it only stores blobs).

### Encryption

```
ciphertext = AES-GCM-256(key, plaintext)
stored     = base64( iv[12 bytes] || ciphertext )
```

- IV is 12 random bytes, prepended to ciphertext, base64-encoded together
- `encryptedData` value in KV = the above base64 string

### Passphrase handling

- Passphrase is **never transmitted** to the server
- Passphrase is **never persisted** — derived key lives only in memory (`CryptoKey` object) for the session of the tab
- On tab close / reload: user must re-enter passphrase to reconnect to a cloud session
- Option: store derived key in `sessionStorage` (clears on tab close) as a UX shortcut — noted for implementation decision

### Join flow

1. User enters session ID + share code + passphrase
2. Client calls `POST /api/sessions/:id/join` with share code → receives `encryptedData`, permissions
3. Client derives key from passphrase + sessionId
4. Client decrypts `encryptedData` → loads state

---

## 7. CRDT Strategy

### Library: yjs

**`yjs`** (~70 KB gzip) is the recommended library.

- Battle-tested in production (Notion, Linear, etc.)
- Works in browsers and Cloudflare Workers
- Y.Array supports insert/delete at arbitrary positions with automatic merge
- Update vectors allow delta sync (send only what changed since last sync)

### Document structure

```
Y.Doc
├── tasks   → Y.Array<Y.Map>   (each map: { id, name, duration, color, subtasks })
├── notes   → Y.Array<string>
└── meta    → Y.Map            (mode, startTime, budget fields)
```

### Sync protocol (polling)

1. **Pull on focus**: when tab becomes visible, client calls `GET /api/sessions/:id/sync?sinceVersion=N`
2. **Push on mutation**: after every `save()`, debounce 2 s, then `PUT /api/sessions/:id/sync` with a yjs update blob + encrypted snapshot
3. **Server merge**: worker applies the incoming yjs update to the stored `crdtState` using `Y.applyUpdate()`, increments version, stores new `encryptedData` (the client-computed encrypted snapshot) and new `crdtState`
4. **Client apply**: response contains server's `encryptedData` + `crdtState`; client decrypts and applies if server `version > local version`

### CRDT and encrypted snapshot relationship

The `crdtState` is used for merge bookkeeping only. The `encryptedData` is the authoritative human-readable snapshot — the last writer's encrypted payload, post-merge. This avoids the complexity of encrypting CRDT internals while still supporting merge.

### Conflict example

- Laptop adds task A, phone adds task B simultaneously
- Both push updates; server applies both Y.Array inserts → both tasks appear in merged state
- Both devices receive the merged `encryptedData` on next pull → consistent state

---

## 8. API Endpoints

Base path: `/api`  
Auth: `Authorization: Bearer <shareCode>` header (omitted only for `POST /sessions`)

| Method | Path | Required Permission | Description |
|---|---|---|---|
| `POST` | `/sessions` | — | Create session → `§5` |
| `POST` | `/sessions/:id/join` | any valid share code | Join; returns encrypted data + permissions |
| `GET` | `/sessions/:id/sync` | `view_tasks` | Pull state delta since `sinceVersion` |
| `PUT` | `/sessions/:id/sync` | `edit_tasks` or `edit_notes` or `edit_budget` | Push update + encrypted snapshot |
| `POST` | `/sessions/:id/share-codes` | `manage_share` | Create share code with permissions |
| `GET` | `/sessions/:id/share-codes` | `manage_share` | List all share codes + permissions |
| `DELETE` | `/sessions/:id/share-codes/:code` | `manage_share` | Revoke share code |
| `DELETE` | `/sessions/:id` | `manage_share` | Delete entire session |

### Request / Response shapes

**`POST /sessions`**
```typescript
// Request
{ encryptedData: string; crdtState: string; }
// Response 201
{ sessionId: string; ownerShareCode: string; }
// Response 429
{ error: "session_limit_reached"; limit: 50; }
```

**`POST /sessions/:id/join`**
```typescript
// Request (body)
{ /* no body needed — share code in Authorization header */ }
// Response 200
{ encryptedData: string; crdtState: string; permissions: Permission[]; version: number; }
// Response 403
{ error: "invalid_share_code" }
// Response 404
{ error: "session_not_found" }
```

**`GET /sessions/:id/sync`**
```typescript
// Query: ?sinceVersion=N
// Response 200
{ encryptedData: string; crdtState: string; version: number; }
// Response 204  (no changes since sinceVersion)
```

**`PUT /sessions/:id/sync`**
```typescript
// Request
{ encryptedData: string; crdtUpdate: string; clientVersion: number; }
// Response 200
{ encryptedData: string; crdtState: string; version: number; }
// Response 409  (clientVersion outdated by more than 1 — pull first)
{ error: "version_conflict"; serverVersion: number; }
```

**`POST /sessions/:id/share-codes`**
```typescript
// Request
{ permissions: Permission[]; }
// Response 201
{ shareCode: string; permissions: Permission[]; createdAt: string; }
```

---

## 9. Backend Changes

### Files to add / modify

```
backend/
├── wrangler.toml              ← add KV namespace binding SESSIONS
└── src/
    ├── index.ts               ← mount new route modules
    ├── lib/
    │   ├── kv.ts              ← typed KV helpers (getSession, putSession, getMeta, putMeta)
    │   ├── sweep.ts           ← lazily expire sessions older than 24h
    │   ├── crdt.ts            ← yjs helpers: mergeUpdate(), encodeState(), decodeState()
    │   └── auth.ts            ← validateShareCode(session, shareCode, requiredPermission)
    └── routes/
        ├── sessions.ts        ← POST /sessions, POST /sessions/:id/join, DELETE /sessions/:id
        └── shareCodes.ts      ← GET/POST/DELETE /sessions/:id/share-codes
        └── sync.ts            ← GET/PUT /sessions/:id/sync
```

### wrangler.toml addition

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "<to be created via wrangler kv:namespace create SESSIONS>"
```

### Worker environment type

```typescript
type Env = {
  SESSIONS: KVNamespace;
  ENVIRONMENT: string;
};
```

---

## 10. UI Changes

### New files

```
src/
├── logic/
│   └── sessions.js            ← session registry, active session, derived-key cache
└── ui/
    ├── components/
    │   ├── SessionSwitcher.js ← header widget: local + cloud session list, switch button
    │   └── SyncStatus.js      ← synced timestamp, spinner, offline badge, error
    └── modals/
        ├── SessionModal.js    ← create (with import-vs-fresh choice) and join flows
        └── ShareModal.js      ← list share codes, create with permission checkboxes, revoke
```

### Modified files

```
src/
├── app.js                     ← add permission gate to refresh(), init session switcher + sync
├── logic/state.js             ← add per-session localStorage key resolution
└── styles/
    ├── session-switcher.css
    └── sync-status.css
```

### Session state model (`src/logic/sessions.js`)

```javascript
// Stored in localStorage key: clocktask_sessions_v1
// Active session ID in: clocktask_active_session_v1

SessionEntry = {
  id: string,           // 'local' for the default local session
  name: string,
  type: 'local' | 'cloud',
  shareCode: string | null,     // null for local
  lastSynced: string | null,    // ISO-8601
  version: number,
}
```

The derived `CryptoKey` lives only in a module-level `Map` keyed by session ID — never in localStorage.

### Multi-session localStorage

Each session gets its own state key:
- Local session: `clocktask_v4` (existing key, unchanged)
- Cloud sessions: `clocktask_session_{id}_v1`

Active session ID determines which key `load()` and `save()` in `state.js` read/write.

### Permission gate

In `app.js`'s `refresh()`, after rendering:

```javascript
const perms = getActivePermissions(); // from sessions.js
document.querySelectorAll('[data-perm]').forEach(el => {
  const required = el.dataset.perm;
  el.hidden = !perms.includes(required);
});
```

HTML elements that require a permission carry `data-perm="edit_tasks"` etc.

---

## 11. Multi-session Model

- **Local session** (`id: 'local'`): always present, always writable, never touches the network; this is the current app behavior
- **Cloud sessions**: created on demand; require network for sync; can be shared
- **Switching sessions**: `save()` to current session's store → load target session's store → `refresh()`
- **Offline**: if network unavailable, cloud session operates on local cache; sync resumes on reconnect

---

## 12. Sync Flow Detail

```
[mutation] → save() → debounce 2s
                           ↓
                    PUT /sessions/:id/sync
                    { encryptedData, crdtUpdate, clientVersion }
                           ↓
                    server: applyUpdate → new crdtState
                            bump version
                            store new encryptedData
                           ↓
                    response: { encryptedData, crdtState, version }
                           ↓
                    client: decrypt → apply if server version > local

[tab focus] → GET /sessions/:id/sync?sinceVersion=N
            → if 200: decrypt + apply
            → if 204: no-op
```

---

## 13. Out of Scope (0A)

These are explicitly deferred to future specs:

- **Real-time presence**: WebSocket or Durable Objects for live cursor/edit indicators
- **Conflict UI**: visual diff when concurrent edits produce a structural merge
- **Passphrase in URL fragment**: embedding passphrase in a deep link for frictionless join (security trade-off to evaluate separately)
- **Passphrase recovery**: no server-side key escrow; lost passphrase = lost cloud data
- **Session transfer**: reassigning owner share code to another participant
- **Per-task sharing**: sharing a subset of tasks rather than the whole session
- **Audit log**: history of who changed what
- **Push notifications**: notify phone when laptop makes a change
