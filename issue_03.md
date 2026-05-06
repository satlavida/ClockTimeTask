# Visual Inconsistencies — Screenshot Audit

Sourced from `tests/screenshots/` (15 main + 3 permissions).

---

## 1. "STARTS AT" time displayed in blue — wrong palette color
**Screenshot:** `06-task-edit-modal.png`

In the Edit Task modal, "STARTS AT 22:09" is rendered in blue/cyan while "ENDS AT 22:39" is in amber (`#F5B731`). The project design language is dark surfaces + white/grey + amber. Blue appears nowhere else in the UI and is semantically meaningless here. Both start and end times should use the same color — either both amber or both white.

---

## 2. "Create Link" button not full-width in Share modal
**Screenshot:** `14-share-modal.png`

The "Create Link" CTA in the Share Session modal is narrow (auto-width, left-aligned) while all other primary action buttons — "Create Session" (10), "Join" (11), "+ Add Task" (01), "Save Changes" (06) — are full-width. This breaks the consistent button pattern for primary CTAs.

---

## 3. Apply Budget button clipped off-screen in Budget mode
**Screenshot:** `04-budget-mode.png`

When Budget mode is active, the sidebar form fills with Duration/End Time toggle, Hours/Mins inputs, Number of Tasks, and three Task Name fields. The Apply Budget button at the bottom is fully cropped out of view — not scrollable without resize. The user has no visible path to submit the budget form without scrolling. The sidebar should either scroll internally or the form should be more compact.

---

## 4. Session switcher active-item highlight uses brownish-olive, not a design-system color
**Screenshots:** `12-session-switcher-open.png`, `13-session-switcher-cloud.png`

The highlighted (active) row in the session switcher dropdown uses a brownish-olive fill (~`#3a3200`). This does not match any defined color in the palette — it's neither the amber accent `#F5B731`, the surface `#181818`, nor a neutral grey. The "Local" active row looks like a desaturated amber remnant. A cleaner neutral-highlight (e.g. `#242424`) or a left-border amber accent pattern would be more consistent.

---

## 5. Modal backdrop opacity is inconsistent across modal types
**Screenshots:** `05-settings-modal.png`, `06-task-edit-modal.png` vs `09-session-modal-home.png`, `10-session-modal-create.png`, `11-session-modal-join.png`

Settings and Task Edit modals use a semi-transparent backdrop — the clock face, clock numerals, and sidebar content remain visibly recognizable behind the overlay. Cloud Sessions modals use a much darker backdrop where the background is almost entirely black, removing all spatial context. The two modal styles should use the same backdrop opacity for visual consistency.

---

## 6. Privacy Policy modal has no bottom close/dismiss action
**Screenshot:** `07-privacy-modal.png`

The Privacy Policy modal exposes only an `×` button in the top-right corner. All other text-heavy or informational modals of this style typically pair the top-close with a bottom "Close" or "Got it" button for accessibility and discoverability — especially as the text grows and the × scrolls out of view. Settings, Share Session, and Edit Task all have bottom actions; this modal should too.

---

## 7. Empty sidebar in cloud sessions with limited permissions — no explanation
**Screenshots:** `14-share-modal.png`, `15-sync-status-badge.png`, `permissions/01-view-only.png`

When a cloud session has restricted permissions (e.g. view-only), the sidebar collapses to show only the "TASKS" section header (or nothing at all in some cases). There is no empty state, tooltip, or message explaining why the controls are hidden. A viewer joining a session would see a blank sidebar with no cue that the missing controls are permission-gated. A subtle label like "Read-only — controls hidden" under the session chip would resolve this.

---

## 8. "← Back" in session modal is unstyled plain text — no interactive affordance
**Screenshots:** `10-session-modal-create.png`, `11-session-modal-join.png`

The back link inside the Cloud Sessions modal is rendered as plain grey text with no underline, no hover state visible in the static screenshot, and no button affordance. Every other secondary action in the app is either a ghost-button (Cancel in task edit) or clearly a link with consistent styling. This looks like a forgotten style.

---

## 9. Session switcher dropdown overlaps the MODE section label without a separator
**Screenshots:** `12-session-switcher-open.png`, `13-session-switcher-cloud.png`

When the session switcher is open, its dropdown floats directly over the top of the sidebar content area (MODE section), with no shadow boundary or separator visually distinguishing where the dropdown ends and the sidebar begins. A clear `box-shadow` or border would improve layering legibility.

---

## 10. Sync status badge dot is a bare `•` character inline with "All notes" dropdown
**Screenshot:** `15-sync-status-badge.png`

The sync badge appears as a small amber dot (`•`) placed immediately after the "All notes ▾" dropdown in the topbar. It is very easy to overlook and visually merges with the dropdown. Compare this to the green dot used on the session chip (which is larger and more distinct). The sync badge should be a dedicated icon or badge element to the left of (or replacing) the cloud icon button, not an inline text node.

---

## Summary table

| # | Location | Type |
|---|---|---|
| 1 | Edit Task modal — STARTS AT time | Wrong color (blue) |
| 2 | Share modal — Create Link button | Width inconsistency |
| 3 | Budget panel — Apply Budget | Content clipped |
| 4 | Session switcher — active row | Off-palette highlight color |
| 5 | All modals — backdrop | Inconsistent overlay opacity |
| 6 | Privacy modal | Missing bottom close action |
| 7 | Cloud session sidebar (limited perms) | No empty-state explanation |
| 8 | Session modal — Back link | Missing interactive affordance |
| 9 | Session switcher dropdown | No shadow/separator from sidebar |
| 10 | Topbar sync badge | Too small, inline with unrelated control |
