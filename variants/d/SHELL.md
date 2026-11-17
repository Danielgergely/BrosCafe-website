# D · Kollázs — the shell and the design language

A café scrapbook: sheets of coloured paper, photos cut out and laid on them at a slight tilt, big round serif type,
ink-outlined stickers and buttons that go down when pressed. Warm and bright; never dark, never a template grid of
soft-shadow cards.

| File | What |
|---|---|
| `shell.css` | fonts, tokens, reset, type, buttons, cards, the collage kit (washes, cut photos, stickers), header, tab bar, sheets, footer, view transitions. Loaded first on every page. |
| `shell.js` | the nav config (`NAV`) and everything built from it; sheet physics; `window.BROS.shell`. First thing in `<body>`. |
| `pages.css` | subpage components in the same language: `.phero` (page head on a wash with a cut photo), `.paper`, `.tap`, `.chip`, `.fold`, forms, and each page's own blocks. |
| `site.js` | subpage logic; calls `BROS.shell.footer()`. |
| `style.css` + `home.js` | **home only**: hero, the pinned act (cups → the two extras), the visit; scroll-driven motion, panels; loaded after `shell.css`. |

Media: `docs/media-picks.md` says which photo or clip goes where (`/shared/media/…`, every photo also as `.webp`).

## Tokens (`:root` in `shell.css`)

| Group | Tokens |
|---|---|
| Brand | `--olive #66734A` · `--cream #F5F0E6` · `--white` |
| Olive shades | `--olive-dark` (hover) · `--olive-deep` (small olive text, button edge) · `--olive-soft` · `--olive-tint` · `--olive-rgb` |
| Cream shades | `--cream-2` · `--cream-3` · `--cream-rgb` |
| Café accents | `--sage` · `--sage-mist` · `--blush` · `--oat` · `--glow` · `--honey` · `--dove`, and the paler `--sage-light` · `--blush-soft` · `--glow-soft` · `--oat-soft` (computed from them). **Pending the brothers' approval**: the hex values exist only in that one block, never write them anywhere else. |
| Text | `--text #322F20` · `--text-soft` · `--text-faint` · `--text-rgb` |
| Roles | `--bg` · `--surface` · `--surface-2` · `--accent` · `--accent-text` · `--on-accent` · `--line` · `--line-strong` · `--hl` (the marker colour behind `<em>`) |
| Type | `--serif` (Fraunces) · `--sans` (Inter) · `--soft` (Fraunces' round cut) |
| Shape, depth | `--r-sm 12` · `--r-md 18` · `--r-lg 28` · `--r-pill` · `--shadow-sm/md/lg` (warm, for photos and floating panels) · `--edge` (1.5 px ink outline) · `--press` / `--press-ink` (the hard edge under a button / a card) |
| Layout | `--pad` · `--max 1240px` · `--header-h` (56 phone / 68 desktop) · `--tabbar-h` (64 / 0) · `--safe-b` · `--bottom-h` |
| Motion | `--ease` · `--dur .3s` · `--tap .1s` |

Alpha colours: `rgb(var(--text-rgb) / .14)`. On a coloured wash, small olive text uses `--accent-text` (the wash classes
already darken it).

## The look, as rules

1. **Colour = washes.** A section or a card sits on one wash: `class="wash wash--sage"` (also `--sage-mist`, `--blush`,
   `--blush-soft`, `--glow`, `--glow-soft`, `--oat-soft`, `--cream`). The class sets `--wash`, the matching marker
   colour and text contrast. One wash per band; neighbours differ. Cream stays the page ground, white is for cards and
   chips, olive only for buttons, the pass and "current" marks.
2. **Type.** Headings are Fraunces, weight 540–640, with `font-variation-settings: "opsz" <size>, var(--soft)`, tight
   (`letter-spacing: -.02em … -.035em`, `line-height` ≤ 1.05). Never the old thin 300 weight. Emphasis is `<em>` inside
   `.display` / `.title`: a marker stroke in `--hl`, **not italics** (no italic cut is shipped; a faux italic looks
   cheap). Inter for everything else; labels are 700, uppercase, `.16em`.
3. **Photos are cut out.** `<span class="cut" style="--tilt: -2deg"><picture>…</picture></span>`: white paper edge,
   warm shadow, 1–4° tilt; `cut--arch`, `cut--circle` for shape. Give it a size (height or `aspect-ratio`); the image
   fills it. Two overlapping cuts with opposite tilts beat one big rectangle. No full-bleed photo backgrounds, no blur.
4. **Stickers.** `.sticker` (+ `--white`, `--blush`, `--sage`, `--olive`; `--tilt`) for a label laid on a photo or a
   card corner; `.new` for the small "Új" badge. Max two per screen.
5. **Tappable things have an ink outline and a hard edge**, and go down on press: border `var(--edge)`,
   `box-shadow: var(--press-ink)`, `:active { translate: 0 3px; box-shadow: 0 0 0 transparent; transition-duration: var(--tap) }`.
   `.btn` does this already. Things that are not tappable have no outline (soft shadow or nothing).
6. **Chrome is drawn in ink**: header, tab bar, sheets and footer are separated by a 1.5 px `--text` line, not by
   shadows.

## Components

- **Type**: `.eyebrow`, `.display` (`--md`), `.title` (`--lg`), `.body` (`--lg`), `.fine`.
- **Buttons**: `.btn` (olive), `.btn--ghost` (white, olive text), `.btn--light` (white, ink), `.link`, `.actions`.
- **Cards**: `.card`, `.card--flat`, `.card--tint`, `.card--media` (yesterday's soft cards; fine for forms and long
  text, prefer a wash + `--edge` for anything tappable).
- **Collage kit**: `.wash--*`, `.cut`, `.sticker`, `.new` (above).
- **Text over a photo**: `.scrim` / `.scrim--soft`. Rarely needed now: put text beside the cut photo instead.
- **Layout**: `.wrap`, `.visually-hidden`.
- **Header** `.site-header`, **tab bar** `.tabbar`, **sheets** `dialog.sheet`: generated by `shell.js`, never by hand.

`body` has `padding-top: var(--header-h)` and `padding-bottom: var(--bottom-h)`. Sticky things use
`top: var(--header-h)`; fixed things at the bottom use `bottom: calc(var(--bottom-h) + …)`.

## Motion

- **Press feedback is instant**: every tappable element changes on `:active` within `--tap` (scale .96–.98, or the
  hard edge going down). Hover effects only inside `@media (hover: hover)`.
- **Sheets are physical** (`BROS.shell.sheet(dialog, { wide, hide })`): below `wide` (default 900 px) the dialog
  rises on a critically damped spring, follows the finger 1:1 on its `.sheet__grab`, resists past the top, and on
  release goes where the flick was heading (closes or springs back with the finger's velocity). It can be caught
  mid-flight. Any bottom sheet on a subpage should use it: give the dialog a `.sheet__grab` as first child and call
  `ctl.open()` / `ctl.close()` instead of `showModal()` / `close()`. No spring library: ~40 lines in `shell.js`.
- **Scroll-driven motion (home)**: three scenes, no scroll snapping. `data-m` = an entry and an exit animation tied to
  its scene's view timeline. `data-s` = scrubbed while the act (`.act`, `#kavek`) is pinned: the stage is `sticky` for
  `--scrub` screens of scroll; the cups sit on a wheel (`--cw` card width, `--R` radius, `--step` angle) that the scroll
  turns, then the wheel sinks, the paper turns blush and the two extras come in from the sides. Timings are the
  `--a` / `--b` pairs in the "motion" block at the end of `style.css`. Where scroll-driven animations are missing,
  `home.js` writes `--pin` / `--pout` / `--p` and the same keyframes are scrubbed through `animation-delay`
  (test with `?nosda`; `?still` = the plain layout). To reuse on a subpage keep it small: one
  `animation-timeline: view()` reveal per section (`from { opacity: 0; transform: translateY(40px) }`,
  `animation-range: entry 10% entry 80%`), inside `@supports (animation-timeline: view())` and
  `@media (prefers-reduced-motion: no-preference)`. Only `transform` and `opacity`. At rest nothing is transformed
  except a `.cut` / `.sticker` tilt.
- **Reduced motion / Save-Data**: no scroll motion, no video (the still shows), sheets and panels open without
  travel, view transitions off. Everything stays usable.
- **Page to page**: cross-document view transitions (below).

## Add a page

```html
<head>
  …charset, viewport, <meta name="robots" content="noindex,nofollow">, title, description…
  <meta name="theme-color" content="#F5F0E6">
  <link rel="preload" href="/shared/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/fraunces-latin-ext-full-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/shared/fonts/inter-latin-ext-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="expect" href="#site-header" blocking="render">
  <script src="/d/i18n.js"></script>
  <link rel="stylesheet" href="/d/shell.css">
  <link rel="stylesheet" href="/d/pages.css">
</head>
<body class="sub" data-page="etlap">
<script src="/d/shell.js"></script>   <!-- not deferred: the header must exist before first paint -->
<main id="tartalom">…</main>
<script src="/d/site.js" defer></script>
```

- `data-page` = the entry's `id` in `NAV`; it sets `aria-current="page"`. Pages outside the nav (pult, admin) get no
  current mark.
- No skip link and no header in the page: `shell.js` adds both.
- English for your own content: add the Hungarian string to `EN` in `i18n.js`, or put `data-en="…"` on the element.

## Navigation (`NAV` at the top of `shell.js`)

| Flag | Phone | Desktop |
|---|---|---|
| `tab: true` (Főoldal, Étlap, Kártya) | own tab | link |
| `extra: true` (Bros After Hours, Bros Delivery) | the **Extrák** tab opens a sheet with one big photo card each | always a top-level link with the "Új" badge; never folds into "Több" |
| neither (Újdonságok, Játék, Kapcsolat) | in the **Több** sheet, with the language switch | link; folds behind "Több" when the row gets too narrow |

- An extra needs `img` (path without extension; `.jpg` and `.webp` exist), `wash`, `line`, `tease`, `go` (text keys in
  `i18n.js`). The home page's two cards (end of the act) and the hero chip show the same products: change them together.
- `isNew: true` shows the badge (header, footer, tab); remove it when the novelty is over.
- `short` = label for the tab bar and the desktop row. `desktop: false` hides an entry from the desktop row.
- Icons: `home cup card game spark pin moon box plus more chevron close`. New one: an SVG path in `ICONS` (24 × 24,
  stroke only).
- Why a combined "Extrák" tab instead of putting the two into "Több": they are visible from every page without
  opening a menu, the bar stays at five tabs on every phone, and the name stays true once they are no longer new.

## View transitions

Cross-document, Chromium and Safari 18.2+; other browsers navigate normally; off under `prefers-reduced-motion`.

Reserved names, do not reuse: `site-header`, `site-tabbar`, `nav-indicator`, `tab-indicator`. Page content is `root`:
old page fades up and out, new one rises in. The root animation only runs for page navigations (type `page-nav`).

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
  `data-vt="page-hero"` photo of `/d/after-hours/` and `/d/delivery/` (and back).
- Same-document change: `BROS.shell.transition(() => { /* change the DOM */ })`.

## `window.BROS.shell`

`nav` · `page` · `icon(name)` · `vt(root)` · `transition(fn)` · `ft(n)` · `status()` · `paintStatus()` · `footer()` ·
`extraNow()` · `sheet(dialog, opts)` · `sheets`.

- `ft(1290)` → "1 290 Ft". The only price format on the site.
- `status()` → `{ open, day, text }` in Budapest time. The opening hours live here only.
- `extraNow()` → the `NAV` entry to feature right now: Bros Delivery on weekday mornings (6–11h Budapest time),
  Bros After Hours otherwise.
- `footer()` appends the one footer and keeps every `[data-open-status]` and `[data-day="1 2 3"]` up to date.
- `sheets['extra-sheet'].open()` / `sheets['more-sheet'].open()` open the two nav sheets from anywhere.

## Do

- Use tokens, never raw hex. Keep tap targets ≥ 44 px and body text ≥ 15 px.
- Facts: Mon–Fri 7:30–18:00, Sat 8:30–17:00, Sun closed · 1132 Budapest, Csanády u. 4/b · @broscafe.co.
  After Hours: the whole café, 2–6 people, 14 900 Ft for 2 hours, evenings 18:00–22:00. Delivery: slots 9:00 / 10:30 /
  14:00, free from 5 drinks, 490 Ft below.
- Use the media in `/shared/media/` (see `docs/media-picks.md`); `<picture>` with the `.webp` first.

## Don't

- No dark grounds, black scrims, film grain, vignette, blurred photo backgrounds.
- No second header, hamburger or per-page nav list. No `position: fixed` element at `bottom: 0` on phones.
- No `backdrop-filter` or transparency on the header / tab bar: they are snapshotted during view transitions and
  would flicker. (This is why the chrome is solid with an ink line rather than frosted.)
- No faux italics, no thin display weights, no `/shared/img/*.jpg` (old stock photos), no `team-silly.jpg`.
- No looping decorative animation; motion answers a scroll or a touch.

## Preview-only bits

