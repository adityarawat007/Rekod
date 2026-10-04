# ReKod Design System — v1.1 (Electric blue + pink)

> **For Claude (or any developer) implementing this:** this file is the single source of truth for ReKod's UI. Follow the tokens and rules exactly. When something isn't covered, choose the option that is quieter, flatter and more data-first, and never invent new colours — derive from the tokens below. Read the whole file before writing code, then follow the **Implementation checklist** at the end.

---

## 0. What ReKod is

ReKod is a bug-reporting tool: a **Chrome extension** that records what went wrong (screen recording, screenshot, console logs, network requests, user steps, device info) and a **web dashboard** where teams review, triage and share those recordings ("rekods"). It is for everyone — developers, QA, PMs, support — so it must feel precise and data-dense **and** friendly.

**Main screens:** All Rekods (list/grid), Rekod detail (video + DevTools panel: Info / Console / Network / Steps), Overview/analytics, Settings, Extension popup.

**Naming:** the product is written **ReKod** in prose. A single recording is a **rekod** (plural **rekods**). IDs are written `RK-1042`.

---

## 1. Design direction

**One sentence:** a clean, sharp, data-first dashboard (light grey canvas, white panels, mono labels, square corners) in a bold **midnight + electric blue** palette, with **pink** marking things that need attention — flat colours only, no gradients inside the app.

### Principles

1. **Data first.** Tables, grids and charts are the product. Chrome stays quiet: thin 1px borders, no decorative shadows inside the app, square corners.
2. **Colour carries meaning.** Midnight = *open / text / selected*. Electric blue = *primary action / active / links*. Pink = *in review / highlight*. Everything else is neutral grey.
3. **Flat, never gradient, in the product.** All UI colours are solid. A blue gradient is allowed only on marketing surfaces (§2.4). **Never on headings, text, numbers, icons or buttons.**
4. **Sans for work, mono for machine.** Inter Tight for headings and UI text; IBM Plex Mono for labels, IDs, timestamps, URLs, logs and numeric table cells.
5. **Status is always written.** Colour is never the only signal — every status has a label, a dot/shape or both.
6. **Calm motion.** Short, functional transitions only (≤150 ms). No decorative animation.

### Hard rules (do / don't)

| Do | Don't |
|---|---|
| Solid colours for all text, including the lighter second word of page titles | **Gradient text anywhere** (no `background-clip: text`) |
| Square corners (`radius: 0`) on panels, chips, cells, buttons, inputs | Rounded "card" corners inside the app (only avatars, dots and toggles are round) |
| 1px borders to separate | Drop shadows on panels or cards |
| Mono uppercase labels for metadata keys (`STATUS`, `PAGE`) | Mono for sentences or body copy |
| One primary (electric blue) button per view | Multiple competing primary buttons |
| Solid colours everywhere in the app (the diagonal "snoozed" hatch pattern is the only exception) | Any colour gradient in the app UI (buttons, headings, tabs, charts, rows, backgrounds) |

---

## 2. Colour

All colours are CSS custom properties. Components must reference **tokens**, never hex values.

### 2.1 Brand palette (raw values — do not use directly in components)

| Name | Hex | Notes |
|---|---|---|
| midnight | `#00022F` | Primary text, "open" status, tooltips, toasts, selection outline |
| electric-blue | `#060CBE` | Primary buttons, active tab underline, links, focus, selection bar, outer frame |
| electric-blue-hover | `#0A12E0` | Hover on electric blue |
| lavender | `#C4C4F6` | Soft blue tint: info backgrounds, hover on chips, chart highlight band |
| pink | `#F1B0E1` | "In review", highlights, secondary CTA on dark |
| pink-soft | `#FADDF2` | In review outside filter, soft highlight backgrounds |
| pink-ring | `#C774B0` | Ring/outline on pink elements |
| grey-100 | `#ECECEC` | App canvas |
| grey-800 | `#3B3B3B` | Secondary part of page titles |

### 2.2 Semantic tokens — Light

```css
:root {
  /* surfaces */
  --bg:            #ECECEC;  /* app canvas */
  --panel:         #FFFFFF;  /* panels, header, table */
  --line:          #DEDEE3;  /* hairlines, row dividers */
  --line-strong:   #8C8C98;  /* chip/input/button borders (≥3:1 on white) */

  /* text */
  --ink:           #00022F;  /* primary text */
  --muted:         #4F4F5C;  /* secondary text (6.8:1 on --bg) */
  --faint:         #6E6E78;  /* tertiary meta (5:1 on white) */
  --title-2:       #3B3B3B;  /* second part of page title */

  /* brand / status */
  --primary:       #060CBE;  /* primary button, active tab, links */
  --primary-hover: #0A12E0;
  --on-primary:    #FFFFFF;
  --open:          #00022F;  /* "open" status fill */
  --on-open:       #FFFFFF;
  --accent:        #F1B0E1;  /* in review, highlight */
  --accent-soft:   #FADDF2;
  --accent-ring:   #C774B0;
  --on-accent:     #00022F;
  --tint:          #C4C4F6;  /* lavender info/hover tint */
  --tint-soft:     #E6E6FB;
  --link:          #060CBE;
  --focus:         #060CBE;
  --selected:      #00022F;  /* selection outlines */

  /* data cells (grids/heatmaps) */
  --cell:          #E7E7EC;  /* resolved / empty */
  --cell-out:      #F2F2F5;  /* outside current filter */
  --cell-text:     #9A9AA6;  /* inactive cell label (decorative) */
  --open-dim:      #585A8C;  /* open, but outside filter */
  --accent-dim-text:#8A4A7E; /* text on --accent-soft */

  /* feedback */
  --error:         #C8341F;
  --warning:       #9A6400;
  --success:       #2E7D3A;
  --info:          #060CBE;

  /* dark chrome (tooltips, toasts) */
  --chrome:        #00022F;
  --on-chrome:     #FFFFFF;
  --on-chrome-muted:#B4B6D6;

  /* frame */
  --frame:         #060CBE;  /* outer frame behind the app container */
}
```

### 2.3 Semantic tokens — Dark

Apply under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`.

```css
[data-theme="dark"] {
  --bg:            #07081C;
  --panel:         #11132B;
  --line:          #23264A;
  --line-strong:   #4A4D78;
  --ink:           #EEEEF6;
  --muted:         #A6A8C2;
  --faint:         #7A7D99;
  --title-2:       #9A9CB8;
  --primary:       #4A50F0;  /* lighter electric blue, white text 5.7:1 */
  --primary-hover: #5D63FF;
  --on-primary:    #FFFFFF;
  --open:          #2B2F7A;  /* visible on dark panels */
  --on-open:       #FFFFFF;
  --accent:        #F1B0E1;
  --accent-soft:   #4A2A44;
  --accent-ring:   #E6A3D3;
  --on-accent:     #00022F;
  --tint:          #2C2F6E;
  --tint-soft:     #1B1D45;
  --link:          #9EA2FF;
  --focus:         #9EA2FF;
  --selected:      #EEEEF6;
  --cell:          #1F2240;
  --cell-out:      #171A33;
  --cell-text:     #6C6F8E;
  --open-dim:      #262955;
  --accent-dim-text:#F1B0E1;
  --error:         #FF8A73;
  --warning:       #F2C25A;
  --success:       #6FCF8E;
  --info:          #9EA2FF;
  --chrome:        #00022F;
  --on-chrome:     #FFFFFF;
  --on-chrome-muted:#B4B6D6;
  --frame:         #00022F;
}
```

### 2.4 Gradients — marketing only

The product UI uses **no gradients**. For marketing surfaces only (landing-page hero, onboarding welcome, top band of the extension popup) you may use:

```css
--gradient-electric: linear-gradient(120deg, #060CBE 0%, #00022F 100%);
```

Never use it on text, headings, buttons, charts, table rows or app backgrounds.

### 2.5 Outer frame

On desktop web the app container sits on a solid `--frame` (electric blue in light, midnight in dark) with 24px padding and shadow `0 30px 80px rgba(0,2,47,.35)`. On ≤760px the frame is removed.

### 2.6 Status colours (rekods)

| Status | Fill | Text on fill | Dot / marker | Notes |
|---|---|---|---|---|
| Open | `--open` (midnight) | `--on-open` | solid midnight dot | Default for new rekods |
| In review | `--accent` (pink) | `--on-accent` | pink dot with `--accent-ring` 1.5px inset | Show "· N days" after label |
| Snoozed | diagonal hatch (see §6.6) | `--cell-text` | ⊘ circle-slash icon | |
| Resolved | `--cell` | `--cell-text` | grey dot | |
| Outside current filter | `--cell-out` / `--open-dim` / `--accent-soft` | muted / `--accent-dim-text` | — | Same status, faded |
| Selected | 2.5px `--selected` outline, 2px offset | — | ring around chart dot | |

Console/network levels: **ERR** `--error`, **WARN** `--warning`, **INFO/LOG** `--muted`, **2xx** `--success`, **4xx/5xx/failed** `--error`. Always show the text label (`ERR`, `500`, `failed`).

### 2.7 Contrast (verified)

- `--muted` on `--bg` 6.8:1, on white 8.1:1. `--faint` on white 5.0:1 (meta only).
- White on electric blue 11.6:1; midnight on pink 11.5:1; `--title-2` on `--bg` 9.5:1.
- Dark mode: white on `--primary` 5.7:1; `--muted` on panel 7.8:1.
- `--cell-text` on `--cell` is low contrast by design (inactive/decorative labels). Interactive, matching cells always use status colours.

---

## 3. Typography

All fonts are free (Google Fonts, SIL Open Font License) and safe for commercial use.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-sans: "Inter Tight", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
```

| Role | Font | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display` | Sans | `clamp(42px, 5.6vw, 76px)` / 1.05 | 700 | -0.045em | Page title first part ("Rekods") in `--ink` |
| `display-secondary` | Sans | same as display | 300 | -0.045em | Second part ("app.talk-dev") in solid `--title-2` — **no gradient** |
| `h2` | Sans | 20 / 26 | 600 | -0.015em | Panel titles ("Rekods × day") |
| `stat` | Sans | 28 / 32 | 600 | -0.02em | Big counters ("13 of 27 match") |
| `tooltip-value` | Sans | 26 / 30 | 600 | -0.02em | Tooltip headline number |
| `body` | Sans | 14 / 20 | 400 | 0 | Default UI text |
| `body-strong` | Sans | 14 / 20 | 500 | 0 | Nav, chip values, button text |
| `small` | Sans | 13 / 18 | 400 | 0 | Secondary info |
| `label` | Mono | 11 / 16 | 400–500 | 0.08em, UPPERCASE | Chip keys, table headers, section eyebrows |
| `data` | Mono | 12–13 / 18 | 400 | 0 | IDs, timestamps, URLs, numeric cells, logs |
| `wordmark` | Sans | 22 | 700 | -0.02em | "rekod" lowercase, preceded by a 12px electric-blue dot |

Rules:
- Numbers in tables use mono and are right-aligned.
- Never set full sentences in mono or in uppercase.
- Sentence case for all UI text ("Clear filters", not "Clear Filters").

---

## 4. Spacing, layout, shape

- **Base unit 4 px.** Scale: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48.
- **Radius:** `0` everywhere in the app (panels, chips, inputs, buttons, cells, tooltips, menus, selection bar). Exceptions: avatars, status dots, toggle switches, checkboxes (0 as well — square).
- **Borders:** 1px `--line` for panels and dividers; 1px `--line-strong` for chips, inputs, secondary buttons.
- **Shadows:** none inside the app. Only the app container on the outer frame gets `0 30px 80px rgba(0,2,47,.35)`.

### Page layout (dashboard, desktop)

```
┌ outer frame (solid --frame, 24px padding) ─────────────────────────────────┐
│ ┌ app container (max-width 1440px, bg --bg) ─────────────────────────────┐ │
│ │ Header 64px, bg --panel, bottom border                                   │ │
│ │ main: padding 28px                                                       │ │
│ │   Page title (display) + summary line + legend dots                      │ │
│ │   Filter row (chips · Clear filters · "N of M match" right-aligned)      │ │
│ │   Content grid: two columns (0.9fr / 1fr), gap 20px                      │ │
│ │     left: big data panel        right: stacked panels (chart, table)     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Panels: `--panel` bg, 1px `--line` border, padding `24px 26px`.
- Breakpoints: `≤1100px` → content grid becomes one column. `≤760px` → remove frame padding, header scrolls horizontally, hide secondary header controls, filter "match" counter wraps to its own line.

---

## 5. Iconography

- **Lucide** icons (MIT), 16px in UI, 20px in nav, stroke 1.6, `currentColor`.
- Icons never carry meaning alone; pair with text or `aria-label`.
- Status shapes: filled midnight dot (open), pink dot with ring (in review), ⊘ (snoozed), grey dot (resolved).

---

## 6. Components

Every component below lists anatomy, tokens and states. Build each as a reusable component.

### 6.1 App header
- Height 64px, `--panel`, bottom border `--line`, horizontal padding 28px, gap 28px.
- Left: **wordmark** "rekod" (sans 700, 22px, lowercase) with a 12px `--primary` dot before it.
- Nav tabs: sans 500, `--muted`; active = `--ink` with **2px solid `--primary` underline** flush with the header's bottom border.
- Right: "Updated today, 15:58" (`--faint`), **Select buttons** (`PROJECT` and `PERIOD`, see §6.3), theme toggle (38×38, 1px border).

### 6.2 Page title block
- `display`: **"Rekods"** (700, `--ink`) + space + **"app.talk-dev"** (`display-secondary`, 300, `--title-2`). **Both solid colours. No gradient.**
- Summary line below (14px, `--muted`): "Flam · 27 unresolved of 72 · 1,006 errors captured", followed by legend items: ● 14 open · ● 12 in review · ⊘ 1 snoozed (counts in `--ink`).

### 6.3 Filter chip / select
- Height 38px, padding 0 12px, 1px border, radius 0, gap 8px.
- Anatomy: `KEY` (mono label, `--faint`) + value (sans 500) + `×` (remove) or `▾` (open).
- **Active** (filter applied): border `--ink`, bg `--panel`, text `--ink`, shows `×`.
- **Inactive**: border `--line-strong`, bg `--bg`, text `--muted`, shows `▾`.
- "Clear filters": mono 12.5px, 500, underlined text button.
- Match counter (right-aligned): "**13** of 27 unresolved rekods match" — number in `stat`.

### 6.4 Buttons
| Variant | Style |
|---|---|
| Primary | bg `--primary` (electric blue), text `--on-primary`, height 36–38px, padding 0 14px, sans 500. Hover `--primary-hover`. One per view. |
| Secondary | 1px `--line-strong`, bg `--panel`, text `--ink`. Hover bg `--bg`. |
| Text / link | no border, `--link`, underline on hover. |
| On blue selection bar | Outline: 1px rgba(255,255,255,.45), text white. Filled: bg `--accent`, text `--on-accent`. |
| Destructive | 1px `--error` border, `--error` text; filled only inside a confirm dialog. |
All: radius 0, focus = 2px `--focus` outline, 2px offset. Disabled = 50% opacity, no pointer.

### 6.5 Panel
- `--panel`, 1px `--line`, padding 24px 26px.
- Header: `h2` title (+ optional `small` muted meta after it, e.g. "13 of 27 unresolved"), right-aligned meta (`--muted`, e.g. "Sorted by errors ↓").
- Sub-line: 14px `--muted` explaining the visual ("each cell = one recording, rekod number + errors caught").

### 6.6 Heat grid ("Rekods × day")
- Grid: first column 28px (row labels: day numbers in mono `--muted`), then N data columns (`minmax(104px,1fr)`), last column 40px "MATCH" count. Row gap 6px, column gap 7px. Horizontal scroll under min width.
- Column header: mono 12px, line 1 `01 · /projects` (500, `--ink`), line 2 description (`--muted`).
- **Cell:** height 32px, padding 0 9px, flex space-between, mono 12px: left = rekod number, right = "N err" (only for unresolved). Radius 0.
- Cell states: see §2.6. Snoozed hatch: `repeating-linear-gradient(135deg, var(--cell) 0 4px, var(--panel) 4px 7px)` + inset 1px `--line-strong`.
- Hover: slight darken (`filter: brightness(.96)`) + tooltip (§6.9).
- Click on a matching cell toggles selection; click on non-matching shows toast "Outside current filter".
- Legend under the grid: top border 1.5px `--ink`, items = swatch (22×14) + dot + label: Resolved, In review, Open, Snoozed, Outside filter, Selected (n).

### 6.7 Scatter chart ("Errors × team attention")
- SVG, responsive width. Axes: x = errors caught, y = views. Grid lines 1px `--line`; baseline 1px `--ink`; axis labels mono 11px `--muted`; axis titles in mono uppercase ("VIEWS", "ERRORS CAUGHT →").
- Median line: 1px `--ink` with label "Median views · 8" (mono 11px, `--ink`).
- Points r=5.5: matching open = `--open`; matching in review = `--accent` with `--accent-ring` stroke; non-matching = `--cell` (in-review non-matching = hollow ring `--accent-ring`).
- Selected points: extra ring r=11, 2px `--selected`, plus label `RK-1302` above (mono 11.5px `--ink`).
- Draw non-matching points first, matching on top. Hover → tooltip; click matching point → toggle selection.

### 6.8 Data table ("Matching rekods")
- Full width, border-collapse. Header: mono 11px uppercase 500, `--muted`, bottom border `--line`; sortable headers are buttons, active sort shows ↓ and `--ink`.
- Rows: padding 13px 10px, bottom border `--line`. Columns: checkbox · REKOD (mono) · PAGE (mono) · BROWSER · LENGTH (mono, right) · STATUS (dot + label + "· N days" muted) · ERRORS (right) · VIEWS (right) · chevron `›` (`--muted`).
- Selected row: bg `--bg` + 3px inset left bar `--ink` on first cell.
- Header checkbox supports checked / indeterminate.
- Empty: "No rekods match these filters." in `--muted`.

### 6.9 Tooltip
- bg `--chrome`, text `--on-chrome`, radius 0, padding 10px 12px, min-width 200px, no shadow, no pointer arrow. Follows cursor (+14px), clamped to viewport.
- Content: line 1 mono 11.5px `--on-chrome-muted` ("RK-1202 · /agent · Chrome"); line 2 `tooltip-value` ("19 errors"); line 3 status dot + label; line 4 mono muted meta ("11 views · 0:42 long").

### 6.10 Selection action bar
- Appears under the table when ≥1 row is selected. bg `--primary` (solid electric blue), text white, padding 10px 12px 10px 16px, radius 0.
- Anatomy: `×` clear · **"3 selected"** (500) · IDs + combined total in mono 12px rgba(255,255,255,.75) (single line, ellipsis) · actions right: outline "Merge into 1 issue", filled pink "Send to Linear".
- Selection is shared state: grid cells, chart points, table rows and legend count must always agree.

### 6.11 Checkbox
- 17×17, square, 1.5px `--line-strong`, bg `--panel`. Checked/indeterminate: bg + border `--ink`, white check/dash.

### 6.12 Inputs (search, text)
- Height 38px, 1px `--line-strong`, radius 0, bg `--panel`, placeholder `--muted`. Focus: border `--ink` + 2px `--focus` outline. Search shows a `⌘K` kbd chip (mono 11px, 1px border). ⌘K / Ctrl+K focuses search.

### 6.13 Toast
- Bottom-center, bg `--chrome`, text `--on-chrome`, mono 12.5px UPPERCASE short message ("SENT 3 REKODS TO LINEAR"), radius 0, auto-hide 2 s, `role="status"`.

### 6.14 Status dot
- 10px circle. Open: `--primary`. In review: `--accent` + inset 1.5px `--accent-ring`. Snoozed: outlined circle with a diagonal slash. Resolved: `--cell`.

### 6.15 Rekod detail page (apply the same system)
- Header + title block as above; title = rekod title (`display`), second part = page host in `display-secondary` (`--title-2`).
- Left: video in a panel (radius 0), playback bar with mono timestamps; error markers on the timeline as small squares in `--error`.
- Right: DevTools panel with tabs **Info / Console 9 / Network 46 / Steps 4** styled as header tabs (2px `--primary` underline), counts in mono. Console/Network rows use the table spec (§6.8) with level labels coloured per §2.6. Request details open as a right-side drawer panel with collapsible sections (General, Response headers, Request headers), keys in mono `label`, values in mono `data`.
- Actions: primary "Copy link", secondary "Send to…" menu (Linear, Jira, Slack).

### 6.16 Empty states
- Text only, inside the panel: `h2` headline ("No rekods yet"), one `--muted` sentence, one primary button ("Record a bug"). No illustrations.

---

## 7. Interaction & motion

- Transitions: 120–150 ms ease-out, only on colour, background, border and opacity. No bouncing, no parallax, no decorative loops.
- Hover: rows/cells darken slightly; buttons change background.
- Focus: always visible, 2px `--focus` outline, 2px offset. Never remove outlines.
- Keyboard: ⌘K focuses search; Esc closes menus/drawers; Enter opens the focused row; Space toggles row checkbox.
- Respect `prefers-reduced-motion: reduce` → disable all transitions.

---

## 8. Voice & copy

- Short, plain, sentence case. Specific numbers over vague words ("13 of 27 match", not "Some match").
- Status words: Open, In review, Snoozed, Resolved.
- Toasts: uppercase mono, past tense, ≤5 words ("LINK COPIED", "FILTERS CLEARED").
- Errors: say what happened and what to do ("Upload failed. Check your connection and try again."). Never blame the user.

---

## 9. Accessibility

- Meet WCAG 2.1 AA: body text ≥4.5:1, large text and UI boundaries ≥3:1 (see §2.7).
- Never rely on colour alone: every status has a label and shape; every level has a text tag.
- All icon-only buttons need `aria-label`. Charts need `role="img"` + `aria-label`, plus the table as the accessible equivalent of the visuals.
- Hit targets ≥ 32×32 px (38px for header controls).
- Support light and dark mode; respect `prefers-color-scheme` with a manual override stored per user.

---

## 10. Implementation instructions

### 10.1 Token files
1. Create `styles/tokens.css` with §2.2 (light), §2.3 (dark, under both `[data-theme="dark"]` and the `prefers-color-scheme` media query guarded by `:root:not([data-theme="light"])`) and §3 font variables. Keep `--gradient-electric` in a separate `marketing.css`.
2. Load fonts once in the root layout (§3 link).
3. Components use only `var(--token)`. No raw hex in component code (only `tokens.css` and `marketing.css` contain hex values).

### 10.2 Tailwind (if the project uses it)
```js
// tailwind.config.js
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    borderRadius: { none: '0', full: '9999px' },          // square by default
    fontFamily: {
      sans:  ['"Inter Tight"', 'system-ui', 'sans-serif'],
      mono:  ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
    },
    extend: {
      colors: {
        bg: 'var(--bg)', panel: 'var(--panel)', line: 'var(--line)', 'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)', 'title-2': 'var(--title-2)',
        primary: 'var(--primary)', 'on-primary': 'var(--on-primary)', open: 'var(--open)', tint: 'var(--tint)', frame: 'var(--frame)',
        accent: 'var(--accent)', 'accent-soft': 'var(--accent-soft)', 'accent-ring': 'var(--accent-ring)',
        link: 'var(--link)', cell: 'var(--cell)', 'cell-out': 'var(--cell-out)', 'open-dim': 'var(--open-dim)',
        error: 'var(--error)', warning: 'var(--warning)', success: 'var(--success)', chrome: 'var(--chrome)',
      },
    },
  },
};
```
If using shadcn/ui, map its CSS variables (`--background`, `--foreground`, `--primary`, `--border`, etc.) to these tokens and set `--radius: 0`.

### 10.3 Suggested component structure
```
components/
  layout/AppFrame, AppHeader, PageTitle
  filters/FilterChip, FilterBar, MatchCounter
  data/HeatGrid, HeatCell, Legend, ScatterChart, DataTable, StatusDot
  overlays/Tooltip, Toast, Menu, Drawer
  actions/Button, SelectionBar, Checkbox, SearchInput
  rekod/RekodPlayer, DevToolsPanel, ConsoleList, NetworkList, RequestDetails
```
Keep selection and filter state in one store (context/Zustand/etc.) so grid, chart, table and selection bar stay in sync.

### 10.4 Reference prototype
The interactive HTML prototype of this direction is the "Rekods overview" page — choose **"Electric blue + pink"** in its Palette lab. Treat this file as the authority where they differ — notably **headings are always solid colours, never gradient**, and the app UI has no gradients at all.

---

## 11. Implementation checklist

- [ ] `tokens.css` created with light + dark tokens and fonts; no hex values in components
- [ ] Fonts loaded: Inter Tight, IBM Plex Mono
- [ ] All corners square (except avatars/dots/toggles)
- [ ] **No gradients anywhere in the app UI**; `--gradient-electric` only on marketing surfaces
- [ ] Page title: sans 700 `--ink` + second part sans 300 in solid `--title-2`
- [ ] Primary buttons/active tabs electric blue; open status midnight; in review pink
- [ ] Filter chips with active/inactive states, Clear filters, match counter
- [ ] Heat grid with all status states, hatch for snoozed, legend
- [ ] Scatter chart with median line and selected rings
- [ ] Table with sortable headers, checkboxes (incl. indeterminate), selected row bar
- [ ] Selection synced across grid, chart, table, legend, selection bar
- [ ] Tooltip, toast, menu and drawer per spec
- [ ] Status always has text + shape; console/network levels have text tags
- [ ] Visible focus states, keyboard shortcuts, reduced-motion support
- [ ] Dark mode verified on every screen
- [ ] Responsive at 1100px and 760px breakpoints