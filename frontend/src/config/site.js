// ─────────────────────────────────────────────────────────────────────────
// BROS CAFE — every editable, non-copy value on the site.
// Text lives in src/i18n/. Products come from the API (see src/lib/catalog.js).
// Anything a non-developer might want to change should be reachable from here.
// ─────────────────────────────────────────────────────────────────────────

export const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export const BRAND = {
  name: "BROS CAFE",
  /**
   * Fallbacks only — the live values come from GET /api/cafe, which reads
   * STAMPS_REQUIRED and WELCOME_STAMPS. They also fill the {n} and {welcome}
   * placeholders in the marketing copy, so change them here alongside the
   * environment or the homepage will advertise the wrong numbers.
   */
  stampsRequired: 10,
  welcomeStamps: 5,
};

export const CONTACT = {
  email: "hello@broscafe.hu",
  instagram: "broscafe",
  get instagramUrl() {
    return `https://instagram.com/${this.instagram}`;
  },
  address: "1132 Budapest, Csanády u. 4.b",
  get mapsUrl() {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.address)}`;
  },
};

/**
 * Grand opening. The server is authoritative (GET /api/opening/status) so a
 * visitor's clock can't skew the countdown; this is the offline fallback.
 * Keep it in sync with OPENING_DATETIME in the backend .env.
 */
export const OPENING = {
  fallbackISO: "2026-09-16T08:00:00+02:00",
  get fallbackTime() {
    return new Date(this.fallbackISO).getTime();
  },
};

/** Prices are stored in HUF. EUR is a courtesy conversion for visitors. */
export const CURRENCY = {
  primary: "HUF",
  eurPerHuf: 1 / 400,
  showSecondary: true,
};

export const ROUTES = {
  home: "/",
  menu: "/menu",
  news: "/whats-new",
  opening: "/opening",
  loyalty: "/loyalty",
  shop: "/shop",
  account: "/account",
  contact: "/contact",
  login: "/login",
  privacy: "/privacy",
  help: "/help",
  game: "/game",
  staff: "/staff",
  admin: "/admin",
  card: (code) => `/card/${code}`,
  product: (id) => `/product/${id}`,
};

/**
 * Primary navigation. `anchor` entries scroll to a homepage section (navigating
 * home first if needed); `to` entries are routes. Order here is the order shown.
 */
export const NAV_LINKS = [
  { key: "home", anchor: "home" },
  { key: "coffee", to: ROUTES.menu },
  { key: "rotation", to: ROUTES.news },
  { key: "story", anchor: "about" },
  { key: "loyalty", to: ROUTES.loyalty },
  { key: "visit", to: ROUTES.contact },
];

/** The footer carries the full map, including pages the header has no room for. */
export const FOOTER_LINKS = [
  { key: "home", anchor: "home" },
  { key: "coffee", to: ROUTES.menu },
  { key: "rotation", to: ROUTES.news },
  { key: "story", anchor: "about" },
  { key: "loyalty", to: ROUTES.loyalty },
  { key: "opening", to: ROUTES.opening },
  { key: "shop", to: ROUTES.shop },
  { key: "visit", to: ROUTES.contact },
  { key: "privacy", to: ROUTES.privacy },
];

/**
 * Homepage section order. The numbered editorial labels (01, 02, …) are derived
 * from this list, so reordering sections renumbers them automatically instead of
 * leaving hardcoded numbers wrong.
 */
export const HOME_SECTIONS = [
  "coffee", "collection", "about", "menu", "discover", "merch", "loyalty", "news", "community",
];

/** Media placeholders. Swap for real Bros Cafe footage and photography. */
export const MEDIA = {
  video: {
    hero: {
      src: "https://assets.mixkit.co/videos/47954/47954-720.mp4",
      poster:
        "https://images.unsplash.com/photo-1475296204602-08d15839e95f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    },
    moment: {
      src: "https://assets.mixkit.co/videos/43941/43941-720.mp4",
      poster:
        "https://images.pexels.com/photos/37305718/pexels-photo-37305718.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    },
  },
  image: {
    about:
      "https://images.pexels.com/photos/17440526/pexels-photo-17440526.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    interior:
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    flatlay:
      "https://images.pexels.com/photos/32507191/pexels-photo-32507191.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    magazine:
      "https://images.unsplash.com/photo-1519748771451-a94c596fad67?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    coffeePoster:
      "https://customer-assets-m6fa6gv7.emergentagent.net/job_premium-cafe-vision/artifacts/ye95afap_Nude%20Gray%20Minimalist%20Coffee%20Milk%20Business%20Banner%20-%202.webp",
    sweetsPoster:
      "https://customer-assets-m6fa6gv7.emergentagent.net/job_premium-cafe-vision/artifacts/vwk0b3xo_Nude%20Gray%20Minimalist%20Coffee%20Milk%20Business%20Banner%20-%203.webp",
    merchPoster: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1200&q=80",
  },
};

/** Motion. One easing curve and one duration scale across the whole site. */
export const MOTION = {
  ease: [0.22, 1, 0.36, 1],
  reveal: 0.8,
  page: 0.35,
  loaderMs: 1300,
};

/** Which products the homepage coffee row and the loyalty discover row feature. */
export const FEATURED = {
  coffeeRow: ["espresso", "cappuccino", "latte", "americano"],
  discoverRow: ["cappuccino", "croissant", "bros-mug"],
  merchLookbook: ["bros-hoodie", "bros-tee", "bros-mug", "bros-beans"],
  menuGroups: ["coffee", "cold", "food", "sweet"],
};

export const CATEGORIES = ["all", "coffee", "cold", "food", "sweet", "merch"];

/**
 * The flavour axes, in the order their labels appear in i18n `product.scales`.
 * Shared so the product page and the admin editor cannot drift apart — a
 * reordering here has to stay in step with that label list.
 */
/**
 * How each tier looks. `ring` is the border that marks the card, `ink` the
 * colour of the tier's own name. The thresholds and the maths live in the
 * backend (app/services/tiers.py) and reach the app on the member object —
 * these are presentation only.
 */
export const TIERS = ["base", "bronze", "silver", "gold", "diamond"];

export const TIER_STYLE = {
  base: { ring: "#D8D2C2", ink: "#66734A", glow: "rgba(102,115,74,0.10)" },
  bronze: { ring: "#8A5A32", ink: "#6E4426", glow: "rgba(124,82,48,0.14)" },
  silver: { ring: "#8A9099", ink: "#545C66", glow: "rgba(92,99,107,0.14)" },
  gold: { ring: "#C69A2E", ink: "#846018", glow: "rgba(198,154,46,0.18)" },
  /**
   * Diamond turns the whole card over rather than only edging it: dark
   * platinum with a cool sheen, so it reads as a different object on the
   * shelf, not the same card with a smarter border.
   */
  diamond: {
    ring: "#5C7C99",
    ink: "#9CB0C7",
    glow: "rgba(92,124,153,0.28)",
    surface: "linear-gradient(155deg, #232833 0%, #181B22 48%, #20252F 100%)",
    text: "#ECF0F6",
    muted: "#9CB0C7",
  },
};

export const FLAVOUR_KEYS = ["bitterSweet", "lightBold", "milkyCreamy", "hotIced"];
