# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-file vanilla web app (`index.html`). No build step, no bundler, no dependencies. Open directly in a browser.

```bash
open index.html        # macOS
```

## Architecture

Everything lives in `index.html` in three sections: `<style>`, HTML markup, and a `<script>` block. The script is structured with clear comment banners (`// ── Section ───`) in this order:

1. **Constants** — SVG geometry (`CX/CY`, ring radii `OR_O/OR_I/IR_O/IR_I`), colour palette
2. **State (`S`)** — single mutable object: `mode`, `startTime`, `budget`, `tasks[]`, `settings`
3. **Persistence** — `save()` / `load()` via `localStorage` key `clocktask_v4`
4. **Init** — wires DOM events, hydrates state, starts `setInterval` tick
5. **Helpers** — `p2`, `hhmm`, `polar`, `svgEl`, `minsToAngle`, `durStr`, `absToTime`, `getBudgetMins`
6. **Clock face** — `buildFace()` draws static ticks + numerals into SVG `<g>` elements once at init
7. **Hands** — `tickHands()` rotates SVG hand elements + calls `updateBoard()` every second
8. **Now board** — `getCurrentTask()` computes active/next task from wall clock vs task timeline; `updateBoard()` renders it
9. **Mode / Free / Budget** — `setMode`, `addFreeTask`, `setBudgetInputMode`, `syncBudgetUI`, `applyBudget`
10. **Task list** — `renderList()` with HTML5 drag-and-drop reorder; `delTask`, `setColor`
11. **Stats** — `updateStats()` reads total duration and budget to populate footer
12. **Arc drawing** — `redraw()` clears and redraws all SVG arc groups; `drawSpan()` handles multi-lap wrap; `donutPath()` builds SVG path strings; `drawBudgetMarker()` draws the red END line; `taskTimings[]` is populated here for popover lookup
13. **Resize handles** — `addHandle()` places white dot handles between arcs; drag logic in `beginDrag` / `onDragMove` / `endDrag` pushes duration into adjacent tasks
14. **Popover** — event-delegated `mousemove` on the SVG; reads `data-ti` attribute set during `drawSpan`
15. **Settings** — modal open/close; `applySetting()` mutates `S.settings` and persists

## Key data relationships

- `S.startTime` (Date) + `S.tasks[i].duration` (minutes) define the entire timeline — everything else is derived
- `taskTimings[]` is a parallel array rebuilt on every `redraw()` containing `{startAbs, endAbs}` in absolute day-minutes; used by the hover popover and `getCurrentTask()`
- Budget limit flows through `getBudgetMins()` — both duration mode (`hours*60+mins`) and end-time mode (`endTimeStr − startTime`) resolve to a single minute count before being used anywhere
- Arc positions: `minsToAngle(lapPos)` converts 0–720 minutes → 0–360°; `lapN = floor(absMin/720)` selects outer ring (`lapN=0`) vs inner overflow ring (`lapN=1`)

## Design language

Braun clock aesthetic: dark surfaces (`#0f0f0f` bg, `#181818` surface), white/grey clock elements, amber accent `#F5B731` for second hand, live dot, and countdown. Typography is Helvetica Neue weight-200 for large display text, weight-300 for numbers. No external fonts or icon libraries.
