// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Emberfall: an arena survival shooter. You are a small ember-ship. Enemies drift in from the
// edges in waves; your cannon auto-fires at the nearest one. Catch the star shards they drop
// to build a combo, dash through danger, and see how many waves you can survive.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

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

/** Seconds of breathing room between waves, and the wave-clear bonus per wave. */
export const WAVE = { breather: 3.0, clearBonus: 100, maxConcurrent: 32 };

export const ENEMY = {
  // drifter: slow chaser, 1 hit.
  drifter: { radius: 16, hp: 1, speed: 145, score: 10, shards: 1, color: '#ff7a59' },
  // dart: fast, flies straight at where you were when it spawned, 1 hit.
  dart: { radius: 11, hp: 1, speed: 380, score: 15, shards: 1, color: '#ffd166' },
  // spinner: weaves in a sine wave, 2 hits.
  spinner: { radius: 15, hp: 2, speed: 165, score: 25, shards: 2, color: '#c77dff' },
  // splitter: slow and tough, breaks into two drifters when it pops, 3 hits.
  splitter: { radius: 24, hp: 3, speed: 55, score: 40, shards: 3, color: '#ef476f' },
};

/** How a wave is built: each wave's budget buys enemies; costs grow the pressure. */
export const WAVE_COST = { drifter: 1, dart: 2, spinner: 3, splitter: 4 };

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

export const PARTICLE = { max: 320, shardBurst: 10, deathBurst: 18 };

/** Starfield layers: count, speed factor and size range, far to near. */
export const STARS = [
  { count: 70, factor: 0.12, min: 1, max: 1.8 },
  { count: 46, factor: 0.3, min: 1.4, max: 2.4 },
  { count: 26, factor: 0.55, min: 2, max: 3.2 },
];

export const PALETTE = {
  backdrop: '#0a0c16',
  nebulaA: '#1d2b5c',
  nebulaB: '#3d1a4d',
  nebulaC: '#0f3a3d',
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
