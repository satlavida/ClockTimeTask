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

Hosted on Cloudflare Pages as the `clocktask` project.

```bash
wrangler pages deploy . --project-name clocktask   # deploy latest
wrangler pages project list                        # list all projects
```

URLs:
- Production: https://clocktask.satyajeetnigade.in
- Pages: https://clocktask.pages.dev

## Architecture

Modular ESM source in `src/`, bundled to `dist/main.js` + `dist/main.css` by esbuild. Static HTML structure in `index.html`.

### Module layout

```
src/
├── main.js              ← entry: imports CSS, calls init()
├── app.js               ← init(): wires all sections, starts tick
├── logic/
│   ├── constants.js     ← CX/CY, ring radii, GAP_DEG, PALETTE, KEY, SEC_KEY
│   ├── state.js         ← S object, save(), load()
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
    │   └── TaskItem.js  ← createTaskItem(task, callbacks) → DOM element
    ├── sections/
    │   ├── ModePanel.js, StartTimePanel.js, FreeAddPanel.js
    │   ├── BudgetPanel.js, TaskList.js, StatsFooter.js
    ├── modals/
    │   ├── SettingsModal.js, TaskEditModal.js
    ├── clock/
    │   ├── ClockSVG.js  ← buildFace, redraw, tickHands, arc drag resize
    │   └── Popover.js   ← arc hover tooltip
    └── NowBoard.js      ← live task board, countdown, chime boundary detection
```

### Key patterns

- `app.js` defines a single `refresh()` closure that chains `renderList → redraw → updateStats → updateBoard`; every section callback calls it
- Each `src/ui/sections/*.js` exports an `init*()` function (wires DOM events) and optionally a `sync*()` function (hydrates DOM from state)
- `S` is a shared mutable object; mutators in `logic/tasks.js` call `save()` then return; callers chain `refresh()`
- `taskTimings[]` is module-level in `ClockSVG.js`, rebuilt on every `redraw()`, exported for `Popover.js`

## Key data relationships

- `S.startTime` (Date) + `S.tasks[i].duration` (minutes) define the entire timeline — everything else is derived
- `taskTimings[]` is a parallel array rebuilt on every `redraw()` containing `{startAbs, endAbs}` in absolute day-minutes; used by the hover popover and `getCurrentTask()`
- Budget limit flows through `getBudgetMins()` — both duration mode (`hours*60+mins`) and end-time mode (`endTimeStr − startTime`) resolve to a single minute count before being used anywhere
- Arc positions: `getCycleMins()` returns 720 (12h) or 1440 (24h); `minsToAngle(lapPos)` converts 0–cycle minutes → 0–360° without modulo (avoids a 0° collapse at lap boundaries); `lapN = floor(absMin/cycle)` selects outer ring (`lapN=0`) vs inner overflow ring (`lapN=1`)
- `S.settings.clock24h` (bool) switches the entire clock — face numerals, hand speed, and arc cycle — between 12h and 24h mode

## Design language

Braun clock aesthetic: dark surfaces (`#0f0f0f` bg, `#181818` surface), white/grey clock elements, amber accent `#F5B731` for second hand, live dot, and countdown. Typography is Helvetica Neue weight-200 for large display text, weight-300 for numbers. No external fonts or icon libraries.
