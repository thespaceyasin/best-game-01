// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (keep clear
// of the nearest threat, chase the lowest shard when that is safe, dash out when cornered),
// so the frame is what a short game really looks like and the same seed always gives the
// same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 300;
/** The end scene plays well first, then its pilot tires and stops shooting: the game
 *  over screen then shows a real score and wave, not a first-wave death. */
const END_STRONG_SECONDS = 70;
/**
 * How far ahead, in seconds, the autopilot checks a threat: the play scene's pilot looks
 * well ahead and keeps all its lives; the end scene's looks only a moment ahead and never
 * dashes, so it is caught out once the waves speed up, as a hurried player is.
 */
const HORIZON_PLAY = 0.7;
const THREAT_RADIUS = 260;
const DASH_RADIUS = 95;

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
 * One control frame for the autopilot: steer away from a close threat, else toward the
 * nearest shard, else drift to the centre; aim at the nearest enemy and hold fire.
 */
function autopilot(state, horizon, canDash) {
  const player = state.player;
  const threat = nearestThreat(state);
  // A short horizon sees danger late: the end scene's pilot reacts only when a threat is
  // almost on top of it.
  const radius = THREAT_RADIUS * (horizon / HORIZON_PLAY);
  let steerX = 0;
  let steerY = 0;
  if (threat.enemy !== null && threat.distance < radius) {
    // Flee: away from the threat, biased by how close it is.
    const away = Math.max(0.2, 1 - threat.distance / radius);
    steerX = ((player.x - threat.enemy.x) / (threat.distance || 1)) * away;
    steerY = ((player.y - threat.enemy.y) / (threat.distance || 1)) * away;
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
  const aim = threat.enemy !== null ? threat.enemy : { x: player.x, y: player.y - 100 };
  return {
    steerX,
    steerY,
    aimX: aim.x,
    aimY: aim.y,
    aimInside: threat.enemy !== null,
    firing: true,
    dash: canDash && threat.enemy !== null && threat.distance < DASH_RADIUS && player.dashCooldown <= 0,
  };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      const control = autopilot(world.state, HORIZON_PLAY, true);
      if (world.step(STEP, control, false) & EVENT_OVER) break;
      // Stop on a busy mid-wave frame: at least 15 s in, three or more enemies up, so the
      // shot shows the fight, not the quiet moment after a wave clears.
      if (world.state.elapsed >= 15) {
        let count = 0;
        for (const e of world.state.enemies) if (e.active) count += 1;
        if (count >= 3) break;
      }
    }
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // End: a real game first (strong pilot), then the pilot tires — it stops shooting and
  // steers into the nearest threat — so the run ends on the game over screen with a score.
  let over = false;
  for (let index = 0; index < END_STRONG_SECONDS / STEP; index += 1) {
    const control = autopilot(world.state, HORIZON_PLAY, true);
    if (world.step(STEP, control, false) & EVENT_OVER) {
      over = true;
      break;
    }
  }
  if (!over) {
    for (let index = 0; index < (END_LIMIT_SECONDS - END_STRONG_SECONDS) / STEP; index += 1) {
      const player = world.state.player;
      const threat = nearestThreat(world.state);
      let steerX = 0;
      let steerY = 0;
      if (threat.enemy !== null) {
        const d = threat.distance || 1;
        steerX = (threat.enemy.x - player.x) / d;
        steerY = (threat.enemy.y - player.y) / d;
      }
      const control = { steerX, steerY, aimX: player.x, aimY: player.y, aimInside: false, firing: false, dash: false };
      if (world.step(STEP, control, false) & EVENT_OVER) {
        over = true;
        break;
      }
    }
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
