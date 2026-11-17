// Loyalty tiers. Line-for-line port of backend/app/services/tiers.py (read its docstrings for the why).
import type { Doc } from '../db';
import type { Settings } from '../config';

const DIAMOND = 'diamond';

/** Lowest first. `at` is lifetime coffees purchased. */
const EARNED = [
  { key: 'base', at: 0, shorter: 0 },
  { key: 'bronze', at: 50, shorter: 1 },
  { key: 'silver', at: 150, shorter: 2 },
  { key: 'gold', at: 300, shorter: 3 },
] as const;
/** Granted by an admin. Never reached by spending, and never lost by inactivity. */
const GRANTED = [DIAMOND] as const;
const ALL: string[] = [...EARNED.map((t) => t.key), ...GRANTED];
/** A card can never get shorter than this, whatever the tier maths says. */
const MIN_STAMPS = 2;

const spec = (key: string) => EARNED.find((t) => t.key === key) ?? EARNED[0];

/** int(doc.get("total_coffees", 0) or 0), 0 on anything unparseable. */
function bought(doc: Doc): number {
  const v = doc.total_coffees;
  if (v === undefined || v === null || v === false || v === '' || v === 0) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === 'boolean') return 1; // int(True)
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return Number.parseInt(v, 10);
  return 0;
}

function earnedTier(totalCoffees: number): string {
  let best: string = EARNED[0].key;
  for (const tier of EARNED) if (totalCoffees >= tier.at) best = tier.key;
  return best;
}

function effectiveTier(doc: Doc): string {
  const granted = doc.tier_override;
  const earned = earnedTier(bought(doc));
  if (!granted || !ALL.includes(granted)) return earned;
  if ((GRANTED as readonly string[]).includes(granted)) return granted;
  const order = EARNED.map((t) => t.key as string);
  return order.indexOf(granted) > order.indexOf(earned) ? granted : earned;
}

const alwaysFree = (tier: string) => tier === DIAMOND;

/** How many stamps a free coffee costs this member. 0 means always free. */
export function stampsRequired(doc: Doc, s: Settings): number {
  const tier = effectiveTier(doc);
  if (alwaysFree(tier)) return 0;
  return Math.max(MIN_STAMPS, s.stamps_required - spec(tier).shorter);
}

/** The tier above this one and the purchases still needed; [null, 0] for diamond and gold. */
function nextTier(doc: Doc): [string | null, number] {
  const tier = effectiveTier(doc);
  if (alwaysFree(tier)) return [null, 0];
  const order = EARNED.map((t) => t.key as string);
  const index = order.indexOf(tier);
  if (index >= EARNED.length - 1) return [null, 0];
  const upcoming = EARNED[index + 1];
  return [upcoming.key, Math.max(0, upcoming.at - bought(doc))];
}

export function summary(doc: Doc) {
  const tier = effectiveTier(doc);
  const [upcoming, remaining] = nextTier(doc);
  return {
    tier,
    tier_granted: !!doc.tier_override && tier === doc.tier_override,
    always_free: alwaysFree(tier),
    next_tier: upcoming,
    coffees_to_next: remaining,
  };
}
