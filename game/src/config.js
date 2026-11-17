// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Emberfall — Nine Nights of the Last Star. Vaelith, the last star, is dying. Nine nights
// of the Hollow are coming for its heart. You are its last ember-keeper: hold the field,
// choose a boon after each night, slay the three Night Wardens, and relight the star.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Nine nights, then the star is relit: the last night's Warden is the final boss. */
export const NIGHTS = 9;
export const BOSS_NIGHTS = [3, 6, 9];

export const PLAYER = {
  radius: 14,
  accel: 2400,
  maxSpeed: 340,
  damping: 4.2,
  fireRange: 320,
  fireInterval: 0.22,
  bulletSpeed: 780,
  bulletDamage: 1,
  dashSpeed: 980,
  dashTime: 0.16,
  dashCooldown: 2.4,
  invulnerable: 1.6,
};

export const LIVES = 3;
export const MAX_LIVES = 5;

/** Seconds of breathing room between waves, and the night-clear bonus per night. */
export const WAVE = { breather: 3.0, clearBonus: 150, maxConcurrent: 40 };

export const ENEMY = {
  // drifter: slow chaser, 1 hit.
  drifter: { radius: 16, hp: 1, speed: 145, score: 10, shards: 1, color: '#ff7a59' },
  // dart: fast, flies straight at where you were when it spawned, 1 hit.
  dart: { radius: 11, hp: 1, speed: 380, score: 15, shards: 1, color: '#ffd166' },
  // spinner: weaves in a sine wave, 2 hits.
  spinner: { radius: 15, hp: 2, speed: 165, score: 25, shards: 2, color: '#c77dff' },
  // splitter: slow and tough, breaks into two drifters when it pops, 3 hits.
  splitter: { radius: 24, hp: 3, speed: 55, score: 40, shards: 3, color: '#ef476f' },
  // wisp: tiny and quick, zigzags hard, 1 hit. Appears from night 2.
  wisp: { radius: 9, hp: 1, speed: 300, score: 20, shards: 1, color: '#8ecae6' },
  // brute: a slow wall of stone, 5 hits, worth a fortune. Appears from night 4.
  brute: { radius: 30, hp: 5, speed: 42, score: 80, shards: 4, color: '#b08968' },
};

/** The three Night Wardens: one per boss night, each bigger and meaner than the last. */
export const BOSS = {
  3: { name: 'CINDER MAW', radius: 46, hp: 42, speed: 46, score: 600, color: '#ff6b35', minion: 'drifter' },
  6: { name: 'THE HOLLOW CHOIR', radius: 54, hp: 85, speed: 54, score: 1200, color: '#b5179e', minion: 'spinner' },
  9: { name: 'THE VOID KING', radius: 64, hp: 150, speed: 62, score: 3000, color: '#7209b7', minion: 'dart' },
};

/** How a night is built: each night's budget buys enemies; costs grow the pressure. */
export const WAVE_COST = { drifter: 1, dart: 2, spinner: 3, splitter: 4, wisp: 2, brute: 6 };

export const SHARD = { radius: 8, points: 10, magnetRadius: 220, life: 9 };

/** Combo: kills and pickups within COMBO_WINDOW seconds of each other chain. */
export const COMBO = { window: 3.0, perStep: 8, maxMult: 5 };

export const POWERUP = {
  kinds: ['shield', 'rapid', 'magnet'],
  radius: 13,
  dropChance: 0.09,
  rapidTime: 8,
  magnetTime: 6,
};

/** Ember-boons: the draft after each cleared night offers three; take one. */
export const BOONS = [
  { id: 'heavy', name: 'HEAVY SHOT', desc: '+1 bullet damage', max: 3 },
  { id: 'rapid', name: 'RAPID CANNON', desc: 'Fire 18% faster', max: 3 },
  { id: 'range', name: 'LONG BARREL', desc: '+25% fire range', max: 2 },
  { id: 'twin', name: 'TWIN CANNON', desc: 'Fire an extra bullet', max: 2 },
  { id: 'pierce', name: 'PIERCING SHOT', desc: 'Bullets pass through +1 enemy', max: 2 },
  { id: 'swift', name: 'SWIFT WINGS', desc: '+12% flight speed', max: 2 },
  { id: 'heart', name: 'EMBER HEART', desc: 'Restore 1 life', max: 3 },
  { id: 'magnet', name: 'MAGNET CORE', desc: '+60% shard pull', max: 2 },
  { id: 'dash', name: 'QUICK DASH', desc: 'Dash recharges 30% faster', max: 2 },
  { id: 'flame', name: 'COMBO FLAME', desc: '+1s combo window', max: 2 },
];

export const PARTICLE = { max: 320, shardBurst: 10, deathBurst: 18 };

/** Starfield layers: count, speed factor and size range, far to near. */
export const STARS = [
  { count: 90, factor: 0.12, min: 1, max: 1.8 },
  { count: 60, factor: 0.3, min: 1.4, max: 2.4 },
  { count: 36, factor: 0.55, min: 2, max: 3.2 },
];

export const PALETTE = {
  backdrop: '#0a0c16',
  nebulaA: '#1d2b5c',
  nebulaB: '#3d1a4d',
  nebulaC: '#0f3a3d',
  hearth: '#ff9e00',
  hearthCore: '#ffe66d',
  player: '#7df9ff',
  playerCore: '#eafcff',
  bullet: '#ffe66d',
  shard: '#ffd166',
  shardCore: '#fff3c4',
  panel: '#141828',
  panelEdge: '#2c3550',
  text: '#f2f5ff',
  muted: '#9aa5c4',
  danger: '#ff5964',
  good: '#7dff9e',
  dash: '#7df9ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
