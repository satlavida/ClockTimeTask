# SPEC_MobileFrontEnd — Mobile UI Overhaul

## Context

ClockTask is used in two modes: **desktop = planning** (add tasks, write notes, configure budget), **phone = follow-through** (see what's happening NOW, what's NEXT, glance at the clock). The current mobile experience is essentially a shrunk desktop — the sidebar is awkward, floating sticky notes are unusable via touch, and arc hovers don't fire on mobile. This overhaul makes the phone a first-class "execute your plan" experience without touching desktop behaviour.

The spec file will be saved to `SPEC_MobileFrontEnd.md` at project root upon implementation.

---

## Scope

Visual changes only. No data model, no sync, no permissions logic changes.

---

## 1. Breakpoint Strategy

Keep the existing `768px` block (tablet, mostly fine). Add a new **`480px` phone block** below it in `src/styles/responsive.css`. Phone rules cascade on top of tablet rules.

---

## 2. Phone Layout (≤ 480px)

Vertical stack, top-to-bottom:

```
#nowBoard        ← hero: big task name, big countdown, next task
#mobileNotesList ← simple scrollable notes list (replaces floating notes)
.clock-wrap      ← constrained height (max 65vw), still interactive
.sidebar         ← collapsed by default; "☰ Plan" toggle reveals task list + stats
```

---

## 3. NowBoard as Hero

`src/styles/responsive.css` — inside `@media (max-width: 480px)`:

```css
.now-board {
  padding: 20px 18px 14px;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.nb-left { width: 100%; }

.nb-task-name {
  font-size: 32px;
  white-space: normal;
  line-height: 1.1;
}

.nb-task-name.empty { font-size: 22px; }

.nb-remaining { font-size: 52px; }
.nb-rem-lbl   { font-size: 10px; }

.nb-right {
  width: 100%;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}

.nb-actions {
  width: 100%;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

/* 44px touch targets for all action buttons */
.nb-note-btn,
.nb-settings-btn {
  height: 44px;
  padding: 0 12px;
  font-size: 13px;
  width: auto;
}
```

---

## 4. Clock

```css
/* inside @media (max-width: 480px) */
.clock-wrap {
  flex: none;
  width: 100%;
  max-height: 65vw;
  aspect-ratio: 1;
  padding: 8px 12px 12px;
}
```

The clock stays interactive — touch popover is added in step 6.

---

## 5. Sidebar Collapse — "☰ Plan" Toggle

### 5a. HTML change (`index.html`)

Add toggle button inside `.s-head`, after the `#sessionSwitcher` div:

```html
<button class="sidebar-toggle-btn" id="btnSidebarToggle" aria-label="Planning controls" aria-expanded="false">☰ Plan</button>
```

### 5b. CSS (`src/styles/sidebar.css`)

In base styles (no media query), hide the button on desktop:

```css
.sidebar-toggle-btn { display: none; }
```

### 5c. CSS (`src/styles/responsive.css` — phone block)

```css
/* Collapse sidebar by default on phone */
.sidebar-scroll,
.sidebar .stats {
  display: none;
}

/* Reveal on toggle */
.sidebar.sidebar--open .sidebar-scroll,
.sidebar.sidebar--open .stats {
  display: flex; /* .stats uses flex; .sidebar-scroll uses block */
}

.sidebar.sidebar--open .sidebar-scroll {
  display: block;
}

/* Show the toggle button on phone */
.sidebar-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  margin-top: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--dim);
  font-size: 12px;
  cursor: pointer;
  letter-spacing: .05em;
}

/* Hide planning-only sections even when sidebar is open on phone */
.s-sec[data-sec="mode"],
.s-sec[data-sec="start"],
#freePanel,
#budgetPanel {
  display: none;
}

/* Task items: bigger touch targets */
.task-item {
  min-height: 48px;
}

.grip { display: none; }

.t-del, .t-edit, .t-sub-toggle {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Stats: compact */
.stats { padding: 8px 14px; flex-wrap: wrap; }
.stat-v { font-size: 13px; }
```

### 5d. JS (`src/app.js`)

Wire the toggle in `init()`:

```js
document.getElementById('btnSidebarToggle')?.addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  const isOpen  = sidebar.classList.toggle('sidebar--open');
  document.getElementById('btnSidebarToggle').setAttribute('aria-expanded', String(isOpen));
});
```

---

## 6. Touch Popover (`src/ui/clock/Popover.js`)

Full refactor — keep the file's exact exports, just expand internals.

### Key changes:

1. **`isTouchDevice()`** — `window.matchMedia('(pointer: coarse)').matches`
2. **Extract `showPopForTask(ti)`** — shared fill logic for both mouse and touch paths
3. **`onArcTouch(e)`** — reads `e.touches[0]`, uses `document.elementFromPoint` to find tapped arc path
4. **`#popoverBackdrop`** — created by JS, appended to `body`, tap dismisses popover
5. **`hidePop()`** — also removes `.touch-mode` class and hides backdrop

### Touch popover positioning:

On touch (`isTouchDevice()`), add `.touch-mode` class to `#popover` and activate `#popoverBackdrop`. The CSS centers it:

```css
/* src/styles/popover.css */
#popoverBackdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
  display: none;
}

#popoverBackdrop.visible { display: block; }

#popover.touch-mode {
  position: fixed;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%);
  min-width: 200px;
  padding: 16px 18px;
  z-index: 300;
}
```

On mouse, `onArcHover` continues to position at cursor as before.

---

## 7. Mobile Notes List (`src/ui/StickyNotes.js`)

**Strategy**: keep all existing floating-note logic unchanged. Branch on screen width: if phone, render to a new `#mobileNotesList` container instead of `#notesLayer`.

### 7a. HTML change (`index.html`)

Add immediately after `#notesLayer`, inside `.main`:

```html
<div id="mobileNotesList" class="mobile-notes-list" hidden></div>
```

### 7b. CSS (`src/styles/notes.css`)

```css
/* Mobile notes list — hidden on desktop, shown on phone by JS */
.mobile-notes-list { display: none; width: 100%; padding: 0 14px 16px; }

.mobile-notes-heading {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .15em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 12px 2px 8px;
}

.mobile-note-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface2);
  border-radius: var(--r);
  margin-bottom: 8px;
  border-left: 3px solid var(--note-item-accent, var(--border));
}

.mobile-note-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--note-item-accent, var(--muted));
  flex-shrink: 0;
  margin-top: 3px;
}

.mobile-note-body { flex: 1; min-width: 0; }

.mobile-note-text {
  font-size: 13px;
  color: var(--text);
  font-weight: 300;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.mobile-note-text.empty { color: var(--dim); font-style: italic; }

.mobile-note-task {
  font-size: 10px;
  color: var(--muted);
  margin-top: 4px;
}
```

Also in `responsive.css` (phone block):

```css
#notesLayer { display: none; }
.mobile-notes-list { display: block; }
```

### 7c. JS (`src/ui/StickyNotes.js`)

Add at top:

```js
function isPhone() {
  return window.matchMedia('(max-width: 480px)').matches;
}
```

Update `renderNotes()`:

```js
export function renderNotes() {
  if (!layer) return;
  if (isPhone()) { renderMobileNotesList(); return; }
  // ... existing desktop path unchanged
}
```

Add new function:

```js
function renderMobileNotesList() {
  const listEl = document.getElementById('mobileNotesList');
  if (!listEl) return;
  listEl.removeAttribute('hidden');
  listEl.innerHTML = '';

  const tasks = getTaskList();
  const visible = filterTaskId ? S.notes.filter(n => n.taskId === filterTaskId) : S.notes;
  if (!visible.length) return;

  const heading = document.createElement('div');
  heading.className = 'mobile-notes-heading';
  heading.textContent = 'Notes';
  listEl.appendChild(heading);

  visible.forEach(note => {
    const task = tasks.find(t => t.id === note.taskId);
    const item = document.createElement('div');
    item.className = 'mobile-note-item';
    if (task?.color) item.style.setProperty('--note-item-accent', task.color);

    const dot = document.createElement('div');
    dot.className = 'mobile-note-dot';

    const body = document.createElement('div');
    body.className = 'mobile-note-body';

    const textEl = document.createElement('div');
    textEl.className = 'mobile-note-text' + (note.text ? '' : ' empty');
    textEl.textContent = note.text || 'Empty note';
    body.appendChild(textEl);

    if (task) {
      const lbl = document.createElement('div');
      lbl.className = 'mobile-note-task';
      lbl.textContent = task.name;
      body.appendChild(lbl);
    }

    item.appendChild(dot);
    item.appendChild(body);
    listEl.appendChild(item);
  });

  layer.innerHTML = ''; // clear floating layer
}
```

Notes are read-only on phone — consistent with follow-through philosophy. Adding notes still works via the `📝 Note` button in NowBoard actions (the `addNote()` call still fires; the note just renders in the list, not as a draggable card).

---

## 8. Files to Modify

| File | Change |
|---|---|
| `index.html` | Add `#btnSidebarToggle` in `.s-head`; add `#mobileNotesList` in `.main` |
| `src/styles/responsive.css` | Add full `@media (max-width: 480px)` block |
| `src/styles/sidebar.css` | Add `.sidebar-toggle-btn { display: none }` base rule |
| `src/styles/notes.css` | Add mobile note list styles |
| `src/styles/popover.css` | Add `#popover.touch-mode` and `#popoverBackdrop` rules |
| `src/ui/clock/Popover.js` | Add touch events, refactor into `showPopForTask()`, add backdrop |
| `src/ui/StickyNotes.js` | Add `isPhone()`, `renderMobileNotesList()`, branch in `renderNotes()` |
| `src/app.js` | Wire `#btnSidebarToggle` click handler (3 lines) |

---

## 9. Verification

```bash
npm run dev   # http://localhost:3000
```

**Test checklist (DevTools → iPhone SE 375px, then 390px, then 430px):**

- [ ] NowBoard: task name ≥ 32px, countdown ≥ 52px, next-task visible
- [ ] Clock: visible, ≤ 65vw tall, arc paths still receive touch events
- [ ] Tap a clock arc → centered popover appears with task details
- [ ] Tap outside popover → popover dismisses
- [ ] Notes with text render in list below clock with task color dot
- [ ] `📝 Note` button adds a note that appears in list on phone
- [ ] Sidebar collapsed by default; `☰ Plan` toggle reveals task list + stats
- [ ] Mode / Start Time / Add Task / Budget panels absent on phone
- [ ] All buttons meet 44px touch target (DevTools accessibility checker)
- [ ] Resize to 800px → desktop layout fully restored, floating notes back, no sidebar toggle visible
- [ ] Run `npm test` — E2E suite passes (tests run at desktop width, no regressions)
