# Bros Cafe: design variants (preview only)

Grace Labs is showing the client (the three brothers who own Bros Cafe, Budapest) design directions for their site.
The preview is `https://broscafe.gracelabs.dev`:

| Address | Variant | What it is |
|---|---|---|
| `/` | **A · Mai** | the current site (the real React app, unchanged) |
| `/b/` | **B · Napló** | editorial magazine, calm morning |
| `/c/` | **C · Pult** | the counter's menu board, bold and quick |
| `/d/` | **D · Mesekönyv** | a playful 3D storybook, not a café website at all |

B, C and D are **homepage concepts**: one long page each, as polished as a real launch. Links to deeper pages go
to the real app's routes on the same preview (`/menu`, `/loyalty`, `/news`, `/contact`, `/game`), which exist.

## Shared rules
- **Language: Hungarian**, the site's default. Use the site's own texts from `frontend/src/i18n/hu.js` (sections
  `hero`, `home`, `loyalty`, `footer`, `contact`) and the same texts in every variant where they cover the same
  thing, so the client compares design, not wording. Short new headings/captions are fine if needed; mark nothing as
  a fact that isn't in the site's texts. **Never invent** prices, opening hours, awards, reviews or history.
- **Facts**: address 1132 Budapest, Csanády u. 4/b; hours Mon–Fri 7:30–18:00, Sat 8:30–17:00, Sun closed;
  email hello@broscafe.hu; Instagram @broscafe.co; loyalty: 10 stamps = a free coffee, 5 stamps on sign-up.
  Menu items and prices (HUF): `backend/data/catalog.json` (`price_huf`, `name.hu`, `desc.hu`, `cat`); use
  real items only.
- **Brand**: olive `#66734A`, cream `#F5F0E6`, white (`src/config/palette.js`). Variants may use them very
  differently (dark olive grounds, cream paper, white space), plus near-black for text, but no new brand colours.
  Logos: `variants/shared/img/logo-full-olive.png`, `logo-full-cream.png`, `mark-olive.png`, `mark-cream.png`.
- **Photos and video: use Bros Cafe's own shoot** (Daniel, 14 Nov: "make sure to use our images", "make the
  website more living with these images"). `variants/shared/photos/*.jpg` (33 web-ready shots, served at
  `/shared/photos/<name>.jpg`): every drink and pastry on a clean backdrop (americano, cappuccino, cortado,
  flat-white, latte, espresso, espresso-macchiato, espresso-tonic, caramel-latte, pistachio-latte,
  pumpkin-spice-latte, matcha-latte, matcha-latte-2, mango-matcha, mango-smoothie, mixed-berry-smoothie,
  belgian-hot-chocolate, brownie-sundae, chocolate-cookie, chocolate-muffin, cranberry-oat-cookie, mango-chia-pudding,
  nutella-waffle, pesto-sandwich, pistachio-croissant, prosciutto-croissant, triple-cheese-sandwich), the room
  (interior-1, interior-2), the shopfront (shopfront), and the three brothers in aprons (team-1, team-2, team-silly).
  Video (silent loops from the café's own reel, 720×1280 vertical, ~1 MB each, poster .jpg beside them):
  `/shared/video/bar.mp4` (barista at the espresso machine behind the counter) and `/shared/video/serving.mp4`
  (plates being carried to a table). Use `<video autoplay muted loop playsinline preload="metadata" poster=...>`,
  paused under `prefers-reduced-motion`. The old stock-looking shots in `variants/shared/img/*.jpg` are retired: do
  not use them (the logos in that folder stay). Each variant should feel lived-in: the people, the room, the
  street front and real drinks, not only objects. Do not name who is who in the team photos.
- **Fonts**: self-hosted only (`variants/shared/fonts`: Fraunces variable serif, Inter variable sans). No Google
  Fonts, no CDNs, no external requests of any kind (no analytics, no external scripts). Vendored libraries go into
  the variant's own folder.
- **Files**: `variants/<x>/index.html` plus assets in `variants/<x>/`. Paths absolute from the site root
  (`/b/style.css`, `/shared/img/...`: the deploy copies `variants/shared` to `/shared/`). Include
  `<script src="/preview.js" defer></script>` (the variant switcher, provided) and `<meta name="robots"
  content="noindex,nofollow">`.
- **Quality bar**: works at 390 px and 1280+ px, no horizontal overflow, readable contrast, real keyboard focus,
  `prefers-reduced-motion` respected (animations off or calm), images lazy below the fold, fast (keep the page under
  ~2.5 MB on first load excluding D's 3D library). Check in a browser with agent-browser (`agent-browser skills get
  core` first): screenshots at 390 and 1280, scroll through, no console errors.
- **Local preview**: from the repo root run `python3 -m http.server 8090 --directory variants/_serve` after
  `rm -rf variants/_serve && mkdir -p variants/_serve && cp -R variants/shared variants/_serve/shared && cp -R variants/<x> variants/_serve/<x> && cp variants/preview.js variants/_serve/`
  then open `http://127.0.0.1:8090/<x>/`. Links to `/menu` etc. will 404 locally; that is fine.
- Do not touch `frontend/`, `backend/`, `worker/`, or other variants' folders. No git commands. No test files.

## Renamed 14 Nov (Daniel: "use abcd")
`/b/` = **B · Pult** (was C), `/c/` = **C · Mesekönyv** (was D), `/d/` = **D · Mozi** (was E). B Napló was dropped.
Folders and internal links are already renamed; use the new paths.

## Language switch (Daniel, 14 Nov: every page needs one, like variant A)
- A visible HU / EN switch on every page of the variant (header, and the mobile menu), styled in the variant's own
  language. Hungarian is the default.
- The choice is stored exactly like the real app: `localStorage` key `bros-lang`, value `hu` or `en` (so the choice
  carries across variants and into A). Read it on load; `?lang=en` / `?lang=hu` in the URL also sets it. Set
  `<html lang>` accordingly. Wrap storage access in try/catch.
- English texts come from `frontend/src/i18n/en.js` (same keys as `hu.js`), so wording matches the real app. For
  texts that have no counterpart there, write natural English; never invent facts.
- Live data has both languages: products `name.en`/`desc.en`, journal posts `title.en`/`blurb.en`/`body.en`. Prices
  and numbers stay as they are (Ft); format dates per language.
- Everything switches without a full reload where practical (or reloads cleanly), including titles, alt texts,
  aria labels, button texts, the sample-data mock-ups and the fallbacks. 3D/canvas text must switch too.
