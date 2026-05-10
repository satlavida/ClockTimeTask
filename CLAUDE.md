# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS/HTML/CSS app with esbuild bundler. Source lives in `src/`, output in `dist/`. `index.html` at project root links `dist/main.css` + `dist/main.js`.

```bash
npm run dev    # dev server at http://localhost:3000 with watch mode
npm run build  # production build → dist/
npm run lint   # ESLint on src/
open index.html        # macOS (needs dist/ to exist — run build first)
```

## Deployment

Frontend hosted on Cloudflare Pages as the `clocktask` project. Backend hosted as a Cloudflare Worker named `clocktask-api`.

```bash
npm run deploy                  # build + deploy frontend to Cloudflare Pages
npm run backend:deploy          # deploy backend worker
```

URLs:
- Frontend production: https://clocktask.satyajeetnigade.in
- Frontend Pages: https://clocktask.pages.dev
- Backend worker: https://clocktask-api.satlavida.workers.dev

## Local development

Two terminals required — frontend and backend run independently:

```bash
# Terminal 1
npm run dev           # frontend at http://localhost:3000

# Terminal 2
npm run backend:dev   # worker at http://localhost:8787 (local KV, resets on restart)
npm run backend:dev --remote  # worker at http://localhost:8787 using real Cloudflare KV
```

The frontend auto-detects `localhost` and points to `http://localhost:8787`; in production it uses the worker URL above.

## Architecture

Modular ESM source in `src/`, bundled to `dist/main.js` + `dist/main.css` by esbuild. Static HTML structure in `index.html`.

### Module layout

```
src/
├── main.js              ← entry: imports CSS, registers SW, calls init()
├── app.js               ← init(): wires all sections, starts tick, applies permission gate
├── logic/
│   ├── constants.js     ← CX/CY, ring radii, GAP_DEG, PALETTE, KEY, SEC_KEY
│   ├── state.js         ← S object, save(), load(), loadFromJSON(), toJSON()
│   ├── sessions.js      ← session registry, crypto (PBKDF2+AES-GCM), API calls
│   ├── time.js          ← getCycleMins, minsToAngle, absToTime, getBudgetMins, getFitRange, p2, hhmm, durStr
│   ├── tasks.js         ← addFreeTask, applyBudget, delTask, clearAllTasks, setColor, reorderTask, saveTaskEdit
│   ├── clock-geometry.js← polar, svgEl, donutPath
│   ├── sections.js      ← toggleSection, initSections (collapsible sidebar sections)
│   └── sound.js         ← playChime (Web Audio)
├── styles/
│   ├── main.css         ← @import chain for all partials
│   └── *.css            ← one file per component/section
└── ui/
    ├── components/
    │   ├── TaskItem.js        ← createTaskItem(task, permissions, callbacks) → DOM element; hides edit/delete/reorder when session lacks edit_tasks/reorder_tasks
    │   ├── SessionList.js     ← shared session-row renderer used by SessionSwitcher and SessionModal
    │   ├── SessionSwitcher.js ← sidebar chip: list sessions, switch, share, remove
    │   └── SyncStatus.js      ← WebSocket client: real-time sync, reconnect backoff, status badge (syncing/synced/offline/error)
    ├── sections/
    │   ├── ModePanel.js, StartTimePanel.js, FreeAddPanel.js
    │   ├── BudgetPanel.js, TaskList.js, StatsFooter.js
    ├── modals/
    │   ├── SettingsModal.js, TaskEditModal.js
    │   ├── SessionModal.js    ← create (import or fresh) and join flows
    │   └── ShareModal.js      ← list/create/revoke share codes with permission presets
    ├── clock/
    │   ├── ClockSVG.js  ← buildFace, redraw, tickHands, arc drag resize
    │   └── Popover.js   ← arc hover tooltip
    └── NowBoard.js      ← live task board, countdown, chime boundary detection
```

### Key patterns

- `app.js` defines a single `refresh()` closure that chains `renderList → redraw → updateStats → updateBoard → applyPermissions`; every section callback calls it
- `applyPermissions()` reads `getActivePermissions()` and hides any element with a `data-perm` attribute whose value is not in the active session's permission list
- Each `src/ui/sections/*.js` exports an `init*()` function (wires DOM events) and optionally a `sync*()` function (hydrates DOM from state)
- `S` is a shared mutable object; mutators in `logic/tasks.js` call `save()` then return; callers chain `refresh()`
- `taskTimings[]` is module-level in `ClockSVG.js`, rebuilt on every `redraw()`, exported for `Popover.js`

## Key data relationships

- `S.startTime` (Date) + `S.tasks[i].duration` (minutes) define the entire timeline — everything else is derived
- `taskTimings[]` is a parallel array rebuilt on every `redraw()` containing `{startAbs, endAbs}` in absolute day-minutes; used by the hover popover and `getCurrentTask()`
- Budget limit flows through `getBudgetMins()` — both duration mode (`hours*60+mins`) and end-time mode (`endTimeStr − startTime`) resolve to a single minute count before being used anywhere
- Arc positions: `getCycleMins()` returns 720 (12h) or 1440 (24h); `minsToAngle(lapPos)` converts 0–cycle minutes → 0–360° without modulo (avoids a 0° collapse at lap boundaries); `lapN = floor(absMin/cycle)` selects outer ring (`lapN=0`) vs inner overflow ring (`lapN=1`)
- `S.settings.clock24h` (bool) switches the entire clock — face numerals, hand speed, and arc cycle — between 12h and 24h mode

## Session sync (SPEC_0A)

### Session model

```
localStorage keys:
  clocktask_sessions_v1        → SessionEntry[] (registry of all sessions)
  clocktask_active_session_v1  → string (active session ID, default 'local')
  clocktask_v4                 → state for the local session (unchanged)
  clocktask_session_{id}_v1    → state for each cloud session
```

Each session has a `type: 'local' | 'cloud'`. The local session is always present, always writable, and never syncs. Cloud sessions require a session ID and share code to join.

### Encryption

Client-side encryption was removed when the backend migrated to Durable Objects. Session data is stored as **plaintext JSON** in the DO. The API field is still named `encryptedData` for historical reasons but contains raw state JSON. The share code is used only for authentication (bearer token), not for key derivation.

### Conflict resolution

Last-writer-wins. The DO serialises all writes so there are no torn updates. There is no version-conflict (409) path. CRDT (`crdt.ts`, Yjs) was removed — it was never functional: every push sent an empty state vector, making `mergeUpdate` a no-op.

### Sync behaviour

- **Push**: debounced 2s after every `save()`. Skips entirely if the current state JSON matches `_lastPushedJSON` (no-op calls produce zero API hits). `_pushTimer` is cleared to `null` at the start of `doPush()` so a stale handle can't permanently block future syncs.
- **Real-time receive**: `SyncStatus.js` opens a WebSocket to the Durable Object on session join. The DO broadcasts every `PUT /sync` to **all** connected clients (including the pusher's own connections). The client skips any WS message (`connected` or `sync`) while a push is in-flight (`_inflightJSON !== null`) — the push's own broadcast will arrive next with the authoritative state. `sync` echoes of `_lastPushedJSON` are also discarded. `applyRemoteState()` clears `_pushTimer` after applying state so the 2-second debounce window doesn't block incoming broadcasts.
- **Tab focus recovery**: `visibilitychange` reconnects the WS if it closed while the tab was hidden. On `online` event, `forceSync()` is called (not just `connectWS()`) so unsent local changes are pushed before server state is applied.
- **Error backoff**: consecutive push failures grow the retry delay: `2s → 4s → 8s → 16s → 30s`. Resets on any successful sync or when the browser comes back online.
- **Settings** (`clock24h`, `fitClock`, `soundAlerts`, `showTimeRemaining`) are **never synced** — they remain device-local for all participants including the owner.

### Permissions

Share codes carry explicit permission lists. HTML elements that require a permission carry `data-perm="<permission>"` and are hidden via `applyPermissions()` in `refresh()` when the active session lacks that permission.

| Permission | Gates |
|---|---|
| `view_tasks` | task list, clock arcs |
| `edit_tasks` | add / edit / delete tasks |
| `reorder_tasks` | drag reorder |
| `view_notes` | notes section |
| `edit_notes` | editing notes |
| `edit_budget` | budget, start time, mode sections |
| `manage_share` | share modal, share buttons |

## Backend (Cloudflare Worker)

Source in `backend/src/`, config at `backend/wrangler.toml`. Runtime: Cloudflare Workers. Framework: Hono. KV namespace `SESSIONS` (id: `c2fdc9c938024e23ad98e3b339e28854`).

```bash
npm run backend:dev     # local worker at http://localhost:8787
npm run backend:deploy  # deploy to Cloudflare Workers
cd backend && npm test  # run vitest API tests (in-memory KV mock)
```

Install backend deps separately: `npm install --prefix backend`

### Backend layout

```
backend/src/
├── index.ts          ← Hono app, mounts /api/sessions route + forwards DO routes
├── types.ts          ← SessionRecord, MetaRecord, Permission, Env
├── SessionDO.ts      ← Durable Object: session state, WebSocket hub, all per-session routes
│                       (init, join, sync PUT, share-codes CRUD, delete, WebSocket upgrade)
├── lib/
│   ├── kv.ts         ← typed KV helpers (getMeta, putMeta — session count tracking)
│   └── auth.ts       ← validateShareCode, getPermissions, extractShareCode, randomAlphanumeric
└── routes/
    └── sessions.ts   ← POST /sessions only (creates DO, increments KV meta counter)
```

### API summary

All routes under `/api/sessions`. Auth via `Authorization: Bearer <shareCode>` (omitted only for `POST /sessions`). Session cap: 50. Sessions expire after 24h via a Durable Object alarm set at init — no polling sweep.

## Testing

Playwright E2E tests in `tests/e2e/`. Config at `tests/playwright.config.ts`. Screenshots saved to `tests/screenshots/` (gitignored — generated output).

```bash
npm test              # run all E2E tests headlessly (auto-starts dev server)
npm run test:ui       # open Playwright UI for interactive debugging
npm run screenshots   # screenshot sweep only → tests/screenshots/*.png
```

Screenshots are named `NN-description.png`. Run `npm run screenshots` after any visual change to regenerate for AI review.

E2E spec files in `tests/e2e/`: `tasks.spec.ts`, `session.spec.ts`, `permissions.spec.ts`, `sync-backoff.spec.ts`, `sync-payload.spec.ts`, `taskitem-permissions.spec.ts`, `session-list.spec.ts`, `session-modal-ux.spec.ts`, `session-ux-02.spec.ts`, `join-flow.spec.ts`, `link-join.spec.ts`, `screenshots.spec.ts`.

## Design language

Braun clock aesthetic: dark surfaces (`#0f0f0f` bg, `#181818` surface), white/grey clock elements, amber accent `#F5B731` for second hand, live dot, and countdown. Typography is Helvetica Neue weight-200 for large display text, weight-300 for numbers. No external fonts or icon libraries.
