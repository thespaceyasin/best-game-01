// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Emberfall: Nine Nights of the Last Star. Vaelith, the last star, is dying. Nine nights
// of the Hollow are coming for its heart. You are its last ember-keeper: hold the field,
// choose a boon after each night, slay the three Night Wardens, and relight the star.
// Round 3: bigger ships and enemies (+25%), three difficulties, feats, Endless mode,
// a second phase for the Void King, and steeper nights 6-9 so a winning run lasts 5-6 min.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Nine nights, then the star is relit: the last night's Warden is the final boss. */
export const NIGHTS = 9;
export const BOSS_NIGHTS = [3, 6, 9];

/** Difficulties: score multiplier, enemy HP and speed multipliers. */
export const DIFFICULTY = {
  ember: { id: 'ember', name: 'EMBER', desc: 'The run as it was meant to be', scoreMult: 1, hpMult: 1, speedMult: 1 },
  lantern: { id: 'lantern', name: 'LANTERN', desc: 'Harder Hollow, richer rewards', scoreMult: 1.25, hpMult: 1.25, speedMult: 1.08 },
  inferno: { id: 'inferno', name: 'INFERNO', desc: 'For keepers who have already won', scoreMult: 1.5, hpMult: 1.6, speedMult: 1.15 },
};
export const DIFFICULTY_ORDER = ['ember', 'lantern', 'inferno'];

/** Late nights get tougher on top of the difficulty: HP grows 50% a night from night 6. */
export function lateNightHpScale(wave) {
  return 1 + Math.max(0, wave - 5) * 0.5;
}

export const PLAYER = {
  radius: 18,
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
  drifter: { radius: 20, hp: 1, speed: 145, score: 10, shards: 1, color: '#ff7a59', behaviour: 'Slow chaser' },
  // dart: fast, flies straight at where you were when it spawned, 1 hit.
  dart: { radius: 14, hp: 1, speed: 380, score: 15, shards: 1, color: '#ffd166', behaviour: 'Dives straight at you' },
  // spinner: weaves in a sine wave, 2 hits.
  spinner: { radius: 19, hp: 2, speed: 165, score: 25, shards: 2, color: '#c77dff', behaviour: 'Weaves side to side' },
  // splitter: slow and tough, breaks into two drifters when it pops, 3 hits.
  splitter: { radius: 30, hp: 3, speed: 55, score: 40, shards: 3, color: '#ef476f', behaviour: 'Splits in two' },
  // wisp: tiny and quick, zigzags hard, 1 hit. Appears from night 2.
  wisp: { radius: 11, hp: 1, speed: 300, score: 20, shards: 1, color: '#8ecae6', behaviour: 'Zigzags, fast' },
  // brute: a slow wall of stone, 5 hits, worth a fortune. Appears from night 4.
  brute: { radius: 38, hp: 5, speed: 42, score: 80, shards: 4, color: '#b08968', behaviour: 'A slow stone wall' },
};

/** The three Night Wardens: one per boss night, each bigger and meaner than the last. */
export const BOSS = {
  3: { name: 'CINDER MAW', radius: 58, hp: 42, speed: 46, score: 600, color: '#ff6b35', minion: 'drifter', behaviour: 'Calls drifters. Lunges close.' },
  6: { name: 'THE HOLLOW CHOIR', radius: 68, hp: 85, speed: 54, score: 1200, color: '#b5179e', minion: 'spinner', behaviour: 'A hollow ring, singing spinners' },
  9: { name: 'THE VOID KING', radius: 80, hp: 400, speed: 62, score: 3000, color: '#7209b7', minion: 'dart', behaviour: 'Enrages at half health' },
};

/** Which enemy kinds first appear on each night (title bestiary + draft preview). */
export const NEW_AT_NIGHT = {
  2: ['dart', 'wisp'],
  3: ['spinner'],
  4: ['splitter', 'brute'],
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

/** Ember-boons: the draft after each cleared night offers three; take one. Rarity colours the card. */
export const BOONS = [
  { id: 'heavy', name: 'HEAVY SHOT', desc: 'Every bullet hits +1 harder.', max: 3, rarity: 'common' },
  { id: 'rapid', name: 'RAPID CANNON', desc: 'Your cannon fires 18% faster.', max: 3, rarity: 'common' },
  { id: 'range', name: 'LONG BARREL', desc: 'Shots fly 25% farther.', max: 2, rarity: 'common' },
  { id: 'twin', name: 'TWIN CANNON', desc: 'A second barrel. Twice the lead.', max: 2, rarity: 'rare' },
  { id: 'impact', name: 'IMPACT BURST', desc: '+1 damage. Hits burst bigger.', max: 2, rarity: 'rare' },
  { id: 'swift', name: 'SWIFT WINGS', desc: 'Fly 12% faster.', max: 2, rarity: 'common' },
  { id: 'heart', name: 'EMBER HEART', desc: 'Mend one life. The star repays.', max: 3, rarity: 'common' },
  { id: 'magnet', name: 'MAGNET CORE', desc: 'Shards pull 60% farther.', max: 2, rarity: 'common' },
  { id: 'dash', name: 'QUICK DASH', desc: 'Your dash returns 30% sooner.', max: 2, rarity: 'rare' },
  { id: 'flame', name: 'COMBO FLAME', desc: 'Your chain burns 1s longer.', max: 2, rarity: 'epic' },
];

export const RARITY = {
  common: { label: 'COMMON', color: '#b8a894' },
  rare: { label: 'RARE', color: '#ff9e00' },
  epic: { label: 'EPIC', color: '#c77dff' },
};

/** Eight feats, tracked across runs and kept in localStorage (profile state, never wiped). */
export const FEATS = [
  { id: 'first-light', name: 'FIRST LIGHT', desc: 'Hold night 1' },
  { id: 'warden-slayer', name: 'WARDEN SLAYER', desc: 'Fell a Night Warden' },
  { id: 'void-king', name: 'VOID KING', desc: 'Felled the Void King' },
  { id: 'flawless', name: 'FLAWLESS NIGHT', desc: 'A night without a single hit' },
  { id: 'chain-40', name: 'CHAIN 40', desc: 'A 40-kill chain' },
  { id: 'rich-keeper', name: 'RICH KEEPER', desc: '25,000 points in one run' },
  { id: 'full-build', name: 'FULL BUILD', desc: 'Six boons at once' },
  { id: 'inferno-keeper', name: 'INFERNO KEEPER', desc: 'Won on Inferno' },
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
  player: '#7df9ff',
  playerCore: '#eafcff',
  bullet: '#ffe66d',
  shard: '#ffd166',
  shardCore: '#fff3c4',
  // Fix v8: warm ember identity, panels are dark plum-brown, not cold navy;
  // gold is score/grade, ember orange is danger/boss, starlight is body text,
  // warm grey is only for truly secondary info. No more cyan-on-navy default.
  panel: '#171019',
  panelEdge: '#3a2a1e',
  panelDeep: '#120d12',
  ember: '#ff7a00',
  emberDeep: '#e85d04',
  gold: '#ffd166',
  text: '#f2f5ff',
  muted: '#b8a894',
  danger: '#ff5964',
  good: '#7dff9e',
  dash: '#7df9ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
/** Unlocked feats, as a JSON array of feat ids. */
export const FEATS_KEY = 'emberfall.feats';
/** Set to '1' once the star has been relit: Endless mode unlocks. */
export const WON_KEY = 'emberfall.won';
/** The last run, as JSON {score, wave, won, difficulty}. */
export const LAST_KEY = 'emberfall.last';
