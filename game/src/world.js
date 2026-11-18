// The game's rules and state, with no drawing and no browser in it: the player ship, the
// nine nights, the Night Wardens (bosses), the ember-boon draft, bullets, star shards,
// power-ups and particles, collisions, score, combo and lives. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sounds,
// announcements) without the world knowing about screens or audio.
// Nothing here allocates after createWorld returns: every pool is fixed at boot.

import { BOONS, BOSS, BOSS_NIGHTS, COMBO, DIFFICULTY, ENEMY, FIELD, LIVES, MAX_LIVES, NIGHTS, PALETTE, PARTICLE, PLAYER, POWERUP, SHARD, STARS, WAVE, WAVE_COST, lateNightHpScale } from './config.js';
import { createRandom, pickWeighted } from './random.js';

/** What felled the keeper, for the death screen (roguelike: seed, depth, cause). */
const DEATH_NAMES = {
  drifter: 'AN EMBER DRIFTER', dart: 'AN EMBER DART', spinner: 'A SPINNER',
  splitter: 'A SPLITTER', wisp: 'A WISP', brute: 'A BRUTE',
};

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_PICKUP = 8;
export const EVENT_POWERUP = 16;
export const EVENT_SHOOT = 32;
export const EVENT_DASH = 64;
export const EVENT_BOSS = 128;
export const EVENT_WIN = 256;
export const EVENT_BOON = 512;

const KIND_DRIFTER = 'drifter';
const KIND_DART = 'dart';
const KIND_SPINNER = 'spinner';
const KIND_SPLITTER = 'splitter';
const KIND_WISP = 'wisp';
const KIND_BRUTE = 'brute';
const KIND_BOSS = 'boss';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function defaultStats() {
  return {
    damage: PLAYER.bulletDamage,
    fireInterval: PLAYER.fireInterval,
    fireRange: PLAYER.fireRange,
    bulletSpeed: PLAYER.bulletSpeed,
    maxSpeed: PLAYER.maxSpeed,
    shots: 1,
    impact: 0,
    magnetRadius: SHARD.magnetRadius,
    dashCooldown: PLAYER.dashCooldown,
    comboWindow: COMBO.window,
  };
}

export function createWorld(random, options = {}) {
  const difficulty = DIFFICULTY[options.difficulty] ?? DIFFICULTY.ember;
  const endless = options.endless === true;
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    fireTimer: 0, muzzle: 0, dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    invulnerable: 0, shield: false, rapidTimer: 0, magnetTimer: 0,
    stats: defaultStats(),
  };
  const enemies = [];
  for (let i = 0; i < WAVE.maxConcurrent; i += 1) {
    enemies.push({ active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 16, speed: 90, score: 10, shards: 1, age: 0, phase: 0, name: '', minionTimer: 0, flash: 0 });
  }
  const bullets = [];
  for (let i = 0; i < 64; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, style: 'orb' });
  const shards = [];
  for (let i = 0; i < 64; i += 1) shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const powerups = [];
  for (let i = 0; i < 8; i += 1) powerups.push({ active: false, kind: 'shield', x: 0, y: 0, life: 0 });
  const particles = [];
  for (let i = 0; i < PARTICLE.max; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }
  // Floating score popups: a kill writes '+50' where it happened, rising and fading.
  const popups = [];
  for (let i = 0; i < 24; i += 1) {
    popups.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 0.9, color: '#ffe66d', size: 18 });
  }
  // Impact rings: a hit spawns one expanding ring at the impact point (game-feel:
  // the ring is sim state, like a particle, so staged frames stay deterministic).
  const rings = [];
  for (let i = 0; i < 16; i += 1) {
    rings.push({ active: false, x: 0, y: 0, life: 0, maxLife: 0.28, size: 20 });
  }
  const stars = [];
  for (const layer of STARS) {
    for (let i = 0; i < layer.count; i += 1) {
      stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, factor: layer.factor, size: layer.min + random() * (layer.max - layer.min) });
    }
  }
  const queue = [];
  // The draft rolls on its own sub-seed, so how the player fights never shifts which
  // boons are offered (roguelike: one seed, per-purpose sub-seeds).
  const draftRandom = createRandom(Math.floor(random() * 4294967296));
  const state = {
    player, enemies, bullets, shards, powerups, particles, stars, popups, rings,
    queue,
    difficulty, endless, scoreMult: difficulty.scoreMult,
    score: 0, lives: LIVES, wave: 0, combo: 0, comboTimer: 0, mult: 1,
    elapsed: 0, kills: 0, waveState: 'breather', breatherTimer: 1.2, spawnTimer: 0,
    shake: 0, flash: 0, bannerText: '', bannerTimer: 0,
    draft: [], boons: {}, boss: null, bossSpec: null, bossPhase: 1, won: false, nightsCleared: 0, deathCause: '',
    queuedWave: 0, wardensSlain: 0, flawlessNights: 0,
    stats: { shots: 0, hits: 0, bestChain: 0, nightScores: [], hitsThisNight: 0, hitsTaken: 0 },
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.4;
      p.life = p.maxLife;
      p.size = 1.5 + random() * 2.5;
      p.color = color;
    }
  }

  /** One expanding impact ring at (x, y); size scales with the Impact Burst boon. */
  function spawnRing(x, y, size) {
    const slot = free(rings);
    if (slot === null) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.size = size;
    slot.life = slot.maxLife;
  }

  function addScore(base) {
    state.score += Math.round(base * state.mult * state.scoreMult);
  }

  /** A floating combat popup: '+50' where the kill happened, rising and fading. */
  function spawnPopup(x, y, text, color, size) {
    const slot = free(popups);
    if (slot === null) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.color = color;
    slot.size = size ?? 18;
    slot.life = slot.maxLife;
  }

  function chain() {
    state.combo += 1;
    state.comboTimer = player.stats.comboWindow;
    const before = state.mult;
    state.mult = 1 + Math.min(Math.floor(state.combo / COMBO.perStep), COMBO.maxMult - 1);
    if (state.combo > state.stats.bestChain) state.stats.bestChain = state.combo;
    if (state.mult > before) spawnPopup(player.x, player.y - 34, `CHAIN x${state.mult}`, '#ffd166', 22);
  }

  /** The Warden spec for a boss night; in Endless the three Wardens cycle. */
  function bossSpecFor(wave) {
    if (wave % 3 !== 0) return null;
    const cycle = [3, 6, 9];
    return BOSS[cycle[(wave / 3 - 1) % 3]];
  }

  function isBossNight(wave) {
    return wave % 3 === 0;
  }

  function spawnPoint() {
    // An edge point at least 240px from the player, so nothing appears on top of them.
    for (let tries = 0; tries < 6; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x;
      let y;
      if (edge === 0) { x = random() * FIELD.width; y = -30; } else if (edge === 1) { x = FIELD.width + 30; y = random() * FIELD.height; } else if (edge === 2) { x = random() * FIELD.width; y = FIELD.height + 30; } else { x = -30; y = random() * FIELD.height; }
      if (dist2(x, y, player.x, player.y) > 240 * 240) return { x, y };
    }
    return { x: FIELD.width / 2, y: -30 };
  }

  function spawnEnemy(kind) {
    const slot = free(enemies);
    if (slot === null) return null;
    const at = kind === KIND_BOSS ? { x: FIELD.width / 2, y: -70 } : spawnPoint();
    slot.active = true;
    slot.kind = kind;
    slot.x = at.x;
    slot.y = at.y;
    slot.age = 0;
    slot.phase = random() * Math.PI * 2;
    slot.minionTimer = 4;
    slot.flash = 0;
    if (kind === KIND_BOSS) {
      const spec = bossSpecFor(state.wave);
      slot.name = spec.name;
      slot.hp = Math.round(spec.hp * difficulty.hpMult);
      slot.maxHp = slot.hp;
      slot.radius = spec.radius;
      slot.speed = spec.speed * difficulty.speedMult;
      slot.score = spec.score;
      slot.shards = 8;
      slot.vx = 0;
      slot.vy = 0;
      state.boss = slot;
      state.bossSpec = spec;
      state.bossPhase = 1;
      return slot;
    }
    const spec = ENEMY[kind];
    slot.name = '';
    // Late nights (6-9) toughen every enemy on top of the difficulty.
    const hpScale = lateNightHpScale(state.wave) * difficulty.hpMult;
    slot.hp = Math.max(1, Math.round(spec.hp * hpScale));
    slot.maxHp = slot.hp;
    slot.radius = spec.radius;
    slot.speed = spec.speed * (1 + (state.wave - 1) * 0.045) * difficulty.speedMult;
    slot.score = spec.score;
    slot.shards = spec.shards;
    if (kind === KIND_DART) {
      // A dart commits to where the player was when it spawned.
      const dx = player.x - at.x;
      const dy = player.y - at.y;
      const len = Math.hypot(dx, dy) || 1;
      slot.vx = (dx / len) * slot.speed;
      slot.vy = (dy / len) * slot.speed;
    } else {
      slot.vx = 0;
      slot.vy = 0;
    }
    return slot;
  }

  function buildWave(number) {
    queue.length = 0;
    state.queuedWave = number;
    if (isBossNight(number)) {
      // A boss night: the Warden first, then a trickle of its minions.
      queue.push(KIND_BOSS);
      const minion = bossSpecFor(number).minion;
      for (let i = 0; i < 4 + number; i += 1) queue.push(minion);
      return;
    }
    let budget = 12 + number * 12;
    const table = [[10, KIND_DRIFTER]];
    if (number >= 2) {
      table.push([9, KIND_DART]);
      table.push([5, KIND_WISP]);
    }
    if (number >= 3) table.push([4, KIND_SPINNER]);
    if (number >= 4) {
      table.push([3, KIND_SPLITTER]);
      table.push([3, KIND_BRUTE]);
    }
    while (budget > 0) {
      const kind = pickWeighted(random, table);
      queue.push(kind);
      budget -= WAVE_COST[kind];
    }
    // Shuffle the queue so the night does not arrive in cost order.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
  }

  function startWave(number) {
    state.wave = number;
    // The wave was usually pre-built at the last draft pick, so the HUD's incoming
    // list could show it during the breather; only build it here if it was not.
    if (state.queuedWave !== number) buildWave(number);
    state.waveState = 'spawning';
    state.spawnTimer = 0.4;
    state.stats.hitsThisNight = 0;
    if (isBossNight(number)) {
      state.bannerText = `NIGHT ${number} · ${bossSpecFor(number).name}`;
    } else {
      state.bannerText = endless ? `NIGHT ${number}` : `NIGHT ${number} OF ${NIGHTS}`;
    }
    state.bannerTimer = 2.4;
  }

  /** Offer three boons the player has not maxed yet; the draft screen shows them. */
  function rollDraft() {
    const open = BOONS.filter((b) => (state.boons[b.id] ?? 0) < b.max);
    const picks = [];
    while (picks.length < 3 && open.length > 0) {
      const at = Math.floor(draftRandom() * open.length);
      picks.push(open.splice(at, 1)[0].id);
    }
    // If everything is maxed (late nights), a heart is always welcome.
    while (picks.length < 3) picks.push('heart');
    state.draft = picks;
    state.waveState = 'draft';
    // The draft screen has its own title: the night-clear banner must not linger over it.
    state.bannerTimer = 0;
    return picks;
  }

  /** Take one offered boon: apply it, then the next night begins after a breather. */
  function applyBoon(id) {
    const stats = player.stats;
    state.boons[id] = (state.boons[id] ?? 0) + 1;
    if (id === 'heavy') stats.damage += 1;
    else if (id === 'rapid') stats.fireInterval *= 0.82;
    else if (id === 'range') stats.fireRange *= 1.25;
    else if (id === 'twin') stats.shots += 1;
    else if (id === 'impact') { stats.damage += 1; stats.impact += 1; }
    else if (id === 'swift') stats.maxSpeed *= 1.12;
    else if (id === 'heart') state.lives = Math.min(MAX_LIVES, state.lives + 1);
    else if (id === 'magnet') stats.magnetRadius *= 1.6;
    else if (id === 'dash') stats.dashCooldown *= 0.7;
    else if (id === 'flame') stats.comboWindow += 1;
    state.draft = [];
    state.waveState = 'breather';
    state.breatherTimer = WAVE.breather;
    // Pre-build the next night now: the HUD's incoming list shows it during the breather.
    buildWave(state.wave + 1);
    return EVENT_BOON;
  }

  function dropShard(x, y) {
    const s = free(shards);
    if (s === null) return;
    const angle = random() * Math.PI * 2;
    s.active = true;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(angle) * (40 + random() * 90);
    s.vy = Math.sin(angle) * (40 + random() * 90);
    s.life = SHARD.life;
  }

  function maybeDropPowerup(x, y) {
    if (random() > POWERUP.dropChance) return;
    const p = free(powerups);
    if (p === null) return;
    p.active = true;
    p.kind = POWERUP.kinds[Math.floor(random() * POWERUP.kinds.length)];
    p.x = x;
    p.y = Math.min(y, FIELD.height - 100); // keep clear of the ability bar
    p.life = 10;
  }

  function killEnemy(slot, events) {
    slot.active = false;
    state.kills += 1;
    addScore(slot.score);
    chain();
    spawnPopup(slot.x, slot.y - 14, `+${Math.round(slot.score * state.mult * state.scoreMult)}`, '#ffe66d', 18);
    const color = slot.kind === KIND_BOSS ? (state.bossSpec ? state.bossSpec.color : '#7209b7') : ENEMY[slot.kind].color;
    burst(slot.x, slot.y, color, slot.kind === KIND_BOSS ? 40 : PARTICLE.deathBurst, slot.kind === KIND_BOSS ? 320 : 260);
    for (let i = 0; i < slot.shards; i += 1) dropShard(slot.x, slot.y);
    maybeDropPowerup(slot.x, slot.y);
    if (slot.kind === KIND_SPLITTER) {
      // A splitter breaks into two drifters where it died.
      for (let i = 0; i < 2; i += 1) {
        const child = free(enemies);
        if (child === null) break;
        const spec = ENEMY.drifter;
        child.active = true;
        child.kind = KIND_DRIFTER;
        child.x = slot.x + (i === 0 ? -14 : 14);
        child.y = slot.y;
        child.hp = spec.hp;
        child.maxHp = spec.hp;
        child.radius = spec.radius;
        child.speed = spec.speed * 1.15;
        child.score = spec.score;
        child.shards = spec.shards;
        child.age = 0;
        child.phase = random() * Math.PI * 2;
        child.vx = 0;
        child.vy = 0;
      }
    }
    if (slot.kind === KIND_BOSS) {
      state.boss = null;
      state.bossSpec = null;
      state.bossPhase = 1;
      state.wardensSlain += 1;
      state.lives = Math.min(MAX_LIVES, state.lives + 1);
      state.shake = 1;
      events |= EVENT_BOSS;
      // The night ends with its Warden: clear the field and the queue.
      for (const e of enemies) e.active = false;
      queue.length = 0;
      state.queuedWave = 0;
      if (!endless && state.wave >= NIGHTS) {
        // Night 9 counts in the report too, before the win is declared.
        state.nightsCleared = state.wave;
        state.stats.nightScores.push({ night: state.wave, score: state.score });
        state.won = true;
        events |= EVENT_WIN;
        return events;
      }
      state.nightsCleared = state.wave;
      state.stats.nightScores.push({ night: state.wave, score: state.score });
      if (state.stats.hitsThisNight === 0) state.flawlessNights += 1;
      addScore(WAVE.clearBonus * state.wave);
      state.bannerText = `${slot.name} FALLEN  +${WAVE.clearBonus * state.wave}`;
      state.bannerTimer = 2.2;
      rollDraft();
      return events;
    }
    return events;
  }

  function fireBullet(angle) {
    const b = free(bullets);
    if (b === null) return false;
    const nose = PLAYER.radius + 6;
    b.active = true;
    b.x = player.x + Math.cos(angle) * nose;
    b.y = player.y + Math.sin(angle) * nose;
    b.vx = Math.cos(angle) * player.stats.bulletSpeed;
    b.vy = Math.sin(angle) * player.stats.bulletSpeed;
    b.life = 0.9;
    // Cosmetic only: the shot's look follows the loadout, one coherent ember-orb
    // family (game-feel: a projectile must read at a glance). Colour/size only:
    // amber orb, cyan rapid orb, teal side orb, big heavy orb. No gameplay effect.
    const offAngle = Math.abs(angle - player.angle);
    if (player.rapidTimer > 0) b.style = 'orb-rapid';
    else if (offAngle > 0.05) b.style = 'orb-twin';
    else if (player.stats.damage >= 3) b.style = 'orb-heavy';
    else b.style = 'orb';
    return true;
  }

  function fireVolley(angle) {
    const shots = player.stats.shots;
    let fired = false;
    if (shots === 1) {
      fired = fireBullet(angle);
    } else if (shots === 2) {
      fired = fireBullet(angle - 0.09) || fired;
      fired = fireBullet(angle + 0.09) || fired;
    } else {
      fired = fireBullet(angle - 0.16) || fired;
      fired = fireBullet(angle) || fired;
      fired = fireBullet(angle + 0.16) || fired;
    }
    if (fired) {
      state.stats.shots += shots;
      player.muzzle = 0.07; // brief muzzle flash at the nose (game-feel, visual only)
    }
    return fired;
  }

  function nearestEnemy() {
    let best = null;
    let bestD = player.stats.fireRange * player.stats.fireRange;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = dist2(e.x, e.y, player.x, player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.fireTimer = 0;
    player.muzzle = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    player.shield = false;
    player.rapidTimer = 0;
    player.magnetTimer = 0;
    player.stats = defaultStats();
    for (const pool of [enemies, bullets, shards, powerups, particles, popups, rings]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.lives = LIVES;
    state.wave = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.mult = 1;
    state.elapsed = 0;
    state.kills = 0;
    state.waveState = 'breather';
    state.breatherTimer = 1.2;
    state.spawnTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.bannerText = '';
    state.bannerTimer = 0;
    state.draft = [];
    state.boons = {};
    state.boss = null;
    state.bossSpec = null;
    state.bossPhase = 1;
    state.won = false;
    state.nightsCleared = 0;
    state.deathCause = '';
    state.queuedWave = 0;
    state.wardensSlain = 0;
    state.flawlessNights = 0;
    state.stats = { shots: 0, hits: 0, bestChain: 0, nightScores: [], hitsThisNight: 0, hitsTaken: 0 };
  }

  /** Stars drift on their own, even while a draft is open. */
  function driftAmbient(dt) {
    for (const s of stars) {
      s.y += 6 * s.factor * dt;
      if (s.y > FIELD.height + 4) {
        s.y = -4;
        s.x = random() * FIELD.width;
      }
    }
    for (const p of popups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.y -= 34 * dt;
    }
  }

  /**
   * One fixed step. `control` is {steerX, steerY, aimX, aimY, firing, dash} (mouse aim) or
   * null for the title backdrop. With `harmless` set, things drift but nothing touches the
   * player and nothing scores: the title screen's live backdrop.
   */
  function step(dt, control, harmless) {
    let events = 0;
    state.elapsed += dt;
    // Trauma decays slowly, so a heavy hit still shakes a moment later; the renderer
    // squares it, so light hits barely move and heavy hits punch (game-feel).
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.mult = 1;
      }
    }
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.rapidTimer > 0) player.rapidTimer -= dt;
    if (player.magnetTimer > 0) player.magnetTimer -= dt;

    // During a draft the field holds still: shards and particles drift, nothing else moves.
    if (state.waveState === 'draft') {
      for (const p of particles) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-2.4 * dt);
        p.vy *= Math.exp(-2.4 * dt);
      }
      driftAmbient(dt);
      return events;
    }

    // Nights: breather, then spawn the queue, then wait for the field to clear.
    if (harmless) {
      // The title screen's live backdrop: a few drifters wander in and out, nothing more.
      state.spawnTimer -= dt;
      let count = 0;
      for (const e of enemies) if (e.active) count += 1;
      if (state.spawnTimer <= 0 && count < 6) {
        spawnEnemy(KIND_DRIFTER);
        state.spawnTimer = 1.4;
      }
    } else if (state.waveState === 'breather') {
      state.breatherTimer -= dt;
      if (state.breatherTimer <= 0) startWave(state.wave + 1);
    } else if (state.waveState === 'spawning') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && queue.length > 0) {
        spawnEnemy(queue.shift());
        state.spawnTimer = Math.max(0.25, 1.0 - state.wave * 0.06);
      }
      if (queue.length === 0) state.waveState = 'fighting';
    } else if (state.waveState === 'fighting') {
      let any = false;
      for (const e of enemies) if (e.active) { any = true; break; }
      if (!any) {
        state.nightsCleared = state.wave;
        state.stats.nightScores.push({ night: state.wave, score: state.score });
        if (state.stats.hitsThisNight === 0) state.flawlessNights += 1;
        addScore(WAVE.clearBonus * state.wave);
        state.bannerText = `NIGHT ${state.wave} HELD  +${WAVE.clearBonus * state.wave}`;
        state.bannerTimer = 2.2;
        events |= EVENT_WAVE;
        rollDraft();
      }
    }

    // Enemies move.

    // Player movement: acceleration with damping, or a dash burst.
    if (control !== null) {
      const len = Math.hypot(control.steerX, control.steerY);
      const sx = len > 0 ? control.steerX / len : 0;
      const sy = len > 0 ? control.steerY / len : 0;
      if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
        player.dashTimer = PLAYER.dashTime;
        player.dashCooldown = player.stats.dashCooldown;
        player.dashX = len > 0 ? sx : Math.cos(player.angle);
        player.dashY = len > 0 ? sy : Math.sin(player.angle);
        player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
        events |= EVENT_DASH;
      }
      if (player.dashTimer > 0) {
        player.dashTimer -= dt;
        player.vx = player.dashX * PLAYER.dashSpeed;
        player.vy = player.dashY * PLAYER.dashSpeed;
        burst(player.x, player.y, PALETTE.dash, 1, 60);
      } else {
        player.vx += sx * PLAYER.accel * dt;
        player.vy += sy * PLAYER.accel * dt;
        const damp = Math.exp(-PLAYER.damping * dt);
        player.vx *= damp;
        player.vy *= damp;
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > player.stats.maxSpeed) {
          player.vx = (player.vx / speed) * player.stats.maxSpeed;
          player.vy = (player.vy / speed) * player.stats.maxSpeed;
        }
      }
      player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
      player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

      // Aim: the mouse when it is over the field, else the nearest enemy, else travel.
      const target = nearestEnemy();
      if (control.aimInside) player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
      else if (target !== null) player.angle = Math.atan2(target.y - player.y, target.x - player.x);
      else if (len > 0) player.angle = Math.atan2(sy, sx);

      // Fire: the cannon auto-fires at the nearest enemy in range; holding fire aims at the mouse.
      player.fireTimer -= dt;
      if (player.muzzle > 0) player.muzzle -= dt;
      const interval = player.rapidTimer > 0 ? player.stats.fireInterval / 2 : player.stats.fireInterval;
      if (player.fireTimer <= 0) {
        if (control.firing) {
          if (fireVolley(player.angle)) {
            player.fireTimer = interval;
            events |= EVENT_SHOOT;
          }
        } else if (target !== null) {
          if (fireVolley(player.angle)) {
            player.fireTimer = interval;
            events |= EVENT_SHOOT;
          }
        }
      }
    }

    // Enemies move.
    for (const e of enemies) {
      if (!e.active) continue;
      e.age += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      if (e.kind === KIND_BOSS) {
        // A Warden lumbers after the keeper and calls its minions. It strides in
        // three times as fast until it is fully on the field, so the fight starts
        // with the Warden visible, not half off the top edge.
        const entry = e.y < 140 ? 3 : 1;
        e.vx += (dx / len) * e.speed * 2.4 * entry * dt;
        e.vy += (dy / len) * e.speed * 2.4 * entry * dt;
        const s = Math.hypot(e.vx, e.vy);
        if (s > e.speed * entry) {
          e.vx = (e.vx / s) * e.speed * entry;
          e.vy = (e.vy / s) * e.speed * entry;
        }
        e.minionTimer -= dt;
        if (e.minionTimer <= 0) {
          e.minionTimer = 5;
          let minions = 0;
          for (const other of enemies) if (other.active && other.kind !== KIND_BOSS) minions += 1;
          if (minions < 6) {
            const child = spawnEnemy(state.bossSpec.minion);
            if (child !== null) {
              child.x = e.x + (random() - 0.5) * 120;
              child.y = e.y + (random() - 0.5) * 120;
            }
          }
        }
      } else if (e.kind === KIND_DRIFTER || e.kind === KIND_SPLITTER || e.kind === KIND_BRUTE) {
        e.vx += (dx / len) * e.speed * 2.4 * dt;
        e.vy += (dy / len) * e.speed * 2.4 * dt;
        const s = Math.hypot(e.vx, e.vy);
        if (s > e.speed) {
          e.vx = (e.vx / s) * e.speed;
          e.vy = (e.vy / s) * e.speed;
        }
      } else if (e.kind === KIND_DART) {
        // A dart never turns: it keeps the heading it spawned with.
      } else if (e.kind === KIND_SPINNER) {
        const wobble = Math.sin(e.age * 3 + e.phase) * 0.7;
        const px = -dy / len;
        const py = dx / len;
        e.vx = (dx / len) * e.speed + px * wobble * e.speed;
        e.vy = (dy / len) * e.speed + py * wobble * e.speed;
      } else if (e.kind === KIND_WISP) {
        // A wisp zigzags hard, changing its mind twice a second.
        const zig = Math.sin(e.age * 6 + e.phase) > 0 ? 1 : -1;
        const px = -dy / len;
        const py = dx / len;
        e.vx = (dx / len) * e.speed * 0.7 + px * zig * e.speed * 0.8;
        e.vy = (dy / len) * e.speed * 0.7 + py * zig * e.speed * 0.8;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Strayed far off the field (a dart that missed): recycle it so the night can end.
      if (e.x < -120 || e.x > FIELD.width + 120 || e.y < -120 || e.y > FIELD.height + 120) {
        if (e.kind === KIND_DART) e.active = false;
        else {
          e.x = Math.min(FIELD.width - 10, Math.max(10, e.x));
          e.y = Math.min(FIELD.height - 10, Math.max(10, e.y));
        }
      }
    }

    // Enemies push each other apart a little, so they do not stack into one blob.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          a.x -= dx * push * 0.5;
          a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5;
          b.y += dy * push * 0.5;
        }
      }
    }

    // Bullets fly, then hit, and stop. A bullet despawns on its FIRST hit and
    // never passes through an enemy (fix v4: no piercing anywhere in the game).
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + 4;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          // A Warden is beyond reach while it strides in (above y 140): bullets pass
          // through it, so the boss fight always starts with the Warden visible.
          if (e.kind === KIND_BOSS && e.y < 140) continue;
          const dmg = player.stats.damage;
          const impact = player.stats.impact;
          e.hp -= dmg;
          e.flash = e.kind === KIND_BOSS ? 0.06 : 0.1; // ~100 ms white flash; bosses
          // flash shorter/softer, or rapid fire would whitewash the 400-HP boss
          // permanently (a hit lands every ~0.11 s, the flash lasts 0.1 s).
          state.stats.hits += 1;
          // The Void King enrages at half health: faster, more minions, redder.
          if (e.kind === KIND_BOSS && state.bossPhase === 1 && e.hp <= e.maxHp / 2) {
            state.bossPhase = 2;
            e.speed *= 1.35;
            e.minionTimer = 2.5;
            state.bannerText = `${e.name} ENRAGED`;
            state.bannerTimer = 2.0;
          }
          // Hit feedback bundle (game-feel: several small responses on one event):
          // knockback along the bullet (scaled by Impact Burst), an expanding
          // ring, a starburst of sparks, a floating damage number, and a touch
          // of trauma shake. All of it is seeded-sim state, no Math.random here.
          e.x += b.vx * 0.004 * (1 + 0.5 * impact);
          e.y += b.vy * 0.004 * (1 + 0.5 * impact);
          burst(b.x, b.y, '#ffe66d', 6 + 4 * impact, 200);
          spawnRing(b.x, b.y, (e.kind === KIND_BOSS ? 30 : 18) + 6 * impact);
          spawnPopup(b.x, b.y - 12, `-${dmg}`, '#ffffff', 15);
          state.shake = Math.max(state.shake, 0.12);
          b.active = false; // never pierces: first hit ends the bullet
          if (e.hp <= 0) events = killEnemy(e, events);
          break;
        }
      }
      if (state.won) break;
    }

    // Shards drift, sparkle, and get collected (or pulled in by the magnet).
    for (const s of shards) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      const d = Math.hypot(player.x - s.x, player.y - s.y);
      if (player.magnetTimer > 0 && d < player.stats.magnetRadius) {
        s.vx += ((player.x - s.x) / (d || 1)) * 900 * dt;
        s.vy += ((player.y - s.y) / (d || 1)) * 900 * dt;
      } else {
        s.vx *= Math.exp(-2 * dt);
        s.vy *= Math.exp(-2 * dt);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!harmless && d < PLAYER.radius + SHARD.radius + 4) {
        s.active = false;
        addScore(SHARD.points);
        chain();
        burst(s.x, s.y, '#ffd166', 4, 140);
        events |= EVENT_PICKUP;
      }
    }

    // Power-ups drift down slowly and wait to be picked up.
    for (const p of powerups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.y += 26 * dt;
      // Never drift into the bottom ability bar: a powerup badge sitting on the
      // HUD reads as a broken button. Clamp above the bar (visual only).
      if (p.y > FIELD.height - 100) p.y = FIELD.height - 100;
      if (!harmless && dist2(p.x, p.y, player.x, player.y) < (PLAYER.radius + POWERUP.radius + 4) ** 2) {
        p.active = false;
        if (p.kind === 'shield') player.shield = true;
        else if (p.kind === 'rapid') player.rapidTimer = POWERUP.rapidTime;
        else player.magnetTimer = POWERUP.magnetTime;
        burst(p.x, p.y, '#7dff9e', 8, 160);
        events |= EVENT_POWERUP;
      }
    }

    // Enemies reaching the player.
    if (!harmless && control !== null && player.invulnerable <= 0) {
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + PLAYER.radius - 2;
        if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
          if (player.shield) {
            player.shield = false;
            player.invulnerable = 1.0;
            events = killEnemy(e, events);
            burst(player.x, player.y, '#7df9ff', PARTICLE.deathBurst, 240);
            state.shake = 0.5;
            events |= EVENT_HIT;
          } else {
            e.active = false;
            burst(e.x, e.y, e.kind === KIND_BOSS ? (state.bossSpec ? state.bossSpec.color : '#7209b7') : ENEMY[e.kind].color, PARTICLE.deathBurst, 240);
            state.lives -= 1;
            state.stats.hitsTaken += 1;
            state.stats.hitsThisNight += 1;
            state.deathCause = e.kind === KIND_BOSS ? e.name : (DEATH_NAMES[e.kind] ?? 'THE DARK');
            state.combo = 0;
            state.mult = 1;
            state.shake = 1;
            state.flash = 0.7;
            player.invulnerable = PLAYER.invulnerable;
            events |= EVENT_HIT;
            if (e.kind === KIND_BOSS) {
              // Touching a Warden hurts, but the Warden does not die to it.
              e.active = true;
              e.x = Math.min(FIELD.width - 10, Math.max(10, e.x + (e.x - player.x) * 0.5));
              e.y = Math.min(FIELD.height - 10, Math.max(10, e.y + (e.y - player.y) * 0.5));
            }
            if (state.lives <= 0) {
              events |= EVENT_OVER;
              burst(player.x, player.y, '#7df9ff', 40, 320);
              burst(player.x, player.y, '#ff5964', 30, 260);
            }
          }
          break;
        }
      }
    }

    // Particles fade; impact rings shrink out over their short life.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.4 * dt);
      p.vy *= Math.exp(-2.4 * dt);
    }
    for (const r of rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) r.active = false;
    }

    // The starfield drifts down slowly, wrapping around.
    driftAmbient(dt);

    return events;
  }

  /** Shot scenes only: pack the frame with extra enemies, shards and sparks. */
  function densifyField(enemyCount, shardCount) {
    const kinds = ['drifter', 'dart', 'spinner', 'splitter', 'wisp', 'brute'];
    for (let i = 0; i < enemyCount; i += 1) {
      const kind = kinds[Math.floor(random() * kinds.length)];
      const slot = spawnEnemy(kind);
      if (slot !== null) {
        slot.x = 80 + random() * (FIELD.width - 160);
        slot.y = 90 + random() * (FIELD.height - 260);
        // Keep the shot's top-right corner clear: the HUD's incoming list lives
        // there, and a spawned enemy on top of it reads as a layout bug.
        if (slot.x > 1040 && slot.y < 300) slot.y = 300 + random() * 160;
      }
    }
    for (let i = 0; i < shardCount; i += 1) {
      const sx = 80 + random() * (FIELD.width - 160);
      let sy = 90 + random() * (FIELD.height - 260);
      if (sx > 1040 && sy < 300) sy = 300 + random() * 160;
      dropShard(sx, sy);
    }
    for (let i = 0; i < 6; i += 1) {
      burst(120 + random() * (FIELD.width - 240), 120 + random() * (FIELD.height - 240), '#ffe66d', 6, 160);
    }
  }

  /** Feats earned on this run so far (checked at the win/loss screen). */
  function runFeats() {
    const earned = [];
    const s = state.stats;
    if (state.nightsCleared >= 1) earned.push('first-light');
    if (state.wardensSlain >= 1) earned.push('warden-slayer');
    if (state.won) earned.push('void-king');
    if (state.flawlessNights >= 1) earned.push('flawless');
    if (s.bestChain >= 40) earned.push('chain-40');
    if (state.score >= 25000) earned.push('rich-keeper');
    if (Object.keys(state.boons).length >= 6) earned.push('full-build');
    if (state.won && difficulty.id === 'inferno') earned.push('inferno-keeper');
    return earned;
  }

  reset();
  return { state, reset, step, startWave, applyBoon, rollDraft, densifyField, runFeats };
}
