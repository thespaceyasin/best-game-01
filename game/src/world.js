// The game's rules and state, with no drawing and no browser in it: the player ship, the
// enemy waves, bullets, star shards, power-ups and particles, collisions, score, combo and
// lives. step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (sounds, announcements) without the world knowing about screens or audio.
// Nothing here allocates after createWorld returns: every pool is fixed at boot.

import { COMBO, ENEMY, FIELD, LIVES, PALETTE, PARTICLE, PLAYER, POWERUP, SHARD, STARS, WAVE, WAVE_COST } from './config.js';
import { pickWeighted } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_PICKUP = 8;
export const EVENT_POWERUP = 16;
export const EVENT_SHOOT = 32;
export const EVENT_DASH = 64;

const KIND_DRIFTER = 'drifter';
const KIND_DART = 'dart';
const KIND_SPINNER = 'spinner';
const KIND_SPLITTER = 'splitter';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    invulnerable: 0, shield: false, rapidTimer: 0, magnetTimer: 0,
  };
  const enemies = [];
  for (let i = 0; i < WAVE.maxConcurrent; i += 1) {
    enemies.push({ active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, radius: 16, speed: 90, score: 10, shards: 1, age: 0, phase: 0 });
  }
  const bullets = [];
  for (let i = 0; i < 48; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const shards = [];
  for (let i = 0; i < 64; i += 1) shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const powerups = [];
  for (let i = 0; i < 8; i += 1) powerups.push({ active: false, kind: 'shield', x: 0, y: 0, life: 0 });
  const particles = [];
  for (let i = 0; i < PARTICLE.max; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }
  const stars = [];
  for (const layer of STARS) {
    for (let i = 0; i < layer.count; i += 1) {
      stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, factor: layer.factor, size: layer.min + random() * (layer.max - layer.min) });
    }
  }
  const queue = [];
  const state = {
    player, enemies, bullets, shards, powerups, particles, stars,
    score: 0, lives: LIVES, wave: 0, combo: 0, comboTimer: 0, mult: 1,
    elapsed: 0, kills: 0, waveState: 'breather', breatherTimer: 1.2, spawnTimer: 0,
    shake: 0, flash: 0, bannerText: '', bannerTimer: 0,
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

  function addScore(base) {
    state.score += base * state.mult;
  }

  function chain() {
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.mult = 1 + Math.min(Math.floor(state.combo / COMBO.perStep), COMBO.maxMult - 1);
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
    if (slot === null) return;
    const spec = ENEMY[kind];
    const at = spawnPoint();
    slot.active = true;
    slot.kind = kind;
    slot.x = at.x;
    slot.y = at.y;
    slot.hp = spec.hp;
    slot.radius = spec.radius;
    slot.speed = spec.speed * (1 + (state.wave - 1) * 0.045);
    slot.score = spec.score;
    slot.shards = spec.shards;
    slot.age = 0;
    slot.phase = random() * Math.PI * 2;
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
  }

  function buildWave(number) {
    queue.length = 0;
    let budget = 6 + number * 6;
    const table = [[10, KIND_DRIFTER]];
    if (number >= 2) table.push([9, KIND_DART]);
    if (number >= 3) table.push([4, KIND_SPINNER]);
    if (number >= 4) table.push([3, KIND_SPLITTER]);
    while (budget > 0) {
      const kind = pickWeighted(random, table);
      queue.push(kind);
      budget -= WAVE_COST[kind];
    }
    // Shuffle the queue so the wave does not arrive in cost order.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
  }

  function startWave(number) {
    state.wave = number;
    buildWave(number);
    state.waveState = 'spawning';
    state.spawnTimer = 0.4;
    state.bannerText = `WAVE ${number}`;
    state.bannerTimer = 2.0;
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
    p.y = y;
    p.life = 10;
  }

  function killEnemy(slot, events) {
    slot.active = false;
    state.kills += 1;
    addScore(slot.score);
    chain();
    burst(slot.x, slot.y, ENEMY[slot.kind].color, PARTICLE.deathBurst, 260);
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
    return events;
  }

  function fireBullet(angle) {
    const b = free(bullets);
    if (b === null) return false;
    const nose = PLAYER.radius + 6;
    b.active = true;
    b.x = player.x + Math.cos(angle) * nose;
    b.y = player.y + Math.sin(angle) * nose;
    b.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    b.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    b.life = 0.9;
    return true;
  }

  function nearestEnemy() {
    let best = null;
    let bestD = PLAYER.fireRange * PLAYER.fireRange;
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
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    player.shield = false;
    player.rapidTimer = 0;
    player.magnetTimer = 0;
    for (const pool of [enemies, bullets, shards, powerups, particles]) {
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
  }

  /**
   * One fixed step. `control` is {steerX, steerY, aimX, aimY, firing, dash} (mouse aim) or
   * null for the title backdrop. With `harmless` set, things drift but nothing touches the
   * player and nothing scores: the title screen's live backdrop.
   */
  function step(dt, control, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
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

    // Waves: breather, then spawn the queue, then wait for the field to clear.
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
        state.spawnTimer = Math.max(0.18, 0.85 - state.wave * 0.06);
      }
      if (queue.length === 0) state.waveState = 'fighting';
    } else if (state.waveState === 'fighting') {
      let any = false;
      for (const e of enemies) if (e.active) { any = true; break; }
      if (!any) {
        addScore(WAVE.clearBonus * state.wave);
        state.bannerText = `WAVE ${state.wave} CLEARED  +${WAVE.clearBonus * state.wave}`;
        state.bannerTimer = 2.2;
        state.waveState = 'breather';
        state.breatherTimer = WAVE.breather;
        events |= EVENT_WAVE;
      }
    }

    // Player movement: acceleration with damping, or a dash burst.
    if (control !== null) {
      const len = Math.hypot(control.steerX, control.steerY);
      const sx = len > 0 ? control.steerX / len : 0;
      const sy = len > 0 ? control.steerY / len : 0;
      if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
        player.dashTimer = PLAYER.dashTime;
        player.dashCooldown = PLAYER.dashCooldown;
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
        if (speed > PLAYER.maxSpeed) {
          player.vx = (player.vx / speed) * PLAYER.maxSpeed;
          player.vy = (player.vy / speed) * PLAYER.maxSpeed;
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
      const interval = player.rapidTimer > 0 ? PLAYER.fireInterval / 2 : PLAYER.fireInterval;
      if (player.fireTimer <= 0) {
        if (control.firing) {
          if (fireBullet(player.angle)) {
            player.fireTimer = interval;
            events |= EVENT_SHOOT;
          }
        } else if (target !== null) {
          if (fireBullet(player.angle)) {
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
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      if (e.kind === KIND_DRIFTER || e.kind === KIND_SPLITTER) {
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
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Strayed far off the field (a dart that missed): recycle it so the wave can end.
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

    // Bullets fly, then hit.
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
          b.active = false;
          e.hp -= PLAYER.bulletDamage;
          burst(b.x, b.y, '#ffe66d', 3, 120);
          if (e.hp <= 0) events = killEnemy(e, events);
          break;
        }
      }
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
      if (player.magnetTimer > 0 && d < SHARD.magnetRadius) {
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
            burst(e.x, e.y, ENEMY[e.kind].color, PARTICLE.deathBurst, 240);
            state.lives -= 1;
            state.combo = 0;
            state.mult = 1;
            state.shake = 1;
            state.flash = 0.7;
            player.invulnerable = PLAYER.invulnerable;
            events |= EVENT_HIT;
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

    // Particles fade.
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

    // The starfield drifts down slowly, wrapping around.
    for (const s of stars) {
      s.y += 6 * s.factor * dt;
      if (s.y > FIELD.height + 4) {
        s.y = -4;
        s.x = random() * FIELD.width;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, startWave };
}
