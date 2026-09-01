// ─────────────────────────────────────────────────────────────────────────
// BROS CAFE — every editable, non-copy value on the site.
// Text lives in src/i18n/. Products come from the API (see src/lib/catalog.js).
// Anything a non-developer might want to change should be reachable from here.
// ─────────────────────────────────────────────────────────────────────────

export const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export const BRAND = {
  name: "BROS CAFE",
  /** Fallback only. The live value comes from GET /api/cafe. */
  stampsRequired: 4,
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
