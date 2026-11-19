# Ideas backlog

Not scheduled. Brainstormed with Daniel on 2026-11-19; pick one up by moving it into `PROJECT.md`.

## 1. Statistics on the account page (/fiok/)

**Daniel (2026-11-19):** show only a little, not a dashboard.

- **What to show:** four tiles and one line:
  - total coffees;
  - favourite drink;
  - total spent;
  - saved through free coffees;
  - "member since …".
  Everything else, if ever, goes behind "Több" or into the yearly card.
- **Prices:**
  - **Counter purchases:** each stamp is priced at the website's current price of that drink (`products.price_huf`).
    A stamp without a recorded drink gets the average coffee price.
  - **Delivery and After Hours:** the amounts actually paid.
- **Savings:** rewards redeemed × the price of the drink taken as the reward (the average coffee price when unknown).
- **Later:** the December "Bros Wrapped" card to share on Instagram Stories.
- **Data:** it's all there already. Stamps are `transactions` rows (`coffee_added`, with the drink when staff picked
  one; `services/drinks.ts` reads favourites), rewards are `reward_redeemed`, and online orders are in D1.

## 2. Coffee plant that grows with every coffee (Tamagotchi-like)

**Daniel (2026-11-19):** yes, a plant. It can die, but slowly (about a month without a purchase). Heavy drinkers
(2 a day) must still see progress. It's optional: anyone can ignore it or turn it off. A shared garden only if it's
cheap.

- **Growth that lasts for years.** The stage follows total coffees on a stretched scale, e.g. stage at
  1 / 5 / 15 / 35 / 70 / 140 / 280 / 500 coffees:
  1. seed
  2. sprout
  3. seedling
  4. young bush
  5. flowering
  6. green cherries
  7. red cherries
  8. tree
  After that it keeps getting fuller (more branches and cherries, a bigger pot every 250), so a 2-a-day guest
  still sees something new every week or two.
- **Every coffee is visible:** a watering animation right after the stamp and a small growth bar to the next stage.
- **Cherries follow the loyalty card:** the stamps ripen them, the free coffee is the harvest, and new blossoms start.
  The plant never changes stamps or rewards.
- **Thirst and dying:**
  - leaves droop after 10 days without a coffee;
  - it wilts and turns brown after 20 days;
  - it dies after **30 days**, counted on café open days only (Sundays, holidays and closures don't count, so a
    summer break doesn't kill it).
  - A dead plant becomes a dry stick in the pot. The next coffee plants a new seed, but it starts at the stage of
    "half of the old one", so years of loyalty are not wiped out.
  - Optional nudges at day 20 and 27 (email or push, only if turned on): "A cserjéd szomjas" (your plant is thirsty).
- **Optional:**
  - Shown by default with a one-tap "Nem érdekel" (not interested) that hides it everywhere (card, Wallet pass,
    emails).
  - It can be turned back on in the account settings.
  - Stored as `members.plant = { on, name, … }`.
- **Where it lives:**
  - the account card;
  - the Wallet pass strip image (the pass already refreshes on every stamp);
  - a share card for Stories;
  - fertiliser from the game, for cosmetics only.
- **Garden (cheap version):**
  - A page or a TV/iPad screen in the shop showing all opted-in plants as small SVGs, with only first names or
    nicknames.
  - One cached query a day (member stage, ripeness, thirst), with no per-visitor cost. Feasible.
- **Garden: where and how (agreed direction 2026-11-19):**
  - **Where:**
    - its own page, /kert/ ("A Bros-kert");
    - linked from the account card ("Nézd meg a kertben" jumps to your pot) and from the loyalty page;
    - a full-screen mode for the counter iPad or a TV in the shop;
    - not on the game page (the runner is for playing, the garden for looking).
  - **Scales with the number of players:**
    - Under ~20 plants: a cosy windowsill and shelf scene with big pots. It's filled out by the café's own plants
      (one per brother) and a few unnamed decorative pots, so it never looks empty.
    - More: greenhouse rows with smaller plants that scroll sideways (or pan slowly on the shop screen).
    - Hundreds: the most recently watered stand in front, and "find my plant" jumps to your pot.
  - **Names:** first names only on the pots. The guest can change the name or hide it.
- **Art:** SVG stages in the brand colours, with layered sway, droop, perk-up and bloom animations; reduced motion
  respected.

## 3. iPad app for the staff

**Problem:** order and rush emails go only to hello@broscafe.hu (Daniel); the brothers in the shop see nothing.

**Daniel (2026-11-19):** two parts:
1. All the admin things, neat and one tap away.
2. An **order screen** like in fast-food kitchens: incoming orders pop up, and staff tap or drag them through the
   steps.

- **Order screen:**
  - Full-screen columns: **Új** → **Készül** → **Kész / Úton** → **Kiszállítva** (pickup: Kész → Átvette).
  - Rush requests arrive in Új with a sound and big **Elfogad (15/20/30 perc)** and **Most nem megy** buttons.
  - One tap moves a card to the next column; dragging works too; a long press opens the details (cups with names,
    notes, address, phone).
  - Group orders appear when they are locked.
  - Each card shows a countdown to its slot time and turns red when late.
  - The backend is the existing Delivery board API (statuses `new`/`making`/`out`/`delivered`, rush answer,
    cancel).
- **Admin, one tap away:** tabs for Rendelések (the screen above), After Hours, Kártya beolvasás (the camera scanner),
  Rush be/ki, Időpontok, Beállítások, and **Feladatok**. Feladatok lists the things that today only arrive by email:
  failed invoices, refunds to do by hand, cancellations to settle at the till.
- **How:**
  - First the admin as an installable web app on the iPad home screen, with Web Push for new orders and rush
    requests (iPadOS 16.4+).
  - A native wrapper (Capacitor) only if sound or kiosk mode needs it.
  - Separate staff logins for each brother.

## 4. Customer app

**Daniel (2026-11-19):** makes sense; it comes last, after the staff app.

- **What it is:** the website as a polished phone app: the loyalty card with the coffee plant, Delivery ordering,
  the game, and push notifications ("on its way", "free coffee ready", "your plant is thirsty").
- **Risk:** Apple rejects apps that are only a website in a frame (guideline 4.2). Push notifications, Wallet,
  ordering and the plant give it real app value.
- **Shared groundwork:** it reuses the staff app's web-app work (manifest, push).

## 5. Instagram feed on the website

The current videos are a fixed handful. The goal is our pinned reels plus the most viewed, always up to date.

- **Facts checked (2026-11-19):**
  - The Instagram API lists our reels with their view count (`view_count`, or `total_views_count` with Facebook
    Login), for a professional account with a Meta app and a token.
  - It has **no "pinned" field**, so pinned reels have to be chosen by hand (a short list in the admin).
  - Instagram does not document whether plays of an embedded reel on our site count as views. It's unverified.
- **Options:**
  - **A. Thumbnails linking to Instagram.** A grid of covers on our site; a tap opens the reel in the Instagram
    app or site. Those plays certainly count, it can lead to follows, it's fast and nothing tracks visitors
    before they tap.
  - **B. Click-to-play embed.** A cover that loads Instagram's own player after a tap. The visitor stays on our
    site, but views are not guaranteed to count, and Instagram's script sets cookies (needs the tap anyway for
    privacy).
- **Build:**
  - A daily cron fetches our reels and stores the covers in R2. The thumbnails come from the API.
  - The token is long-lived and refreshed by the cron every 50 days.
  - The section shows the hand-pinned reels first, then the top 6 by views.
- **Daniel's part:**
  - Make sure @broscafe.co is a professional account.
  - Create the Meta app, or let me guide it.
  - Paste the token with `pbpaste | npx wrangler secret put IG_TOKEN`.
- **Daniel (2026-11-19):** don't send people away from the site, since not everyone has Instagram; but views and
  followers would be nice. Undecided.
- **Middle way to propose:**
  - The grid of covers on our site; a tap plays the reel in Instagram's player in a popup on our site, so no
    Instagram account is needed.
  - Under it, a "Kövess minket az Instagramon" (follow us) button and a small "Megnyitás az Instagramon"
    (open on Instagram) link.
  - Visitors stay on the site; the plays may count as views (not confirmed by Instagram), and followers come from
    the button.

