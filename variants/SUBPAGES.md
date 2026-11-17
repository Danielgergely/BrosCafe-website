# Subpages for each new variant (preview only)

Daniel, 14 Nov: "make sure sub pages, the admin panel and game page also use the selected design." The client must
be able to click through a variant and see every important page in that variant's design, not jump into the old
design (variant A, the real app) after one click.

Everything in `variants/BRIEF.md` still applies (Hungarian, real texts and facts only, own photos, brand, fonts, no
external requests, quality bar, no edits outside your variant folder).

## Pages per variant (`variants/<x>/...`, served at `/<x>/...`)

| Page | Path | Content (from the real app; read the React page named) |
|---|---|---|
| Menu | `/<x>/etlap/` | every active product, grouped like the app (`frontend/src/features/loyalty/pages/MenuPage.jsx`, `config/site.js` SECTION_OF_CAT), prices, photos where the product has one, a product detail view (desc, allergens, milks, sizes) |
| Loyalty | `/<x>/husegkartya/` | how it works (4 steps), the card, sign-up form (email, first name) (`LoyaltyPage.jsx`, i18n `loyalty`, `card`) |
| News | `/<x>/ujdonsagok/` | the journal posts (`WhatsNewPage.jsx`, i18n `news`) |
| Contact | `/<x>/kapcsolat/` | address, hours, map link, contact form (`ContactPage.jsx`, i18n `contact`) |
| Game | `/<x>/jatek/` | the Coffee Runner page: the leaderboard, the weekly prize line, a "play" area (`features/game/GamePage.jsx`, i18n `game`). The game itself may stay the real one: the play button opens `/game` (the real game) or embeds it; the page around it is in the variant's design |
| Staff scanner | `/<x>/pult/` | the counter screen staff use: scan result card (name, stamps, tier, buttons add stamp / redeem / free coffee / adjust), drink picker (`features/staff/pages/ScannerPage.jsx`, i18n `staff`) |
| Admin dashboard | `/<x>/admin/` | the dashboard with its tabs (overview, members, products, journal, live sales, wallet...) (`DashboardPage.jsx`, `features/staff/panels/*`, i18n `admin`) |

## Data
- Public data is live from the same preview, same origin: `GET /api/products`, `/api/whats-new`, `/api/cafe`,
  `/api/game/leaderboard` (and `?period=all`). Use them with fetch, with a sensible loading/empty state. No keys.
- Staff scanner and admin are **design mock-ups** with clearly sample data, because they need a staff login and real
  customer data must not be shown: invent nothing about real people; use obviously sample names ("Minta Anna",
  "Minta Bence"), plausible numbers, and a small "Minta adatok" (sample data) label on the page. Their buttons can
  animate locally but call no API.
- Forms (sign-up, contact) are visual only on these concept pages: on submit show a friendly note that this is a
  preview ("Ez egy előnézet: a valódi oldalon itt…") and do not call the API.

## Navigation
- The variant's own header/nav links to its own subpages; the logo goes back to `/<x>/`. Links inside the home page
  that pointed to the real app (`/menu`, `/loyalty`...) now point to the variant's subpages.
- Shared CSS/JS between a variant's pages lives in the variant folder (e.g. `/<x>/style.css`, `/<x>/site.js`).
- Every page includes `<script src="/preview.js" defer></script>` and the robots meta.

## Check
Each page at 390 and 1280 px, no console errors, no horizontal overflow, the nav works across pages. Serve your own
copy on your own port (copy `variants/shared`, your variant folder and `variants/preview.js`).
