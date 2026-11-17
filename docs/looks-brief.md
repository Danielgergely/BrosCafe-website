# Looks brief: E · Galéria and F · Kirakat

Two premium re-skins of the same site, built in parallel. Owners' feedback on D · Kollázs: "a bit childish". Both looks
are light, warm, grown-up and still friendly; they differ in concept, typeface, surface and motion, not only in colour.

| | **E · Galéria** | **F · Kirakat** |
|---|---|---|
| Idea | a quiet photo book of the café | a bright shop window: glass, light, product scenes |
| Display type | Fraunces, crisp cut, regular weight | Inter, heavy and tight |
| Ground | warm paper white, hairlines, no shadows | brand cream with white rounded tiles, soft depth |
| Corners | square photos, 4 px controls | 28 px tiles, pill controls |
| Chrome | solid paper, hairline | translucent material, floating tab capsule |
| Home motion | reveals and slow photo drift, no pinning on phones | one pinned scrubbed scene, then a bento grid |

## Shared rules (both builders)

- Files: `site/looks/<id>/look.css` (+ `look.js`), home in `site/looks/<id>/index.html` + `home.css` + `home.js`. Nothing
  else changes. Subpage markup, `shell.js`, `NAV`, i18n keys, facts and prices stay as they are.
- Home copy: reuse the Hungarian strings of `site/index.html` and the `NAV` texts (`line`, `go`); any new string gets
  `data-en`. Reuse from `site/home.js`: the panel (`openPanel`: coffee, hours, loyalty views), `/api/products` prices,
  `[data-status]`, `extraNow()`, `BROS.shell.footer()`, and its fallbacks (`?nosda`, `?still`, no-API = plain links).
- New hex values live only in the `:root` block of `look.css`. Text is `--text #322F20`, never black. Olive on
  white/paper and white on olive both pass AA; honey `#C99A3B` is never text.
- Photos: `<picture>` with `.webp` first, `loading="lazy"` below the fold, real `width`/`height`. Video: muted, inline,
  poster, plays only while on screen, at most one playing; still under reduced motion / Save-Data.
- Tap targets ≥ 44 px, body ≥ 15 px, feedback on `:active` within 100 ms, hover only in `@media (hover: hover)`.
- Scroll motion only `transform` + `opacity`, inside `@supports (animation-timeline: view())` and
  `prefers-reduced-motion: no-preference`; nothing transformed at rest. No scroll snapping on the vertical axis.
- Keep the reserved view-transition names and `data-vt-click="page-hero"` on the two extras' photos.
- The Extrák sheet photo of Delivery comes from `NAV` (a dark night shot). Leave it; on the home pages use
  `delivery-iced-cup-hand-over-4x5`.
- Check at 390 × 844 and 1440 × 900, HU and EN, with `?still`, and one subpage of each kind (étlap, kártya, kapcsolat,
  after-hours form, fiók).

---

# E · Galéria

## 1. Concept

The café as a small photo book: large straight photographs on warm white paper, a refined serif, thin rules, a lot of
air. Colour comes from the photos, not from the page. Emotion: calm, confident, "these people care about detail"; the
warmth is in the pictures and the words.

## 2. Tokens

| Token | Value |
|---|---|
| `--paper` (new, = `--bg`, `--surface`) | `#FCFAF5` |
| `--cream` (bands, pressed rows, = `--surface-2`) | `#F5F0E6` |
| `--white` | only form fields and the coffee plates |
| `--accent` / `--accent-text` | `--olive #66734A` / `--olive-deep #3F482C` |
| `--line` / `--line-strong` | `rgb(var(--text-rgb) / .12)` / `.28`, always 1 px |
| `--hl` | `transparent` |
| Radii | photos `0`; `--r-sm 4px` (buttons, fields); `--r-md 4px`; `--r-lg 16px` (sheet top only); `--r-pill` unused |
| Shadows | `--shadow-sm/md: none`; `--shadow-lg: 0 24px 60px rgb(72 62 30 / .14)` (sheets, desktop dialog only) |
| `--edge`, `--press`, `--press-ink` | `1px solid var(--line)`, `none`, `none` |
| Spacing | 8 px base; section padding `72px` phone / `128px` desktop; text block to photo `24px`; `--pad` `20px` phone, `clamp(40px, 6vw, 96px)` desktop; `--max 1240px`, 12 columns, 24 px gutter |
| Header / tab bar | `--header-h` 56 / 72, `--tabbar-h` 60 |

Type. Fraunces everywhere it is used: `font-variation-settings: "opsz" <n>, "SOFT" 0, "WONK" 0` (set `--soft` to
`"SOFT" 0, "WONK" 0`). Inter for the rest.

| Level | Face | Size | Weight | Tracking | Leading | opsz |
|---|---|---|---|---|---|---|
| `.display` | Fraunces | `clamp(40px, 10.5vw, 92px)` | 400 | −0.028em | 1.02 | 144 |
| `.display--md`, `.title--lg` | Fraunces | `clamp(32px, 7.4vw, 60px)` | 400 | −0.022em | 1.06 | 144 |
| `.title` | Fraunces | `clamp(24px, 5.4vw, 34px)` | 440 | −0.015em | 1.14 | 60 |
| item names (cards, rows) | Fraunces | 20–22px | 480 | −0.008em | 1.2 | 24 |
| `.body--lg` | Inter | 18px | 400 | −0.006em | 1.55 | |
| `.body` | Inter | 16px | 400 | 0 | 1.6 | |
| `.fine` | Inter | 13px | 450 | +0.005em | 1.45 | |
| `.eyebrow`, labels | Inter | 11.5px | 600 | +0.14em, uppercase | 1.3 | |
| prices, hours, numbers | Inter | as context | 500 | 0, `tabular-nums` | | |

`<em>` in headings: no marker, no italic; colour `--olive` only. Text measure ≤ 34em. Headings left-aligned.

## 3. Kollázs elements, restyled

- **Washes**: only two grounds. `wash--cream`, `--glow-soft`, `--blush-soft`, `--oat-soft` → `--paper`; `wash--sage`,
  `--sage-mist`, `--blush`, `--glow` → `--cream`. Neighbouring bands of the same ground get a 1 px `--line` between
  them. `.phero`: paper, title left, photo right/below, hairline under it.
- **`.cut`**: no tilt (neutralise whatever consumes `--tilt`, the inline values stay), no white edge, no shadow,
  radius 0; `cut--arch` and `cut--circle` become plain rectangles. Where two cuts overlap (`.phero__pics`), lay them
  side by side with a 12 px gap, the second 32 px lower.
- **`.sticker`**: a caption label, no tilt, no border: `--paper` ground, padding `6px 10px`, eyebrow type, ink text;
  `sticker--olive` = olive ground, white text. Sits flush in a photo corner.
- **`.new`**: text "Új" in eyebrow type, `--olive-deep`, preceded by a 5 px `--honey` dot. No box. `tabbar__new`: the
  5 px honey dot alone.
- **Buttons**: `.btn` 48 px high, radius 4, olive, white Inter 15/560 tracking +0.01em, no shadow; `:active`
  `--olive-dark` + `scale(.98)`. `.btn--ghost`: transparent, 1 px `--line-strong`, ink text; `:active` cream.
  `.btn--light`: paper. `.link`: ink, 1 px underline at 5 px offset, the arrow moves 3 px on hover.
- **Tappable cards** (`.tap`, `.card`, `.pick`, `.item`, `.linkcard`, `.post`, `.tile`): no box. Lists are rows split
  by hairlines, photo left (square corners), a thin `→` right; `:active` cream ground. Photo tiles are a figure: photo,
  then name and one line beneath. `.card`, `.paper` for forms/long text: paper with a 1 px `--line` border, radius 4.
- **Chips**: text tabs. Inter 14/500 `--text-soft`, 44 px hit area; selected = ink + 1.5 px ink underline. No pills.
- **Forms**: label above (13/600), field 52 px, white, 1 px `--line-strong`, radius 4; focus = 2 px olive outline,
  2 px offset. Errors in text below the field.
- **Header**: solid paper, 1 px `--line` below. Nav Inter 14/500 `--text-soft`; current = ink with a 1.5 px ink
  underline (that underline is `nav-indicator`). Language switch as plain text `HU / EN`.
- **Tab bar**: solid paper, 1 px `--line` above, icons 1.5 px stroke, labels 10.5/600. Current = `--olive-deep` icon
  and label with a 20 × 2 px bar at the top edge (`tab-indicator`). No coloured blob behind the icon.
- **Sheets**: paper, top radius 16, `--shadow-lg`, backdrop `rgb(var(--text-rgb) / .28)`, grab bar 36 × 4
  `--line-strong`. Rows: Fraunces 22 names with hairlines; the two extras as figures (photo 3:2, name, line).
- **Footer**: paper, hairline above, the tagline in `.title--lg`, facts in three columns of Inter 14, eyebrow column
  heads, hairline, then the fine print.
- `look.js`: set `<meta name="theme-color">` to `#FCFAF5`.

## 4. Home page (phone 390 first)

About 5 screens plus footer. No pinned sections on phones; the user swipes the coffees sideways.

1. **Hero** (fits `100svh` minus chrome). `h1.display` top left, three short lines. Below it a frame, full width
   inside `--pad`, height `min(52svh, 125vw)`, playing `hero-iced-pour-hands-4x5.mp4` (poster `.jpg`). Under the frame
   one row: the status button (dot + "Nyitva 18:00-ig", opens the **hours panel**) left, `.link` "Étlap →" right. Then
   `.btn` Étlap + `.btn--ghost` Hűségkártya. The `extraNow()` product shows as a text line with the "Új" mark, linking
   to its page.
   Motion: on load the headline lines rise 16 px and fade, 60 ms apart, 500 ms. On scroll the video drifts inside its
   frame (`translateY −4% → 4%`, `scale 1.08`, range `cover 0% cover 100%`).
2. **Tartalom** (index): five numbered hairline rows, 56 px each, `01 Kávék`, `02 Bros After Hours`, `03 Bros Delivery`,
   `04 Hűségkártya`, `05 Nyitvatartás és cím`. Number in eyebrow type, name in Fraunces 22, `→` right. Each jumps to its
   section (`scroll-behavior: smooth`, `scroll-margin-top: var(--header-h)`). This is the "control, not only scroll".
3. **Kávék** `#kavek` (paper, < 1 screen). Head row: `.title--lg` left, `.link` "Teljes étlap →" right. A horizontal
   rail (native scroll, `scroll-snap-type: x mandatory`, no scrollbar) of eight plates, 72vw wide, 16 px gap:
   `coffee-<id>-4x5` on white, below it number `01`–`08` (eyebrow), name (Fraunces 22), price (Inter 15/500). Order as
   now: espresso … matcha-latte. Tap = the **coffee panel** (sheet on phones; desktop dialog with the photo morph).
   Under the rail a 1 px track with a 2 px ink progress line (`animation-timeline: scroll(inline)` on the rail).
   Motion: the rail enters shifted (`translateX 12% → 0`, `entry 0% entry 70%`), which hints sideways.
4. **Extrák** `#extrak` (cream, 1 screen). Eyebrow "Új a Brosnál", then two figures stacked, 40 px apart; each whole
   figure is a link with `data-vt-click="page-hero"` on the photo:
   - After Hours: `after-hours-dining-room-warm-3x2`, then "Új" mark, name (Fraunces 28), `NAV.line`, `.link` `NAV.go`.
   - Delivery: `delivery-iced-cup-hand-over-4x5` cropped 3:2 (`object-position: 50% 40%`), same caption.
   Motion: each photo settles inside its frame (`scale 1.12 → 1`, `entry 0% cover 40%`), caption rises 24 px.
5. **Hűségkártya** `#kartya` (paper, ~0.7 screen). The pass, 78vw, flat olive, radius 12, ten stamps as 1.5 px white
   rings, five filled; tap = the **loyalty panel**. Then `.title` "5 pecsét ajándékba", one sentence, `.btn` "Kérem a
   kártyám". `loyalty-logo-cup-top-1x1` at 96 px square beside the heading.
   Motion: the five filled stamps appear one by one (opacity, scrubbed over `entry 30% cover 45%`).
6. **Látogatás** `#hely` (~0.9 screen). `place-dining-room-daylight-3x2` edge to edge, no text on it. Below: the hours
   as a three-row table (today's row in 600), the address, the status button (hours panel), `.btn` Útvonal ↗ (Google
   Maps link as now), `.link` Kapcsolat. No embedded map.
7. **Teasers**: two hairline rows, 72 px: Újdonságok (`place-bean-shelf-4x5`, 56 px thumb) and Játék
   (`game-brothers-playful-3x2`). Then the footer.

Desktop (≥ 900): hero = headline and index in columns 1–6, bottom aligned; video in columns 8–12, 4:5, 76vh tall.
Kávék: the section is `100vh + 120vh` tall with a sticky stage, the rail moves sideways with the vertical scroll
(four plates visible, plate 280 px); arrow buttons left/right also step it. Extrák: two figures side by side, columns
1–6 and 7–12, photos 4:5 (`after-hours-lounge-evening-4x5`, `delivery-iced-cup-hand-over-4x5`), the second 96 px
lower. Kártya: pass columns 2–6, text 8–11. Látogatás: photo columns 1–8, facts 9–12. Teasers: two columns.

## 5. Motion

- `--ease: cubic-bezier(.22, .61, .36, 1)`; reveals 400–500 ms; `--dur .3s`; `--tap .1s`. No overshoot anywhere.
- Scrubbed animations use `linear`; travel never more than 24 px for text, 12 % for photos.
- Sheets and panels: the shell's critically damped spring, unchanged; they stay draggable and catchable.
- View transitions: page content fades up 12 px (shorter than Kollázs); `page-hero` morph kept.
- Reduced motion / Save-Data: no scroll motion, no video, headline shown at once, rail and panels work, the desktop
  sticky rail becomes a normal horizontal scroll.

## 6. Don'ts

- No tilt, no white photo edges, no stickers as shapes, no ink outlines, no hard-edge buttons, no marker highlight.
- No `"SOFT"` above 0, no `WONK`, no Fraunces weight above 500, no faux italic, no centred headings.
- No coloured washes or tinted cards; no shadows except under sheets; no rounded photos, arches or circles; no pills.
- No text over photos, no emoji, no exclamation-mark headlines, no more than one "Új" mark per item.
- No backdrop blur, no gradients, no dark bands.

---

# F · Kirakat

> **Superseded 2026-11-17:** Daniel replaced this direction with his own mock-ups → **F · Bársony** (espresso #25251C,
> olive #68704B, ivory #F3EBDD, champagne #C6A875, taupe #BDAA96; dark bands for hero/extras, ivory for content; Fraunces
> with real italic). The structure below (pinned scene, extras, grid) was kept; the visual rules were not.

## 1. Concept

The café seen through a clean shop window: a bright cream ground, white rounded tiles, translucent floating chrome, and
one cinematic scroll scene where the cups glide past and the two new services arrive. Built like a good product page.
Emotion: fresh, modern, a bit of "wow", friendly because of the soft light and the round tiles, never toy-like.

## 2. Tokens

| Token | Value |
|---|---|
| `--bg` | `--cream #F5F0E6` |
| `--surface` (tiles) / `--surface-2` | `#FFFFFF` / `#EDE6D7` |
| Tile tints (new, replace the washes) | `--sage-tint #EEF1E8`, `--blush-tint #F8EDEA`, `--glow-tint #FCF4E2`, `--oat-tint #F6EEE2` |
| `--accent` / `--accent-text` | `--olive` / `--olive-deep` |
| `--fill` (new: quiet control ground) | `rgb(var(--text-rgb) / .06)`; pressed `.1` |
| `--line` | `rgb(var(--text-rgb) / .08)` (rare; depth separates, not lines) |
| Material (new) | `--glass: rgb(var(--cream-rgb) / .72)`; `--glass-white: rgb(255 255 255 / .72)`; `--glass-thick: rgb(252 250 245 / .88)`; `--blur: blur(20px) saturate(180%)`; `--glass-edge: inset 0 1px 0 rgb(255 255 255 / .6)` |
| Radii | `--r-sm 14px` (fields, small thumbs), `--r-md 20px` (cards), `--r-lg 28px` (tiles, photos; 36 px on desktop hero), `--r-pill` (buttons, chips, capsules) |
| Shadows | `--shadow-sm: 0 1px 2px rgb(72 62 30 / .05), 0 6px 20px rgb(72 62 30 / .06)`; `--shadow-md: 0 2px 8px rgb(72 62 30 / .06), 0 18px 44px rgb(72 62 30 / .10)`; `--shadow-lg: 0 8px 20px rgb(72 62 30 / .08), 0 40px 80px rgb(72 62 30 / .16)` |
| `--edge`, `--press`, `--press-ink`, `--hl` | `0`, `none`, `none`, `transparent` |
| Spacing | 4 px base; tile gap 12 phone / 20 desktop; tile padding 20 / 32; section gap 56 / 120; `--pad` `16px` phone, `clamp(32px, 5vw, 80px)` desktop; `--max 1200px` |
| Header / tab bar | `--header-h` 52 / 60; `--tabbar-h: 78px` (60 px capsule + 8 px below + 10 px above) |

Type: **Inter only** (set `--serif` to the Inter stack; Fraunces is not used in this look).

| Level | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| `.display` | `clamp(42px, 11.5vw, 96px)` | 680 | −0.042em | 1.0 |
| `.display--md`, `.title--lg` | `clamp(32px, 8vw, 64px)` | 660 | −0.036em | 1.04 |
| `.title` | `clamp(23px, 5.6vw, 32px)` | 640 | −0.024em | 1.12 |
| item names | 19px | 620 | −0.016em | 1.2 |
| `.body--lg` | 19px | 420 | −0.014em | 1.42 |
| `.body` | 17px | 400 | −0.011em | 1.5 |
| `.fine` | 13px | 450 | 0 | 1.4 |
| `.eyebrow`, labels | 14px, sentence case, `--olive-deep` | 620 | 0 | 1.3 |
| numbers | `tabular-nums` | 600 | | |

`<em>` in headings: colour `--olive`, nothing else. Display headings centred on the home hero, left elsewhere. On glass,
text is ink at weight +40 and tracking +0.005em; never grey text on a material.

## 3. Kollázs elements, restyled

- **Washes**: a full-width band (`.scene`, `.phero`, `.sec`) drops its colour and sits on cream. A `.wash` that is a
  card or a tile takes a tint: sage / sage-mist → `--sage-tint`, blush / blush-soft → `--blush-tint`, glow / glow-soft
  → `--glow-tint`, oat-soft → `--oat-tint`, cream → white; radius 28, no border. `.phero`: one white tile (radius 28,
  `--shadow-sm`) holding the title and the photo.
- **`.cut`**: no tilt, no white edge; radius 28 (14 px when the photo is under 160 px), `--shadow-md`,
  `overflow: hidden`. `cut--arch` = the same rounded rectangle; `cut--circle` stays a circle. Overlapping pairs: side
  by side, 12 px gap, no offset.
- **`.sticker`**: a glass capsule on photos: `--glass-white` + `--blur`, `--glass-edge`, pill, Inter 13/620 ink,
  padding `7px 12px`, no tilt, no border. Off a photo (on a tile) it is a `--fill` capsule. `sticker--olive`: solid
  olive, white text.
- **`.new`**: olive pill, white Inter 11/650, padding `2px 7px`. `tabbar__new`: an 8 px olive dot with a 2 px white
  ring.
- **Buttons**: `.btn` pill, 50 px, olive, white Inter 16/620 −0.01em, no shadow; `:active` `scale(.97)` +
  `--olive-dark`. `.btn--ghost`: `rgb(var(--olive-rgb) / .12)` ground, `--olive-deep` text. `.btn--light`: white,
  `--shadow-sm`. `.link`: `--olive-deep` 620 with a `›` chevron, no underline.
- **Tappable cards**: white tile, radius 20 (28 for photo tiles), `--shadow-sm`, no border; `:active` `scale(.98)`;
  hover lifts 2 px to `--shadow-md`. Lists (`.sheet__list`, `.item`, `.mrow`) are grouped: one white tile, rows inside
  split by an inset `--line`, chevron `›` right. Non-tappable text blocks sit directly on cream, no tile.
- **Chips**: pill, 36 px (44 px hit), `--fill`, Inter 14/560; selected = olive ground, white text. A `.seg`/`.tabs`
  group is a segmented control: `--fill` track, white selected thumb with `--shadow-sm`.
- **Forms**: field 52 px, `--fill` ground, radius 14, no border; focus = white ground + 2 px olive ring + 4 px
  `rgb(var(--olive-rgb) / .2)` halo. Labels 14/620 above. Form sections grouped in a white tile, radius 20.
- **Header**: material: `--glass` + `--blur`, no bottom line; content scrolls under it. Nav Inter 14/560; current =
  ink on a `--fill` pill (`nav-indicator` is that pill). Language switch = small segmented control.
- **Tab bar**: a floating glass capsule: `left/right 12px`, `bottom: calc(var(--safe-b) + 8px)`, height 60, radius 30,
  `--glass-white` + `blur(24px) saturate(180%)`, `--shadow-md`, `--glass-edge`. Current = `--olive-deep` icon and label
  on a `rgb(var(--olive-rgb) / .14)` pill (`tab-indicator`). Labels 10.5/620.
- **Sheets**: `--glass-thick` + `blur(30px)`, top radius 34, `--shadow-lg`, backdrop `rgb(var(--text-rgb) / .22)`,
  grab bar 36 × 5 `rgb(var(--text-rgb) / .22)`. Inside, the two extras are photo tiles (radius 22) with a glass caption
  bar; the "Több" list is one grouped white tile. Never glass on glass: tiles inside a sheet are solid.
- **Footer**: `--surface-2` ground, radius `28px 28px 0 0`, Inter 13 `--text-soft`, link columns, hours and status in
  one white tile.
- **`look.js`**: (a) view transitions snapshot the chrome without its backdrop, so on `pageswap` and until the
  `pagereveal` transition has finished add `html.vt-solid`, which swaps header and tab bar to opaque cream / white with
  no `backdrop-filter`; (b) nothing else.
- `@media (prefers-reduced-transparency: reduce)`: all materials opaque, no blur. `@media (prefers-contrast: more)`:
  opaque plus a 1 px `--line-strong` border on chrome, tiles and fields.

## 4. Home page (phone 390 first)

Three parts: hero, one pinned act, one bento grid. About 5.4 screens of scroll plus footer; the act has a control to
skip its stops.

1. **Hero** (`100svh` minus chrome). Centred: `h1.display` (two lines), one `.body--lg` line, `.btn` Étlap +
   `.btn--ghost` Hűségkártya. Under them the **window**: `hero-iced-pour-hands-9x16.mp4` (poster) in a radius 28 frame,
   width `100% − 32px`, starting ~58svh from the top and running past the fold. On the window, two glass capsules:
   bottom left the status (dot + "Nyitva 18:00-ig" → **hours panel**), bottom right the `extraNow()` product with the
   "Új" pill (→ its page).
   Motion (the hero's exit, `exit 0% exit 100%`): the window rises and grows (`translateY 0 → −22svh`,
   `scale .92 → 1`), the headline block fades and lifts (`opacity 1 → 0`, `−24px`) in the first 40 %.
2. **The act** `#kavek`, `data-stops="Kávék|Extrák"`: a sticky stage (`100svh` minus chrome) scrubbed for
   `--scrub: 2.2` further screens.
   - Stop "Kávék" (0–62 %): small `.title` top left, `.link` "Teljes étlap ›" top right. A track of eight white tiles
     (64vw wide, radius 28, `coffee-<id>-4x5` filling the top, name 19/620 and price below) moves sideways from the
     first to the last (`translateX`). The tile at the centre is `scale(1)`, the others `scale(.9)` at 60 % opacity
     (per-tile keyframes on the same timeline, offset by index, as the wheel's `--a`/`--b` pairs do now). Tap a tile =
     the **coffee panel**.
   - Change (62–72 %): the track sinks (`translateY 30%`, fades out); the title cross-fades to "Új a Brosnál".
   - Stop "Extrák" (68–90 %, hold to 100 %): two photo tiles stacked, each ~40 % of the stage, radius 28: After Hours
     (`after-hours-lounge-evening-4x5`, `object-position` on the signs and sofa) comes from the left
     (`translateX −40% → 0`), Delivery (`delivery-iced-cup-hand-over-4x5`) from the right. Each has a glass caption bar
     at its bottom: "Új" pill, name 19/620, `NAV.line`, `›`. Whole tile = link, photo carries
     `data-vt-click="page-hero"`.
   - Control: a glass segmented capsule at the bottom centre of the stage, "Kávék | Extrák"; it shows the current stop
     and a tap scrolls to that stop (smooth). So nobody has to scrub through eight cups to reach the extras.
   - `?still` / reduced motion / no support: the stage is not sticky; the cups are a native swipe rail with snap, the
     two extras follow as normal tiles.
3. **Bento** `#hely`: `.title--lg` "Gyere be", then a 2-column grid, gap 12, every tile radius 28 and tappable:
   - **Kártya** (2 columns, 220 px, solid olive, white text): mini pass with ten dots, five filled white; "5 pecsét
     ajándékba" 23/640; `.btn--light` "Kérem a kártyám" → `/husegkartya/`; the rest of the tile → **loyalty panel**.
     `loyalty-logo-cup-top-1x1` as a 72 px circle top right.
   - **Nyitvatartás** (1 column, 170 px, white): status dot, "Nyitva 18:00-ig" 23/640, today's hours → **hours panel**.
   - **Cím** (1 column, 170 px): `contact-shopfront-day-4x5` with a glass caption "Csanády u. 4/b ↗" → Google Maps.
   - **A hely** (2 columns, 16:9): `place-serving-table-16x9.mp4` (poster; the brothers serving = life), glass caption
     "Kapcsolat ›" → `/kapcsolat/`.
   - **Újdonságok** (1 column, 190 px, `--sage-tint`): `place-bean-shelf-4x5` thumb (radius 14) + name →
     `/ujdonsagok/`.
   - **Játék** (1 column, 190 px, `--glow-tint`): `game-brothers-playful-3x2` thumb + name → `/jatek/`.
   Motion: each tile rises as it enters (`translateY 32px → 0`, `scale .96 → 1`, opacity, `entry 0% entry 60%`), the
   right column 8 % later than the left.

Desktop (≥ 900): hero is a split, headline left-aligned in columns 1–6, the window right in columns 7–12 with
`hero-iced-pour-hands-4x5.mp4`, 78vh, radius 36 (never 16:9, never full-bleed); scroll: window `scale .94 → 1`, text
`−40px`. Act: `--scrub: 1.8`, four tiles of 280 px visible; the extras side by side, 3:2
(`after-hours-dining-room-warm-3x2`, delivery cropped 3:2). Bento: 4 columns, gap 20: Kártya 2 × 2, Nyitvatartás
1 × 1, Cím 1 × 1, A hely 2 × 1, Újdonságok 1 × 1, Játék 1 × 1 (a clean rectangle, max 1200 px).

## 5. Motion

- `--ease: cubic-bezier(.32, .72, 0, 1)`; `--dur .35s`; press `.1s`; hover lift `.2s`. Scrubbed keyframes `linear`.
- Sheets, panels: the shell spring, critically damped; on open the backdrop and the sheet's blur arrive together.
  A flicked sheet may overshoot slightly (only after a real flick), nothing else bounces.
- The stops control and all tiles respond on pointer-down; the act can be scrolled back at any point (it is scrubbed,
  never a timed animation).
- View transitions: `page-hero` morph kept; root cross-fade with a 16 px rise; `html.vt-solid` during the transition.
- Reduced motion / Save-Data: no scrub, no pinning, no video, tiles simply visible, capsules and panels work.

## 6. Don'ts

- No tilt, no white photo edges, no ink outlines, no hard-edge buttons, no marker highlight, no paper textures.
- No Fraunces, no uppercase tracked labels, no thin weights under 400, no display weight above 700.
- No saturated washes: tints only on tiles, at most one tinted tile per row; no rainbow of colours in one screen.
- No glass on glass, no glass over plain cream where nothing scrolls beneath (use a solid tile), no grey text on glass.
- No bounce on anything that was not flicked, no looping decoration, no parallax on text, no gradients or glows,
  no dark bands, no emoji, no drop shadows darker than the tokens above.

---

## Summary for Daniel

- **E · Galéria**: a calm photo book. Big straight photos, an elegant thin serif, fine lines, almost no colour on the
  page; you swipe the coffees sideways and jump around with a numbered contents list.
- **F · Kirakat**: a bright "product page". Round white tiles on cream, frosted-glass menu bars, and one fancy scroll
  scene where the cups glide past and After Hours + Delivery slide in, then everything else in one tappable grid.
- Both drop what read as childish: tilted photos, stickers, outlines, marker highlights, the round soft lettering.
- Both keep every page and function, the same header and phone tab bar, the same photos and facts; home is ~5 screens.
- E is the safer, timeless one; F is the "fancier" one and needs a little more care (the glass bars during page changes).
