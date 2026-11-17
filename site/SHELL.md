# Bros Cafe · Üveg — the shell and the design language

**Üveg** ("glass", chosen by the owners in Nov 2026): espresso and warm photos for the evening moments, ivory for
reading, crisp Fraunces with a real italic, and liquid glass on everything that floats (header, tab bar, sheets, chips
over photos). One stylesheet system, no override layer:

| File | What |
|---|---|
| `shell.css` | fonts, **all colour tokens**, evening bands, reset, type, buttons, cards, photos, header, tab bar, sheets, toast, consent, footer, view transitions. Loaded first on every page. |
| `shell.js` | the nav config (`NAV`) and everything built from it; sheet physics; `window.BROS.shell`. First thing in `<body>`. |
| `glass.js` | keeps the glass bars glassy through page changes (below). Deferred, on every page. |
| `pages.css` | subpage components: `.phero`, `.paper`, `.chip`, `.fold`, forms, and the blocks of étlap, hűségkártya, újdonságok, kapcsolat, játék. |
| `site.js` | subpage logic; calls `BROS.shell.footer()`. |
| `style.css` + `home.js` | **home only**: hero, the pinned act (cups → the two extras), the visit; scroll-driven motion, panels. |
| page css | `after-hours/`, `delivery/`, `jatek/game.css`, `customer.css`, staff: `belepes/`, `pult/`, `admin/`. Loaded after `pages.css`. |

Media: `docs/media-picks.md` says which photo or clip goes where (`/shared/media/…`, every photo also as `.webp`).

## Tokens (`:root` in `shell.css`, the only place for colour values)

| Group | Tokens |
|---|---|
| Palette | `--espresso` #25251C (`-2`, `-3`, `-rgb`) · `--ivory` #F3EBDD (`-hi`, `-2`, `-3`, `-rgb`) · `--champagne` #C6A875 (`-hi`, `-rgb`) · `--bronze` (champagne on ivory, AA) · `--taupe` · `--olive` #68704B (`-dark` fills with ivory text, `-deep` small olive text, `-soft`, `-tint`, `-rgb`, `-card`) · `--open` (the "open now" dot) · `--err` (`-rgb`, `-bg`) · `--white` |
| Roles | `--text` · `--text-soft` · `--text-faint` · `--text-rgb` · `--surface` · `--surface-2` · `--accent-text` · `--on-accent` · `--eyebrow` · `--line` · `--line-strong` · `--hair` (1 px line) · `--btn-fill` (the lit olive gradient) |
| Glass | `--g-{chrome,smoke,clear,olive,frost,sheet}-bg` (tint) + `-fx` (backdrop filter) · `--g-rim-dark` / `--g-rim-light` (the light on the edges) · `--g-lift` / `--g-lift-sm` (shadow under floating glass) · `--warm` (filter: daylight photo → evening light) |
| Type | `--serif` (Fraunces) · `--sans` (Inter) · `--soft` (Fraunces axes, add to `font-variation-settings`) |
| Shape, depth | `--r-sm 14` · `--r-md 20` · `--r-lg 26` · `--r-pill` · `--shadow-sm/md/lg` |
| Layout | `--pad` · `--max 1200px` · `--header-h` (60 phone / 76 desktop) · `--tabbar-h` (78 / 0) · `--safe-b` · `--bottom-h` |
| Motion | `--ease` · `--dur .3s` · `--tap .1s` |
| Game | `--g-game-*`: the canvas colours `jatek/game.js` reads. |

Alpha colours: `rgb(var(--espresso-rgb) / .1)`. `--cream`, `--glow`, `--honey`, `--edge` are old names kept only for
markup built in JS; don't use them in CSS.

## The look, as rules

1. **Ivory to read, espresso for the evening.** Pages sit on ivory; page heads, the hero, the extras, the card panel,
   the footer and the bars are *evening bands* (the first group rule in `shell.css`): every role token inside flips to
   "on espresso" (ivory text, champagne eyebrows and small accents). A light surface inside a band (`.form`, `.paper`,
   `.sheet`, `.panel`, … the second group rule) reads as on ivory again. Add a new band or surface to those lists, never
   hand-pick colours.
2. **Type.** Headings are Fraunces, weight 420, `font-variation-settings: var(--soft)`, `font-synthesis: none`,
   tight tracking (`-.01em … -.026em`). Emphasis is `<em>`: the real italic at weight 380, no marker. Labels and
   eyebrows: Inter 600, 11.5 px, uppercase, `.22em`, `color: var(--eyebrow)`. Inter for everything else.
3. **Photos** sit in a `.cut`: rounded `--r-lg`, `--shadow-md`, no border, no tilt. Give it a size (height or
   `aspect-ratio`); the image fills it. Photos on an evening band get `filter: var(--warm)` (or the lighter
   `sepia(.32) saturate(1.2) brightness(.92)` on cards).
4. **Glass only on what floats**: `chrome` (header, tab bar, booking bar, toast), `smoke` (chips over a photo),
   `clear` (ghost buttons and pills on espresso), `olive` (the extras, the pass), `frost` / `sheet` (bars and sheets
   over ivory). Each is `background: var(--g-x-bg); backdrop-filter: var(--g-x-fx); box-shadow: var(--g-rim-…)`.
   Reduced transparency and more contrast swap them for solid fills (token blocks in `shell.css`).
5. **Buttons**: `.btn` is the lit olive pill; on a band, `.btn--ghost` and `.link` become clear glass pills (a link
   on a light card in a band stays a text link). No ink outlines and no hard press edges: flat things get `--hair`
   or nothing, cards a soft shadow.
6. **The page runs under the chrome**: the header is smoked glass, the tab bar a floating capsule; on home and on
   page heads the band starts under the header (`margin-top: calc(-1 * var(--header-h))`).

## Components

- **Type**: `.eyebrow`, `.display` (`--md`), `.title` (`--lg`), `.body` (`--lg`), `.fine`.
- **Buttons**: `.btn` (olive), `.btn--ghost` (outline / clear glass on a band), `.btn--light` (ivory), `.link`, `.actions`.
- **Cards and photos**: `.card` (hairline, `--r-lg`), `.cut` (+ `.cut--circle`), `.sticker` (a frosted pill; smoked
  inside a `.cut`), `.new` (the small "Új" badge).
- **Layout**: `.wrap`, `.visually-hidden`.
- **Header** `.site-header`, **tab bar** `.tabbar`, **sheets** `dialog.sheet`, **toast**, **consent banner**: generated
  by `shell.js`, never by hand.

`body` has `padding-top: var(--header-h)` and `padding-bottom: var(--bottom-h)` (home sets both to 0: its scenes carry
the clearance). Sticky things use `top: var(--header-h)`; fixed things at the bottom use `bottom: calc(var(--bottom-h) + …)`.

## Motion

- **Press feedback is instant**: tappable things scale to .96–.98 on `:active` with `transition-duration: .1s`.
  Hover (inside `@media (hover: hover)`): `filter: brightness(1.08–1.18)` or a lighter fill, never a jump.
- **Sheets are physical** (`BROS.shell.sheet(dialog, { wide, hide })`): below `wide` (default 900 px) the dialog
  rises on a critically damped spring, follows the finger 1:1 on its `.sheet__grab`, resists past the top, and on
  release goes where the flick was heading (closes or springs back with the finger's velocity). It can be caught
  mid-flight. Any bottom sheet on a subpage should use it: give the dialog a `.sheet__grab` as first child and call
  `ctl.open()` / `ctl.close()` instead of `showModal()` / `close()`. No spring library: ~40 lines in `shell.js`.
- **Scroll-driven motion (home)**: three scenes, no scroll snapping. `data-m` = an entry and an exit animation tied to
  its scene's view timeline. `data-s` = scrubbed while the act (`.act`, `#kavek`) is pinned: the stage is `sticky` for
  `--scrub` screens of scroll; the cups sit on a wheel (`--cw` card width, `--R` radius, `--step` angle) that the scroll
  turns, then the wheel sinks, evening falls over the room photo and the two extras come in from the sides. The film
  shrinks into a rounded card as the hero is covered. Timings are the `--a` / `--b` pairs in the "motion" block at the
  end of `style.css`. Where scroll-driven animations are missing, `home.js` writes `--pin` / `--pout` / `--p` and the
  same keyframes are scrubbed through `animation-delay` (test with `?nosda`; `?still` = the plain layout). To reuse on
  a subpage keep it small: one `animation-timeline: view()` reveal per section (`from { opacity: 0; transform:
  translateY(40px) }`, `animation-range: entry 10% entry 80%`), inside `@supports (animation-timeline: view())` and
  `@media (prefers-reduced-motion: no-preference)`. Only `transform` and `opacity`. At rest nothing is transformed.
- **Reduced motion / Save-Data**: no scroll motion, no video (the still shows), sheets and panels open without
  travel, view transitions off. Everything stays usable.
- **Page to page**: cross-document view transitions (below).

## Add a page

```html
<head>
  …charset, viewport, <meta name="robots" content="noindex,nofollow">, title, description…
  <meta name="theme-color" content="#25251C">
  <link rel="preload" href="/shared/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/fraunces-latin-ext-full-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/inter-latin-ext-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="expect" href="#site-header" blocking="render">
  <script src="/i18n.js"></script>
  <link rel="stylesheet" href="/shell.css">
  <link rel="stylesheet" href="/pages.css">
  <script src="/glass.js" defer></script>
</head>
<body class="sub" data-page="etlap">
<script src="/shell.js"></script>   <!-- not deferred: the header must exist before first paint -->
<main id="tartalom">…</main>
<script src="/site.js" defer></script>
```

- A page's own CSS goes after `pages.css`.
- `data-page` = the entry's `id` in `NAV`; it sets `aria-current="page"`. Pages outside the nav (pult, admin) get no
  current mark.
- No skip link and no header in the page: `shell.js` adds both.
- English for your own content: add the Hungarian string to `EN` in `i18n.js`, or put `data-en="…"` on the element.

## Navigation (`NAV` at the top of `shell.js`)

| Flag | Phone | Desktop |
|---|---|---|
| `tab: true` (Főoldal, Étlap, Kártya) | own tab | link |
| `extra: true` (Bros After Hours, Bros Delivery) | the **Extrák** tab opens a sheet with one olive photo card each | always a top-level link with the "Új" badge; never folds into "Több" |
| neither (Újdonságok, Játék, Kapcsolat) | in the **Több** sheet, with the language switch | link; folds behind "Több" when the row gets too narrow (and always between 900 and 1120 px) |

- An extra needs `img` (path without extension; `.jpg` and `.webp` exist), `line`, `tease`, `go` (text keys in
  `i18n.js`); `wash` is a Kollázs leftover (its class has no style). The home page's two cards (end of the act) and the
  hero chip show the same products: change them together.
- `isNew: true` shows the badge (header, footer, tab); remove it when the novelty is over.
- `short` = label for the tab bar and the desktop row. `desktop: false` hides an entry from the desktop row.
- Icons: `home cup card game spark pin moon box plus more chevron close`. New one: an SVG path in `ICONS` (24 × 24,
  stroke only).
- Why a combined "Extrák" tab instead of putting the two into "Több": they are visible from every page without
  opening a menu, the bar stays at five tabs on every phone, and the name stays true once they are no longer new.

## View transitions

Cross-document, Chromium and Safari 18.2+; other browsers navigate normally; off under `prefers-reduced-motion`.

Reserved names, do not reuse: `site-header`, `site-tabbar`, `nav-indicator`, `tab-indicator`. Page content is `root`:
the old page stays put under the new one rising in (on espresso pages a blank layer would flash through otherwise).
The root animation only runs for page navigations (type `page-nav`).

Glass and snapshots: a transition snapshots the bars without what is behind them, so while it runs (`html.vt-on`, set
by `glass.js`) they drop their own backdrop filter and their transition groups carry it. Safari (`html.wk`) gets
near-solid bars for those 0.4 s instead. `glass.js` also pauses a playing film for the capture.

A name must be unique on a page at the moment of the transition. Convention:

| Name | For |
|---|---|
| `page-title` | the page's `<h1>` if it should morph |
| `page-hero` | the page's lead photo |
| `item-photo`, `item-title` | the one item being opened; on the destination, its big photo and heading |

- `data-vt="page-hero"` — fixed name, applied on load. After rendering content with JS, call `BROS.shell.vt(root)`.
- `data-vt-click="item-photo"` on (or inside) an `<a>` — named only while that link is followed, so every card in a
  list can carry it. The destination has one element with `data-vt="item-photo"`.
- In use: the photos of the two extras on the home page carry `data-vt-click="page-hero"` and grow into the
  `data-vt="page-hero"` photo of `/after-hours/` and `/delivery/` (and back).
- Same-document change: `BROS.shell.transition(() => { /* change the DOM */ })`.

## `window.BROS.shell`

`nav` · `page` · `icon(name)` · `vt(root)` · `transition(fn)` · `ft(n)` · `esc(s)` · `toast(msg)` · `preview` ·
`guard` · `status()` · `paintStatus()` · `footer()` · `extraNow()` · `sheet(dialog, opts)` · `sheets`.

- `ft(1290)` → "1 290 Ft". The only price format on the site.
- `esc(s)` → HTML-escaped text for template strings. `toast(msg)` → the one toast, gone after 2.6 s.
- `preview` → true on the preview host and local copies; `guard` → true there unless `?live=1` lifted it for the tab
  (the customer forms then send no e-mails).
- `status()` → `{ open, day, text }` in Budapest time. The opening hours live here only.
- `extraNow()` → the `NAV` entry to feature right now: Bros Delivery on weekday mornings (6–11h Budapest time),
  Bros After Hours otherwise.
- `footer()` appends the one footer and keeps every `[data-open-status]` and `[data-day="1 2 3"]` up to date.
- `sheets['extra-sheet'].open()` / `sheets['more-sheet'].open()` open the two nav sheets from anywhere.

## Do

- Use tokens, never raw hex outside `:root`. Keep tap targets ≥ 44 px and body text ≥ 15 px.
- Facts: Mon–Fri 7:30–18:00, Sat 8:30–17:00, Sun closed · 1132 Budapest, Csanády u. 4/b · @broscafe.co.
  After Hours: the whole café, 2–6 people, 14 900 Ft for 2 hours, evenings 18:00–22:00. Delivery: slots 9:00 / 10:30 /
  14:00, free from 5 drinks, 490 Ft below.
- Use the media in `/shared/media/` (see `docs/media-picks.md`); `<picture>` with the `.webp` first.

## Don't

- No second header, hamburger or per-page nav list. No `position: fixed` element at `bottom: 0` on phones.
- No tilts, stickers-as-decoration, ink outlines, hard press edges, marker highlights or pastel washes (that was
  Kollázs). No faux italics, no thin display weights, no film grain, no `/shared/img/*.jpg` (old stock photos).
- No glass over long reading text; no `backdrop-filter` on something that is not floating.
- No looping decorative animation; motion answers a scroll or a touch.
