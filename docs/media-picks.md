# Media picks — variant D

Status: **v2 (final)** — every file named below exists. Photos are JPEG + WebP (same name), max 2000 px, metadata stripped. Videos are silent H.264, faststart, 1.1–1.7 MB, 7–10 s; each has a poster `.jpg` = its first frame.
All files: `site/shared/media/` → served as `/shared/media/...`. Photos also as `.webp` (same name).
Suffix = aspect ratio (`3x2` landscape, `4x5` / `2x3` / `9x16` portrait, `1x1` square).

## Palette (sampled from the dining-room, counter and cup photos, lifted a little for softness)

| Token | Hex | Where it comes from |
|---|---|---|
| `--sage` | `#A8B39A` | the wall paint in daylight (dining room) |
| `--sage-mist` | `#DDE3D3` | same wall, lightened — section backgrounds |
| `--blush` | `#E3C4BC` | pink velvet chairs and the round sofa cushions |
| `--oat` | `#DCC09A` | table tops and the counter wood |
| `--glow` | `#F4DDB0` | warm halo of the bulbs on the wall |
| `--honey` | `#C99A3B` | ochre rim of the cups/saucers, mango in the matcha (accent, small doses) |
| `--dove` | `#B4BCC4` | grey-blue velvet chairs and sofa |

Sits with brand olive `#66734A` (= the aprons), cream `#F5F0E6`, white. No black/charcoal blocks: darkest tone should be the olive.
Note: the repo's CLAUDE.md says the palette is strictly olive/cream/white — these are a proposal for Daniel/the brothers to approve, as tints and accents only.

## Slots

### 1. Hero
- **First:** `hero-iced-pour-hands-9x16.mp4` + poster `.jpg` (phones), `hero-iced-pour-hands-4x5.mp4` + poster (desktop, in a framed column beside the headline)
  - HU: „Három kéz jeges lattét készít a zsályazöld fal mögül a BrosCaféban" / EN: "Three hands build an iced latte from behind the sage wall at BrosCafé"
  - Why: the only clip that is bright, funny, clearly this café (wall, lamps, lounge) and has no faces or captions.
  - **16:9 does not work** (tested: the hands are stacked vertically, a landscape crop loses the cup). Desktop: use the 4:5 clip in a split layout, not full-bleed.
  - It is an iced latte, not latte art or a hot pour — no such clip exists yet (shot list).
- **Alternate:** `place-serving-table-16x9.mp4` / `-9x16.mp4` (two brothers serving a table; faces visible, large; the 16:9 is a 1080×608 crop — fine up to ~1100 px wide, soft if stretched full-bleed) or still `hero-cappuccino-latte-art-3x2.jpg` (real latte art, landscape, bright)
  - HU: „Cappuccino latte arttal, pettyes kerámia csészében" / EN: "Cappuccino with latte art in a speckled ceramic cup"

### 2. Coffees — one set (same cup/saucer, same light, white-balanced together)
`coffee-<name>-4x5.jpg` (1200×1500, matches the current card ratio; background extended upward, so there is calm space above the cup), `coffee-<name>-1x1.jpg`, `coffee-<name>-3x2.jpg`:
`espresso`, `espresso-macchiato`, `cortado`, `cappuccino`, `flat-white`, `latte`, `americano`, `matcha-latte`
- Alt text: HU „<ital> – BrosCafé" (Eszpresszó, Espresso macchiato, Cortado, Cappuccino, Flat white, Latte, Americano, Matcha latte) / EN "<drink> at BrosCafé"
- Why: real drinks, real cups; corrected from grey/lilac to a light, neutral-warm background so they read as one set.
- `home.js` builds the panel photo as `/shared/photos/<id>.jpg`; the new names are `/shared/media/coffee-<id>-4x5.jpg` (ids match for the eight above).
- Honest limits: espresso and macchiato are shot from above, the rest at 45°; background tint still varies slightly (mixed lamp light). Good enough as a set, not studio-grade.
- Alternates (second set, tall glass, portrait): `iced-espresso-tonic-2x3.jpg`, `iced-caramel-latte-2x3.jpg`, `iced-pistachio-latte-2x3.jpg`, `iced-mango-matcha-2x3.jpg`, `iced-pumpkin-spice-latte-2x3.jpg`. Don't mix the two sets in one row.

### 3. The place
- `place-dining-room-daylight-3x2.jpg` / `-4x5.jpg` — HU „Világos, zsályazöld vendégtér bársonyszékekkel" / EN "Bright sage dining room with velvet chairs". Best single photo of the room. No people.
- `place-serving-table-9x16.mp4` / `-16x9.mp4` + posters, still `place-serving-table-4x5.jpg` — HU „Két testvér fatálcákon viszi ki a rendelést" / EN "Two of the brothers bringing an order on wooden boards". Life + hands. Faces visible, large.
- `place-espresso-bar-9x16.mp4` + poster — HU „Munka az eszpresszógépnél" / EN "At work on the espresso machine". Faces small, mostly backs.
- `place-counter-baristas-9x16.jpg` — HU „A pult két baristával" / EN "The counter with two baristas". Faces small. (Same frame as `photos-new/counter-wide-room-with-staff.jpg`; 9:16 only.)
- Alternate: `place-bean-shelf-4x5.jpg` (bean shelf, grinders, machine; no people).

### 4. Loyalty card
- **First:** `loyalty-logo-cup-top-1x1.jpg` / `-4x5.jpg` — HU „Kávé felülről, a habon BrosCafé logó" / EN "Coffee from above with the BrosCafé logo on the crema". Bright, branded, sits well next to the card graphic.
- **Alternate:** `delivery-iced-cup-hand-over-4x5.jpg` (only if not used for Delivery).
- **Weak slot:** there is no photo of the card/phone pass in a hand. See shot list.

### 5. Bros After Hours
- **First:** `after-hours-lounge-evening-9x16.mp4` + poster, still `after-hours-lounge-evening-4x5.jpg`; landscape `after-hours-dining-room-warm-3x2.jpg`
  - HU „Esti fények a vendégtérben, a falon faith, hope, love táblák" / EN "Evening light in the lounge with the faith, hope, love signs"
  - Why: warm bulbs on sage, empty room = "yours for the evening", still friendly.
- **Alternate:** `place-dining-room-daylight-3x2.jpg`. No photo with guests in the evening exists.

### 6. Bros Delivery
- **First:** `delivery-iced-cup-hand-over-4x5.jpg` — HU „Kéz nyújt át egy elviteles jeges kávét" / EN "A hand passing over an iced coffee to go"
- **Alternate:** `delivery-paper-cup-handwritten-4x5.jpg` — HU „Elviteles papírpohár kézzel írt üzenettel" / EN "Paper to-go cup with a handwritten note" (night street, darker — use small).
- **Weak slot:** no carrier, no office hand-over. See shot list.

### 7. Contact / visit
- Day: `contact-shopfront-day-3x2.jpg` / `-4x5.jpg` — HU „A BrosCafé bejárata a Csanády utcában" / EN "BrosCafé shopfront on Csanády utca" (opening-day balloons; neighbour's sign cropped out)
- Night: `contact-shopfront-night-4x5.jpg` / `-3x2.jpg` — HU „A BrosCafé kivilágított bejárata este" / EN "BrosCafé shopfront lit up at night". Dark by nature: use as the small second image, not as a section background.

### 8. Other pages
- Game: `game-brothers-playful-3x2.jpg` — HU „A három testvér játékos pózban" / EN "The three brothers striking a playful pose". Faces visible, large. Alternate: `loyalty-logo-cup-top-1x1.jpg`.
- What's new: `place-bean-shelf-4x5.jpg` — HU „Kávészsákok a polcon a darálók fölött" / EN "Coffee bags on the shelf above the grinders". Alternate: `iced-pumpkin-spice-latte-2x3.jpg` (seasonal).
- Menu header: `menu-croissant-sandwich-3x2.jpg` / `-4x5.jpg` — HU „Prosciuttós croissant szendvics palatálon" / EN "Prosciutto croissant sandwich on a slate board". Alternate: `menu-board-3x2.jpg` (real board, but prices are hand-corrected on it — will date).
- Team (about block): `team-brothers-3x2.jpg` — HU „A három testvér a kávézóban" / EN "The three brothers in the café". Faces visible, large. Replaces the yellow-cast `team-2.jpg`.

## Critique of the current home page picks

| Now on the page | Verdict | Why |
|---|---|---|
| Hero film `video-new/iced-coffee-pour-hands-9x16` | Keep the idea, swap the file | Right clip, but 720p and 12.6 s. New cut is 1080p, 10 s. |
| Hero side circle `photos/cappuccino.jpg` | Replace → `coffee-cappuccino-1x1.jpg` | Underexposed, grey-lilac background: reads dull next to the sage film. |
| Coffee row `photos/espresso, cortado, cappuccino, flat-white, pistachio-latte, espresso-tonic` | Replace with the 8-cup set | Uncorrected: each has a different grey/lilac/pink cast and brightness; two tall glasses among four cups breaks the row. |
| `photos-new/hope-love-faith-wall-signs.jpg` (After Hours) | Replace → `after-hours-lounge-evening-4x5.jpg` | Same scene, but dim and yellow; new one is brightened and cropped to the signs + sofa. |
| `photos-new/iced-latte-hand-over.jpg` (Delivery) | Replace → `delivery-iced-cup-hand-over-4x5.jpg` | Same frame, lighter, tighter on the cup. |
| Place films `interior-walk-in` + `dining-room-pan` | Drop → `place-serving-table` | 4–5 s each, 720p, evening footage of an empty room: no life. |
| `photos-new/counter-wide-room-with-staff.jpg` | Keep | Bright, real, people at work. |
| Loyalty circle film `video/bar.mp4` | Drop → `loyalty-logo-cup-top-1x1.jpg` (or `place-espresso-bar-9x16.mp4`) | Nothing to do with the card; cluttered in a circle crop. |
| `photos/shopfront.jpg` | Replace → `contact-shopfront-day-3x2.jpg` | Neighbouring barber's sign in frame, a bit dark. |
| `photos/team-2.jpg` | Replace → `team-brothers-3x2.jpg` | Heavy yellow cast, flat flash look. |

Never use: everything in `shared/img/*.jpg` (stock photos — dark, moody, not this café), `team-silly.jpg` (excluded by Daniel), `Smo_Fru_BenG` (face clowning), reels with burnt-in captions, the dark outdoor "matcha briefcase" reel, the Spotify-overlay reel (third-party UI), `bean-shelf-grinders-espresso-machine.jpg` (dark lower half, cluttered).

## Shot list for the brothers (phone is fine; daylight, lights on, wipe the lens)

1. **Latte-art pour, landscape** — phone held sideways, 15 s, from the side at cup height, sage wall behind, nothing else on the counter. One take per drink (cappuccino, flat white). This is the hero we don't have.
2. **Same pour, upright** (portrait) for phones.
3. **Loyalty card in use** — a guest's hand holding the phone with the Wallet card next to a cup on the wooden table; and the card being scanned at the till. Photo + 5 s clip. No faces needed.
4. **Delivery** — 4 cups in a cardboard carrier on the counter; a hand passing the carrier/paper bag across the door; someone walking out with it in daylight. Landscape and portrait.
5. **After Hours** — the lounge set for an evening: lights on, candles, drinks and snacks on the tables, 4–6 friends from behind/side (with their OK). Shot around 18:00 so the windows still glow. Landscape.
6. **Shopfront without balloons** — straight on, daytime, door open, no parked cars; and once at dusk when the sign is lit but the sky is still blue.
7. **Drinks, one more pass** — all on the same table by the window, same angle (45°), same cup facing the same way; espresso and macchiato again at that angle. Iced drinks on the same table.
8. **Guests** — the room with people in it (backs/hands, laptops, a chat over coffee). Every interior we have is empty.
9. **Hands at work, landscape** — tamping, steaming milk, handing a cup over the counter. 10 s each.

## Privacy / people notes

- Faces visible, large: `team-brothers-3x2`, `game-brothers-playful-3x2`, `place-serving-table-*` (video, poster, 4x5). Faces small: `place-espresso-bar-9x16`, `place-counter-baristas-9x16`. All are the café's own staff from its own published material; nobody identified by me.
- No children, number plates or screens with private data in any pick (the night-street background in `delivery-paper-cup-handwritten` is too blurred to read; the till screen in the counter shot is unreadable).
- `contact-shopfront-day`: neighbour's barber sign cropped out. `menu-board-3x2`: shows prices.
- All frames checked once per second for the video cuts; EXIF/GPS and container metadata stripped.
