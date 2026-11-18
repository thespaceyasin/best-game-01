// Sprite art cut from the user's own images (game/assets/*.png, backgrounds keyed
// out when the sprites were cut): one ship per difficulty, one monster per enemy
// kind, one sprite per Night Warden, and a gold coin for shards. The Void King is
// the yellow octopus from the user's boss image; the other two Wardens and the
// monsters come from the sprite sheet.
// Images are local files served with the game; nothing is fetched from the network.
// If an image fails to load, the renderer falls back to its vector shapes, so the
// game never depends on the art being there. Loading happens once at boot, before
// the first frame and before __shotReady, so a staged scene always paints with the
// art in place; the simulation never depends on it.
const FILES = {
  shipEmber: 'assets/ship-ember.png',
  shipLantern: 'assets/ship-lantern.png',
  shipInferno: 'assets/ship-inferno.png',
  drifter: 'assets/monster-drifter.png',
  dart: 'assets/monster-dart.png',
  spinner: 'assets/monster-spinner.png',
  splitter: 'assets/monster-splitter.png',
  wisp: 'assets/monster-wisp.png',
  brute: 'assets/monster-brute.png',
  hollowChoir: 'assets/boss-choir.png',
  voidKing: 'assets/boss-void-king-v3.png',
  coin: 'assets/coin.png',
  bgSpace: 'assets/bg-space.png',
};

/** name -> HTMLImageElement, only for images that actually loaded. */
export const SPRITES = {};

/** Load every sprite; resolves once all have either loaded or failed. */
export function loadSprites() {
  const jobs = Object.entries(FILES).map(([name, src]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      SPRITES[name] = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  }));
  return Promise.all(jobs);
}

/** The sprite for an enemy or boss entity, or null when its art did not load. */
export function spriteForEnemy(e) {
  if (e.kind === 'boss') {
    if (e.name === 'CINDER MAW') return SPRITES.splitter ?? null;
    if (e.name === 'THE HOLLOW CHOIR') return SPRITES.hollowChoir ?? null;
    return SPRITES.voidKing ?? null;
  }
  return SPRITES[e.kind] ?? null;
}

/** The player ship for a difficulty id (ember/lantern/inferno). */
export function shipForDifficulty(id) {
  if (id === 'lantern') return SPRITES.shipLantern ?? null;
  if (id === 'inferno') return SPRITES.shipInferno ?? null;
  return SPRITES.shipEmber ?? null;
}

/** The gold coin drawn for shards, or null when it did not load. */
export function coinSprite() {
  return SPRITES.coin ?? null;
}

/** The HD space background (redrawn from the user's photo), or null when it did not load. */
export function bgSprite() {
  return SPRITES.bgSpace ?? null;
}
