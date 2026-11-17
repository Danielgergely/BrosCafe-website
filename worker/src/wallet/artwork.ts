// The strip image on the Apple pass and the hero banner on the Google card. backend/app/wallet/artwork.py draws them
// with Pillow; Workers have none, so scripts/render_wallet_art.py renders every image with that same code once and
// they are served from R2 (MEDIA, under wallet-art/). The bytes are the ones Python produces.
import type { App } from '../http';

export const TIERS = ['base', 'bronze', 'silver', 'gold', 'diamond'] as const;
const PREFIX = 'wallet-art';

/**
 * The rendered file that holds this state. An unknown tier draws as base; stamps beyond `required` fill every
 * circle, exactly as stamps == required; required 0 draws no circles at all. So these collapse onto one image.
 */
function key(kind: 'strip' | 'hero', tier: string, stamps: number, required: number, suffix = '') {
  const t = (TIERS as readonly string[]).includes(tier) ? tier : 'base';
  const r = Math.max(0, required);
  const s = r === 0 ? 0 : Math.min(Math.max(0, stamps), r);
  return `${PREFIX}/${kind}/${t}/${s}-${r}${suffix}.png`;
}

async function load(app: App, k: string): Promise<Uint8Array> {
  const obj = await app.env.MEDIA.get(k);
  if (!obj) throw new Error(`wallet artwork missing from R2: ${k} (run scripts/render_wallet_art.py and upload)`);
  return new Uint8Array(await obj.arrayBuffer());
}

export function strip(app: App, tier: string, stamps: number, required: number, scale = 1) {
  return load(app, key('strip', tier, stamps, required, scale === 1 ? '' : `@${scale}x`));
}

export function hero(app: App, tier: string, stamps: number, required: number) {
  return load(app, key('hero', tier, stamps, required));
}
