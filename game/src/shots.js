// The screenshot scenes behind ?shot=start|play|boss|win. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot (flee
// every close threat, chase shards when safe, dash out when cornered), so the frame is
// what a real game looks like and the same seed always gives the same frame. The boss
// and win scenes play whole nights: the pilot takes the strongest offered boon after
// every cleared night, the way a good player would.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const BOSS_LIMIT_SECONDS = 300;
const WIN_LIMIT_SECONDS = 600;
const HORIZON_PLAY = 0.7;
const THREAT_RADIUS = 300;
const DASH_RADIUS = 110;

/** Boons in the order a strong run wants them: damage first, then firepower, then the rest. */
const BOON_ORDER = ['heavy', 'twin', 'rapid', 'pierce', 'range', 'swift', 'dash', 'magnet', 'flame', 'heart'];

/** The nearest enemy to the player, and how far away it is. */
function nearestThreat(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return { enemy: best, distance: bestD };
}

function nearestShard(state) {
  let best = null;
  let bestD = Infinity;
  for (const s of state.shards) {
    if (!s.active) continue;
    const d = Math.hypot(s.x - state.player.x, s.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * One control frame for the autopilot: flee from every close threat at once (a summed
 * push, so two enemies on both sides do not cancel out), else toward the nearest shard,
 * else drift to the centre; aim at the boss first, then the nearest enemy; hold fire.
 */
function autopilot(state, horizon, canDash) {
  const player = state.player;
  const threat = nearestThreat(state);
  const radius = THREAT_RADIUS * (horizon / HORIZON_PLAY);
  let steerX = 0;
  let steerY = 0;
  let close = false;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < radius) {
      close = true;
      const away = 1 - d / radius;
      steerX += (dx / d) * away;
      steerY += (dy / d) * away;
    }
  }
  if (close) {
    // Keep off the walls while fleeing: steer back in from the edges.
    if (player.x < 120) steerX += 0.6;
    if (player.x > FIELD.width - 120) steerX -= 0.6;
    if (player.y < 120) steerY += 0.6;
    if (player.y > FIELD.height - 120) steerY -= 0.6;
  } else {
    const shard = nearestShard(state);
    const target = shard !== null ? shard : { x: FIELD.width / 2, y: FIELD.height / 2 };
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const len = Math.hypot(dx, dy);
    if (len > 24) {
      steerX = dx / len;
      steerY = dy / len;
    }
  }
  const boss = state.boss !== null && state.boss.active ? state.boss : null;
  const aim = boss !== null ? boss : threat.enemy !== null ? threat.enemy : { x: player.x, y: player.y - 100 };
  return {
    steerX,
    steerY,
    aimX: aim.x,
    aimY: aim.y,
    aimInside: aim !== null && (boss !== null || threat.enemy !== null),
    firing: true,
    dash: canDash && threat.enemy !== null && threat.distance < DASH_RADIUS && player.dashCooldown <= 0,
  };
}

/** After a cleared night, take the strongest offered boon. Returns true if a draft was open. */
function maybeDraft(world) {
  if (world.state.waveState !== 'draft' || world.state.draft.length === 0) return false;
  let pick = world.state.draft[0];
  for (const want of BOON_ORDER) {
    if (world.state.draft.includes(want)) {
      pick = want;
      break;
    }
  }
  world.applyBoon(pick);
  return true;
}

/**
 * Step the world with the strong pilot until `stop` says so or the step cap is hit.
 * Returns the last events seen (EVENT_OVER / EVENT_WIN when the run ended).
 */
function playUntil(world, seconds, stop) {
  const cap = Math.floor(seconds / STEP);
  let events = 0;
  for (let index = 0; index < cap; index += 1) {
    const control = autopilot(world.state, HORIZON_PLAY, true);
    events = world.step(STEP, control, false);
    if (events & EVENT_OVER) return events;
    if (events & EVENT_WIN) return events;
    // Check the stop before the draft is auto-picked: a draft scene must catch the
    // draft while its three cards are still on offer.
    if (stop !== null && stop(world.state)) return events;
    maybeDraft(world);
  }
  return events;
}

function countEnemies(state) {
  let count = 0;
  for (const e of state.enemies) if (e.active) count += 1;
  return count;
}

/**
 * Set `world` to the named scene (start, play, boss or win; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'win') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    const events = playUntil(world, PLAY_SECONDS, (state) => {
      // Stop on a busy mid-wave frame: at least 15 s in, three or more enemies up, so the
      // shot shows the fight, not the quiet moment after a wave clears.
      return state.elapsed >= 15 && countEnemies(state) >= 3;
    });
    const over = (events & EVENT_OVER) !== 0 || world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'boss') {
    // Play through nights 1-2, then stop a few seconds into the first Warden fight: the
    // boss is on screen, hurt, with its health bar and name showing.
    let bossSince = -1;
    const events = playUntil(world, BOSS_LIMIT_SECONDS, (state) => {
      if (state.boss !== null && state.boss.active) {
        if (bossSince < 0) bossSince = state.elapsed;
        // The Warden walks in from above: wait until it is fully on screen (name label
        // and crown clear of the top edge) as well as hurt.
        return state.boss.hp < state.boss.maxHp && state.boss.y > 140 && state.elapsed - bossSince >= 2.5;
      }
      bossSince = -1;
      return false;
    });
    const over = (events & EVENT_OVER) !== 0 || world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // Win: play the whole run. The strong pilot plus the best boons each night is what a
  // good player does; if it falls short, the scene is a late-night fight, not a fake win.
  const events = playUntil(world, WIN_LIMIT_SECONDS, null);
  if ((events & EVENT_WIN) !== 0 || world.state.won) {
    return { screen: SCREEN_WIN, best: world.state.score };
  }
  const over = (events & EVENT_OVER) !== 0 || world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
