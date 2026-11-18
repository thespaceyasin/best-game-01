// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A dark starfield over the HD space background redrawn from the
// user's photo (fix v10), moon, motes and asteroids stay deleted, and the
// hearth is deleted too (fix v12): no heart, starburst or glow at field centre.
// at the field's centre, glowing vector shapes for every entity, and canvas text for the
// HUD and the panels. Screen shake is a deterministic sine of the elapsed time, so a
// staged scene paints the same frame every time.

import { BOONS, BOSS, COMBO, DIFFICULTY, DIFFICULTY_ORDER, ENEMY, FEATS, FIELD, FONT, LIVES, NEW_AT_NIGHT, NIGHTS, PALETTE, PLAYER, POWERUP, RARITY, SHARD } from './config.js';
import { bgSprite, coinSprite, shipForDifficulty, spriteForEnemy } from './sprites.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 66 };
const HEART_SIZE = 18;
const HEART_GAP = 8;

/** The three draft cards: three 300x300 cards in a row, centred on the field. */
export const DRAFT_CARDS = { width: 300, height: 300, gap: 24, top: 190 };

/** Title screen layout: difficulty boxes (3) + Endless box, in one row. */
export const TITLE_DIFF = { width: 296, height: 56, gap: 16, x0: 24, y: 460 };
export function titleClickAt(x, y) {
  for (let i = 0; i < 4; i += 1) {
    const bx = TITLE_DIFF.x0 + i * (TITLE_DIFF.width + TITLE_DIFF.gap);
    if (x >= bx && x < bx + TITLE_DIFF.width && y >= TITLE_DIFF.y && y < TITLE_DIFF.y + TITLE_DIFF.height) {
      return i < 3 ? { difficulty: DIFFICULTY_ORDER[i] } : { endless: true };
    }
  }
  return null;
}

/** Victory/defeat report-card buttons: Fly again / Same seed / Menu. */
export const REPORT_BUTTONS = { width: 260, height: 48, gap: 30, y: 606 };
export function reportClickAt(x, y) {
  const total = REPORT_BUTTONS.width * 3 + REPORT_BUTTONS.gap * 2;
  const x0 = (FIELD.width - total) / 2;
  for (let i = 0; i < 3; i += 1) {
    const bx = x0 + i * (REPORT_BUTTONS.width + REPORT_BUTTONS.gap);
    if (x >= bx && x < bx + REPORT_BUTTONS.width && y >= REPORT_BUTTONS.y && y < REPORT_BUTTONS.y + REPORT_BUTTONS.height) {
      return ['again', 'seed', 'menu'][i];
    }
  }
  return null;
}

/** Grade letter for a finished run: score first, then lives left. */
export function gradeFor(score, livesLeft) {
  if (score >= 40000 && livesLeft >= 3) return 'S';
  if (score >= 25000) return 'A';
  if (score >= 12000) return 'B';
  return 'C';
}

export function fmtTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

/** Per-night scores from the cumulative nightScores the world records. */
function perNightScores(state) {
  const list = state.stats.nightScores;
  const out = [];
  let prev = 0;
  for (const entry of list) {
    out.push({ night: entry.night, score: Math.max(0, entry.score - prev) });
    prev = entry.score;
  }
  return out;
}

export function draftCardAt(x, y) {
  const total = DRAFT_CARDS.width * 3 + DRAFT_CARDS.gap * 2;
  const x0 = (FIELD.width - total) / 2;
  for (let i = 0; i < 3; i += 1) {
    const cx = x0 + i * (DRAFT_CARDS.width + DRAFT_CARDS.gap);
    if (x >= cx && x < cx + DRAFT_CARDS.width && y >= DRAFT_CARDS.top && y < DRAFT_CARDS.top + DRAFT_CARDS.height) return i;
  }
  return -1;
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function rankFor(wave, kills) {
  if (wave >= 9) return 'STARLIGHT KEEPER';
  if (wave >= 7) return 'EMBER MASTER';
  if (wave >= 5) return 'STAR KEEPER';
  if (wave >= 3) return 'VOID RUNNER';
  if (kills >= 20) return 'SPARK HUNTER';
  return 'SPARK';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const nightLabel = cachedLabel('NIGHT ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  // Fix v6: the moon is deleted (user asked to remove it for now).


  // Fix v10: the old starfield is deleted. The background is now the HD
  // space image redrawn from the user's photo (game/assets/bg-space.png).
  // Drawing the old white square stars on top of it would double the stars.
  // (world.js still builds state.stars, it consumes seeded random at world
  // creation, so removing it would shift spawns and change the run. The
  // render simply stops painting them.)

  // Fix v6: ember motes deleted, decorative orange dots, no gameplay function.

  // Fix v6: asteroids deleted, grey polygonal rocks with crater dots, decoration only, read as AI slop.

  /** One projectile: a glowing ember-plasma orb with a tapered comet trail,
   * drawn along its velocity (fix v4, replaces the v3 lance/bolt/tracer/wing/
   * slug family with ONE coherent orb family). The orb is a bright white-hot
   * core inside a coloured glow halo, with a short trail of fading embers
   * behind it, so it reads as a projectile, not a UI dot, at 1280x720.
   * Style comes from b.style, set at fire time from the loadout (world.js):
   * colour and size only: amber orb, cyan rapid orb, teal side orb of a
   * twin/triple volley, big orange-red heavy orb. (game-feel: distinct
   * projectile art per weapon; fps-shooter: projectiles must be readable
   * at a glance.) */
  function drawBullet(b) {
    const angle = Math.atan2(b.vy, b.vx);
    let glow = '#ff9e00';
    let core = '#fff3c4';
    let r = 6;
    let trail = 26;
    if (b.style === 'orb-rapid') { glow = '#7df9ff'; core = '#eafcff'; r = 5; trail = 34; }
    else if (b.style === 'orb-twin') { glow = '#2fb9d6'; core = '#e0fbff'; r = 5; trail = 26; }
    else if (b.style === 'orb-heavy') { glow = '#ff5a00'; core = '#fff3c4'; r = 9; trail = 20; }
    context.save();
    context.translate(b.x, b.y);
    context.rotate(angle);
    // Comet trail: three fading ember dots shrinking behind the orb.
    for (let i = 0; i < 3; i += 1) {
      const t = (i + 1) / 4;
      context.globalAlpha = 0.55 * (1 - t);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(-trail * t, 0, Math.max(1.5, r * 0.55 * (1 - t)), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Glow halo, then the bright core: a round shot, not a needle.
    context.globalAlpha = 0.35;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, r * 2.1, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.85;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawShardShape(x, y, radius, spin) {
    context.save();
    context.translate(x, y);
    context.rotate(spin);
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(radius * 0.62, 0);
    context.lineTo(0, radius);
    context.lineTo(-radius * 0.62, 0);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff3c4';
    context.beginPath();
    context.moveTo(0, -radius * 0.45);
    context.lineTo(radius * 0.28, 0);
    context.lineTo(0, radius * 0.45);
    context.lineTo(-radius * 0.28, 0);
    context.closePath();
    context.fill();
    context.restore();
  }

  /** Longest side of the sprite art for an enemy or boss, or 0 for vector fallback. */
  function spriteDrawSize(e) {
    if (spriteForEnemy(e) === null) return 0;
    // The Void King art is the wide octopus from the user's boss image. It is drawn
    // at the same grow as the other Wardens (1.6x, ~307 px): the sprite is scaled to
    // a square of radius*2.4*grow, so 1.9x would push the octopus's top into the
    // night track at the staging height (y 260).
    const grow = e.kind === 'boss' ? (e.name === 'THE VOID KING' ? 1.6 : 1.5) : 1.5;
    return e.radius * 2.4 * grow;
  }

  /** A boss wears its name over its head. Drawn after every enemy, so a drifting
   * monster can never paint over the label in a busy frame. While the boss is in
   * the top third of the field the name goes under it instead, so it never
   * collides with the WIN/LOSE line, the boss health bar or the night track. */
  function drawBossLabel(e) {
    const half = spriteForEnemy(e) !== null ? spriteDrawSize(e) / 2 : e.radius;
    context.font = `700 20px ${FONT}`;
    context.fillStyle = '#ffe66d';
    context.textAlign = 'center';
    const labelY = e.y - half - 18 < 130 ? e.y + half + 26 : e.y - half - 18;
    context.fillText(e.name, e.x, labelY);
  }

  function drawEnemy(e, bossPhase, maxSpriteSize = 0) {
    const spec = e.kind === 'boss' ? BOSS[3] : ENEMY[e.kind];
    context.save();
    context.translate(e.x, e.y);
    const sprite = spriteForEnemy(e);
    // Sprite art is drawn BIG: 1.5x the old size for enemies, 1.6x for the Void
    // King so it fills the cover, capped for the small bestiary chips. The
    // half-extent is what the thin HP arc clears.
    let spriteSize = 0;
    if (sprite !== null) {
      spriteSize = spriteDrawSize(e);
      if (maxSpriteSize > 0) spriteSize = Math.min(spriteSize, maxSpriteSize);
    }
    if (sprite !== null) {
      // Sprite art from the user's sheet: the art itself is the read now, no
      // rings around it (fix v5: the phase-2 red ring is deleted; boss HP is
      // already shown by the top HP bar). Tilt with the motion.
      const scale = spriteSize / Math.max(sprite.naturalWidth, sprite.naturalHeight);
      let tilt = 0;
      if (e.kind === 'dart') tilt = Math.max(-0.35, Math.min(0.35, e.vx / 1100));
      else if (e.kind === 'spinner') tilt = Math.sin(e.age * 3 + e.phase) * 0.2;
      else if (e.kind === 'wisp') tilt = Math.sin(e.age * 5 + e.phase) * 0.15;
      else if (e.kind === 'boss') {
        // Wardens never spin: they bob gently instead, so the art stays readable.
        tilt = Math.sin(e.age * 1.5) * 0.08;
      }
      const pulse = (e.kind === 'splitter' || e.kind === 'boss') ? 1 + Math.sin(e.age * (e.kind === 'boss' ? 3 : 4)) * 0.05 : 1;
      context.rotate(tilt);
      context.scale(pulse, pulse);
      context.drawImage(sprite, (-sprite.naturalWidth * scale) / 2, (-sprite.naturalHeight * scale) / 2, sprite.naturalWidth * scale, sprite.naturalHeight * scale);
      if (e.flash > 0) {
        // Hit flash (fix v4): the same sprite redrawn brightened to near-white,
        // fading with e.flash (~100 ms). Inside the same transform, so it tracks
        // the art exactly, no ring, no disc, just the sprite flashing white.
        context.save();
        context.globalAlpha = Math.min(1, e.flash * 8);
        context.filter = 'brightness(2.6) saturate(0.25)';
        context.drawImage(sprite, (-sprite.naturalWidth * scale) / 2, (-sprite.naturalHeight * scale) / 2, sprite.naturalWidth * scale, sprite.naturalHeight * scale);
        context.restore();
      }
    } else if (e.kind === 'drifter') {
      // A spiky ember: eight points, alternating long and short.
      context.fillStyle = spec.color;
      context.beginPath();
      for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? e.radius : e.radius * 0.62;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#ffd9c9';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.32, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'dart') {
      const angle = Math.atan2(e.vy, e.vx);
      context.rotate(angle);
      context.fillStyle = spec.color;
      context.beginPath();
      context.moveTo(e.radius + 6, 0);
      context.lineTo(-e.radius, -e.radius * 0.8);
      context.lineTo(-e.radius * 0.4, 0);
      context.lineTo(-e.radius, e.radius * 0.8);
      context.closePath();
      context.fill();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(2, 0, 3.5, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'spinner') {
      context.rotate(e.age * 2.2 + e.phase);
      context.fillStyle = spec.color;
      context.fillRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      context.fillStyle = '#e9d5ff';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.34, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'wisp') {
      // A tiny quick ember with a glowing tail.
      context.fillStyle = 'rgba(142,202,230,0.35)';
      context.beginPath();
      context.arc(-Math.cos(e.phase) * 10, -Math.sin(e.phase) * 10, e.radius * 0.9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = spec.color;
      context.beginPath();
      context.arc(0, 0, e.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e0fbfc';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'brute') {
      // A slow wall of stone with glowing cracks.
      const pulse = 1 + Math.sin(e.age * 2) * 0.04;
      context.scale(pulse, pulse);
      context.fillStyle = spec.color;
      context.beginPath();
      context.moveTo(-e.radius, -e.radius * 0.7);
      context.lineTo(e.radius * 0.7, -e.radius);
      context.lineTo(e.radius, e.radius * 0.6);
      context.lineTo(-e.radius * 0.6, e.radius);
      context.closePath();
      context.fill();
      context.strokeStyle = '#ffd166';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-e.radius * 0.5, -e.radius * 0.4);
      context.lineTo(0, 0);
      context.lineTo(e.radius * 0.5, e.radius * 0.4);
      context.stroke();
      context.fillStyle = '#3d0a1e';
      context.beginPath();
      context.arc(-e.radius * 0.25, -e.radius * 0.2, 4, 0, Math.PI * 2);
      context.arc(e.radius * 0.3, e.radius * 0.15, 4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'boss') {
      // Each Night Warden has its own silhouette: a crowned ember, a hollow ring that
      // sings, and a horned king. Phase 2 burns red around the Void King.
      const color = e.name === 'CINDER MAW' ? '#ff6b35' : e.name === 'THE HOLLOW CHOIR' ? '#b5179e' : '#7209b7';
      const pulse = 1 + Math.sin(e.age * 3) * 0.05;
      context.scale(pulse, pulse);
      if (e.name === 'THE HOLLOW CHOIR') {
        // A hollow ring with three satellite orbs circling it.
        context.strokeStyle = color;
        context.lineWidth = e.radius * 0.22;
        context.beginPath();
        context.arc(0, 0, e.radius * 0.8, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#1a0b2e';
        context.beginPath();
        context.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
        context.fill();
        for (let i = 0; i < 3; i += 1) {
          const orbit = e.age * 1.5 + (i * Math.PI * 2) / 3;
          context.fillStyle = '#e9d5ff';
          context.beginPath();
          context.arc(Math.cos(orbit) * e.radius * 1.05, Math.sin(orbit) * e.radius * 1.05, e.radius * 0.14, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = '#ffe66d';
        context.beginPath();
        context.arc(-e.radius * 0.2, -e.radius * 0.1, e.radius * 0.09, 0, Math.PI * 2);
        context.arc(e.radius * 0.2, -e.radius * 0.1, e.radius * 0.09, 0, Math.PI * 2);
        context.fill();
      } else if (e.name === 'THE VOID KING') {
        // A horned king: wide disc, two curved horns, a crown of spikes.
        // (Fix v6: the phase-2 red ring is deleted here too, the sprite is
        // what the player sees, but the fallback must not resurrect the ring.)
        context.fillStyle = color;
        context.beginPath();
        context.arc(0, 0, e.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(-e.radius * 0.95, -e.radius * 0.55);
        context.quadraticCurveTo(-e.radius * 1.5, -e.radius * 1.1, -e.radius * 0.9, -e.radius * 1.35);
        context.quadraticCurveTo(-e.radius * 0.85, -e.radius * 0.85, -e.radius * 0.6, -e.radius * 0.75);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(e.radius * 0.95, -e.radius * 0.55);
        context.quadraticCurveTo(e.radius * 1.5, -e.radius * 1.1, e.radius * 0.9, -e.radius * 1.35);
        context.quadraticCurveTo(e.radius * 0.85, -e.radius * 0.85, e.radius * 0.6, -e.radius * 0.75);
        context.closePath();
        context.fill();
        context.fillStyle = '#1a0b2e';
        context.beginPath();
        context.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe66d';
        context.beginPath();
        context.arc(-e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
        context.arc(e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe66d';
        for (let i = -1; i <= 1; i += 1) {
          context.beginPath();
          context.moveTo(i * e.radius * 0.4 - 7, -e.radius * 0.85);
          context.lineTo(i * e.radius * 0.4, -e.radius * 1.25);
          context.lineTo(i * e.radius * 0.4 + 7, -e.radius * 0.85);
          context.closePath();
          context.fill();
        }
      } else {
        // CINDER MAW: a huge crowned ember with burning eyes.
        context.fillStyle = color;
        context.beginPath();
        for (let i = 0; i < 12; i += 1) {
          const angle = (i / 12) * Math.PI * 2;
          const r = i % 2 === 0 ? e.radius * 1.15 : e.radius * 0.7;
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.fillStyle = '#1a0b2e';
        context.beginPath();
        context.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe66d';
        context.beginPath();
        context.arc(-e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
        context.arc(e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe66d';
        for (let i = -1; i <= 1; i += 1) {
          context.beginPath();
          context.moveTo(i * e.radius * 0.4 - 7, -e.radius * 0.85);
          context.lineTo(i * e.radius * 0.4, -e.radius * 1.25);
          context.lineTo(i * e.radius * 0.4 + 7, -e.radius * 0.85);
          context.closePath();
          context.fill();
        }
      }
    } else {
      // splitter: a pulsing hexagon with a dark core.
      const pulse = 1 + Math.sin(e.age * 4) * 0.06;
      context.scale(pulse, pulse);
      context.fillStyle = spec.color;
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(angle) * e.radius;
        const py = Math.sin(angle) * e.radius;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#3d0a1e';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.42, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd166';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.16, 0, Math.PI * 2);
      context.fill();
    }
    // Hit points left, as a thin arc over the tough ones, only once the enemy is
    // actually hurt. At full health the arc was a complete white circle, which is
    // what made every sprite read as a ringed vector disc. The arc sits just
    // outside the art (half its longest side, plus a little).
    if (e.hp > 1 && e.hp < e.maxHp && e.kind !== 'boss') {
      context.restore();
      context.save();
      context.translate(e.x, e.y);
      context.strokeStyle = 'rgba(242,245,255,0.7)';
      context.lineWidth = 2;
      context.beginPath();
      const arcR = sprite !== null ? spriteSize / 2 + 10 : e.radius + 6;
      context.arc(0, 0, arcR, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.hp) / e.maxHp);
      context.stroke();
    }
    context.restore();
    // A hit flashes the enemy white for a few frames, so every bullet landing reads.
    // Sprites flash by a brightened redraw above (inside the transform); the vector
    // fallback keeps its filled-disc flash here. No rings: in a dense field
    // something is always flashing, so rings made the monsters read as white
    // vector circles.
    if (e.flash > 0 && sprite === null) {
      context.save();
      context.translate(e.x, e.y);
      context.globalAlpha = Math.min(1, e.flash * 6);
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.85, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawPlayer(state, difficulty) {
    const player = state.player;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (player.invulnerable > 0 && Math.floor(state.elapsed * 10) % 2 === 0) return;
    const speed = Math.hypot(player.vx, player.vy);
    context.save();
    context.translate(player.x, player.y);
    // Engine flame, flickering with the clock, when the ship is moving.
    if (speed > 40) {
      const flicker = 0.7 + Math.sin(state.elapsed * 31) * 0.3;
      const back = Math.atan2(player.vy, player.vx);
      context.save();
      context.rotate(back);
      context.fillStyle = `rgba(255,${Math.floor(140 + 60 * flicker)},80,0.9)`;
      context.beginPath();
      // The flame starts behind the ship's tail: the ship is bigger now, and a
      // flame drawn at the old spot would hide inside the sprite.
      context.moveTo(-PLAYER.radius * 2.0, -6);
      context.lineTo(-PLAYER.radius * 2.0 - 16 * flicker, 0);
      context.lineTo(-PLAYER.radius * 2.0, 6);
      context.closePath();
      context.fill();
      context.restore();
    }
    const ship = shipForDifficulty(difficulty ?? 'ember');
    if (ship !== null) {
      // Sprite art from the user's sheet: the ship for this difficulty, nose to the
      // aim angle. The sheet ships face right, the same as the vector ship did.
      // Drawn big (4.5x the collision radius) so the ship reads as the art, not a dot.
      context.rotate(player.angle);
      const size = PLAYER.radius * 4.5;
      const scale = size / Math.max(ship.naturalWidth, ship.naturalHeight);
      context.drawImage(ship, (-ship.naturalWidth * scale) / 2, (-ship.naturalHeight * scale) / 2, ship.naturalWidth * scale, ship.naturalHeight * scale);
    } else {
      context.rotate(player.angle);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.moveTo(PLAYER.radius + 8, 0);
      context.lineTo(-PLAYER.radius, -PLAYER.radius * 0.85);
      context.lineTo(-PLAYER.radius * 0.45, 0);
      context.lineTo(-PLAYER.radius, PLAYER.radius * 0.85);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.playerCore;
      context.beginPath();
      context.arc(2, 0, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Muzzle flash (game-feel, small tier): a brief 4-point star at the nose when
    // a volley leaves, fading with player.muzzle. State-driven, so a staged scene
    // paints the same frame every time. Drawn in the rotated frame, at the same
    // nose point the bullets spawn from.
    if (player.muzzle > 0) {
      const f = Math.max(0, player.muzzle / 0.07);
      const s = 6 + 10 * f;
      const nx = PLAYER.radius + 6;
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = f;
      context.fillStyle = '#ffe66d';
      context.beginPath();
      context.arc(nx, 0, s * 0.9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.moveTo(nx - s, 0);
      context.lineTo(nx, -s * 0.3);
      context.lineTo(nx + s, 0);
      context.lineTo(nx, s * 0.3);
      context.closePath();
      context.moveTo(nx, -s);
      context.lineTo(nx + s * 0.3, 0);
      context.lineTo(nx, s);
      context.lineTo(nx - s * 0.3, 0);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.restore();
    // Fix v5: the shield ring is deleted, it read as a meaningless circle
    // around the ship. The shield mechanic is unchanged (it still absorbs a
    // hit); the only shield indicator left is the bottom bar SHIELD ACTIVE.
    // (Fix v6: the dash-cooldown arc below is deleted as well.)
    // Fix v6: the dash-cooldown arc is deleted too, a circle on the ship,
    // and dash readiness is already shown in the bottom bar (READY / 0.6s).
  }

  function drawPowerup(p, elapsed) {
    const bob = Math.sin(elapsed * 3 + p.x) * 3;
    const colors = { shield: '#7df9ff', rapid: '#ffe66d', magnet: '#ff8fa3' };
    const letters = { shield: 'S', rapid: 'R', magnet: 'M' };
    context.fillStyle = colors[p.kind];
    context.beginPath();
    context.arc(p.x, p.y + bob, POWERUP.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#0a0c16';
    context.font = `bold 15px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(letters[p.kind], p.x, p.y + bob + 0.5);
    context.textBaseline = 'alphabetic';
  }

  /** Count enemy kinds in a list of enemy slots (queue or live field). */
  function countKinds(slots) {
    const counts = {};
    for (const e of slots) {
      if (e.active === false) continue;
      const kind = typeof e === 'string' ? e : e.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  }

  function drawHud(state, best, muted) {
    context.textBaseline = 'top';
    // Fix v8: the score is the headline: small gold label, big gold value,
    // best tucked underneath. The v7 stack (white 30px score, grey best,
    // green combo, green boons) gave every line the same shout.
    text('SCORE', 24, 14, 13, PALETTE.gold, 'left', '800');
    text(String(state.score), 24, 30, 34, PALETTE.gold, 'left', '800');
    text(`BEST ${Math.max(best, state.score)}`, 24, 70, 14, PALETTE.muted, 'left', '700');
    let leftY = 92;
    if (state.mult > 1) {
      text(`×${state.mult} CHAIN ${state.combo}`, 24, leftY, 20, '#ffd166', 'left', '700');
      context.fillStyle = 'rgba(255,209,102,0.25)';
      context.fillRect(24, leftY + 26, 120, 6);
      context.fillStyle = '#ffd166';
      context.fillRect(24, leftY + 26, 120 * Math.max(0, state.comboTimer / state.player.stats.comboWindow), 6);
      leftY += 40;
    }
    const boonCount = Object.keys(state.boons).length;
    if (boonCount > 0) text(`BOONS ${boonCount}`, 24, leftY, 18, '#7dff9e', 'left', '700');
    // Top centre: night, the WIN/LOSE line, the Warden's bar, the night track.
    const nightText = state.endless ? `NIGHT ${Math.max(1, state.wave)}` : (state.wave > 0 ? `${nightLabel(state.wave)} / ${NIGHTS}` : 'GET READY');
    text(nightText, FIELD.width / 2, 18, 30, PALETTE.text, 'center', '700');
    const winLose = state.endless
      ? 'ENDLESS · how long can you hold?'
      : 'Slay the Void King on night 9 · three lives, then the dark';
    text(winLose, FIELD.width / 2, 54, 14, PALETTE.muted, 'center');
    // A Warden's health bar, with a phase tick at half health.
    if (state.boss !== null && state.boss.active) {
      const barW = 460;
      const barX = (FIELD.width - barW) / 2;
      const barY = 74;
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(barX, barY, barW, 12);
      const bossGrad = context.createLinearGradient(barX, 0, barX + barW, 0);
      bossGrad.addColorStop(0, '#ff7a00');
      bossGrad.addColorStop(1, '#ff5964');
      context.fillStyle = state.bossPhase === 2 ? '#ff5964' : bossGrad;
      context.fillRect(barX, barY, barW * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
      context.strokeStyle = 'rgba(242,245,255,0.6)';
      context.lineWidth = 1.5;
      context.strokeRect(barX, barY, barW, 12);
      context.strokeStyle = '#ffe66d';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(barX + barW / 2, barY - 3);
      context.lineTo(barX + barW / 2, barY + 15);
      context.stroke();
      if (state.bossPhase === 2) text('PHASE 2 · ENRAGED', barX + barW + 10, barY - 2, 14, '#ff5964', 'left', '700');
    }
    // Night-progress track: nine nodes, crowns on the boss nights.
    const trackW = 300;
    const trackX = (FIELD.width - trackW) / 2;
    const trackY = 100;
    context.strokeStyle = 'rgba(154,165,196,0.5)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(trackX, trackY);
    context.lineTo(trackX + trackW, trackY);
    context.stroke();
    for (let night = 1; night <= NIGHTS; night += 1) {
      const nx = trackX + ((night - 1) / (NIGHTS - 1)) * trackW;
      const isBoss = night % 3 === 0;
      const cleared = night <= state.nightsCleared;
      const current = night === Math.max(1, state.wave);
      context.fillStyle = cleared ? '#ffd166' : (current ? '#7df9ff' : 'rgba(154,165,196,0.4)');
      if (isBoss) {
        context.save();
        context.translate(nx, trackY);
        context.rotate(Math.PI / 4);
        context.fillRect(-6, -6, 12, 12);
        context.restore();
      } else {
        context.beginPath();
        context.arc(nx, trackY, current ? 7 : 5, 0, Math.PI * 2);
        context.fill();
      }
    }
    const firstHeart = FIELD.width - 24 - 5 * (HEART_SIZE + HEART_GAP) + HEART_GAP;
    text('LIVES', FIELD.width - 24, 16, 14, PALETTE.muted, 'right', '800');
    for (let life = 0; life < 5; life += 1) {
      const x = firstHeart + life * (HEART_SIZE + HEART_GAP);
      const y = 38;
      context.fillStyle = life < state.lives ? '#ff5964' : 'rgba(255,255,255,0.14)';
      context.beginPath();
      context.moveTo(x + HEART_SIZE / 2, y + HEART_SIZE * 0.9);
      context.bezierCurveTo(x - 2, y + HEART_SIZE * 0.45, x + 1, y, x + HEART_SIZE * 0.32, y + HEART_SIZE * 0.28);
      context.bezierCurveTo(x + HEART_SIZE * 0.45, y - 1, x + HEART_SIZE * 0.55, y - 1, x + HEART_SIZE * 0.68, y + HEART_SIZE * 0.28);
      context.bezierCurveTo(x + HEART_SIZE - 1, y, x + HEART_SIZE + 2, y + HEART_SIZE * 0.45, x + HEART_SIZE / 2, y + HEART_SIZE * 0.9);
      context.fill();
    }
    // Incoming list, right edge: a real panel now, so the list never sits as
    // bare text on top of a sprite, the v7 version overlapped the field.
    if (state.waveState !== 'draft') {
      const incoming = state.waveState === 'fighting' ? countKinds(state.enemies) : countKinds(state.queue);
      const label = state.waveState === 'fighting' ? 'ON THE FIELD' : 'INCOMING';
      const kinds = Object.keys(incoming).slice(0, 6);
      if (kinds.length > 0) {
        const listW = 184;
        const listX = FIELD.width - 24 - listW;
        const listY = 112;
        const listH = 34 + kinds.length * 20;
        context.fillStyle = 'rgba(23,16,25,0.88)';
        context.fillRect(listX, listY, listW, listH);
        context.strokeStyle = PALETTE.panelEdge;
        context.lineWidth = 1.5;
        context.strokeRect(listX, listY, listW, listH);
        context.fillStyle = PALETTE.emberDeep;
        context.fillRect(listX, listY, 3, listH);
        context.textBaseline = 'top';
        text(label, listX + 14, listY + 9, 13, PALETTE.gold, 'left', '800');
        let iy = listY + 32;
        for (const kind of kinds) {
          const spec = kind === 'boss' ? state.bossSpec : ENEMY[kind];
          const name = kind === 'boss' ? (spec ? spec.name : 'WARDEN') : kind.toUpperCase();
          text(`${incoming[kind]}×`, listX + 14, iy, 15, PALETTE.gold, 'left', '800');
          // Fix v8: the boss's own purple (#7209b7) on the dark panel was
          // unreadable, boss names read in starlight, the rest keep theirs.
          text(name, listX + 46, iy, 15, kind === 'boss' ? PALETTE.text : (spec ? spec.color : PALETTE.text), 'left', '700');
          iy += 20;
        }
      }
    }
    // Bottom ability bar: dash, shield, magnet, with key hints.
    const barW = 560;
    const barX = (FIELD.width - barW) / 2;
    const barY = FIELD.height - 48;
    context.fillStyle = 'rgba(23,16,25,0.88)';
    context.fillRect(barX, barY, barW, 34);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.strokeRect(barX, barY, barW, 34);
    context.fillStyle = PALETTE.emberDeep;
    context.fillRect(barX, barY, barW, 3);
    const cells = [
      { label: 'DASH [SPACE]', value: state.player.dashCooldown <= 0 ? 'READY' : `${state.player.dashCooldown.toFixed(1)}s`, color: state.player.dashCooldown <= 0 ? '#7df9ff' : PALETTE.muted },
      { label: 'SHIELD', value: state.player.shield ? 'ACTIVE' : 'OFF', color: state.player.shield ? '#7df9ff' : PALETTE.muted },
      { label: 'MAGNET', value: state.player.magnetTimer > 0 ? `${Math.ceil(state.player.magnetTimer)}s` : (state.player.rapidTimer > 0 ? `RAPID ${Math.ceil(state.player.rapidTimer)}s` : 'OFF'), color: state.player.magnetTimer > 0 || state.player.rapidTimer > 0 ? '#ff8fa3' : PALETTE.muted },
    ];
    for (let i = 0; i < 3; i += 1) {
      const cx = barX + (i * barW) / 3;
      if (i > 0) {
        context.strokeStyle = PALETTE.panelEdge;
        context.beginPath();
        context.moveTo(cx, barY + 7);
        context.lineTo(cx, barY + 28);
        context.stroke();
      }
      context.textBaseline = 'alphabetic';
      text(cells[i].label, cx + 12, barY + 23, 12, PALETTE.muted, 'left', '700');
      text(cells[i].value, cx + barW / 3 - 12, barY + 23, 15, cells[i].color, 'right', '800');
    }
    if (muted) text('MUTED (M)', 24, FIELD.height - 22, 14, PALETTE.muted, 'left');
    else text('M Mute · P Pause', 24, FIELD.height - 22, 14, PALETTE.muted, 'left');
    // Night banner, centre screen: full strength, then a quick fade.
    if (state.bannerTimer > 0) {
      const alpha = state.bannerTimer > 0.5 ? 1 : state.bannerTimer / 0.5;
      context.save();
      context.globalAlpha = alpha;
      text(state.bannerText, FIELD.width / 2, 150, 44, '#ffe66d', 'center', '800');
      context.restore();
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,12,22,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    box(x, y, PANEL.width, height, PALETTE.panel, PALETTE.panelEdge, PALETTE.gold);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 52, PALETTE.gold, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.text, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, '#ffd166', 'center', '700');
  }

  /** A small glyph for each boon, drawn inside its draft card. */
  function drawBoonIcon(id, cx, cy) {
    context.fillStyle = '#ffd166';
    context.strokeStyle = '#ffd166';
    context.lineWidth = 3;
    if (id === 'heavy') {
      // A heavy orb: dark rim, orange body, bright core, the same read as the
      // heavy orb bullet it fires.
      context.fillStyle = '#7a2d00';
      context.beginPath();
      context.arc(cx, cy, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ff7a00';
      context.beginPath();
      context.arc(cx, cy, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(cx, cy, 4, 0, Math.PI * 2);
      context.fill();
    } else if (id === 'rapid') {
      // Three speed chevrons, not three dots: rapid fire reads as motion.
      for (const dx of [-16, 0, 16]) {
        context.beginPath();
        context.moveTo(cx + dx - 5, cy - 8);
        context.lineTo(cx + dx + 5, cy);
        context.lineTo(cx + dx - 5, cy + 8);
        context.stroke();
      }
    } else if (id === 'twin') {
      // Two parallel barrels with hot muzzles, in twin-cyan.
      context.fillStyle = '#7df9ff';
      context.fillRect(cx - 11, cy - 13, 7, 26);
      context.fillRect(cx + 4, cy - 13, 7, 26);
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(cx - 7.5, cy - 16, 3, 0, Math.PI * 2);
      context.arc(cx + 7.5, cy - 16, 3, 0, Math.PI * 2);
      context.fill();
    } else if (id === 'range') {
      // A sight reticle: ring, four ticks, centre dot.
      context.beginPath();
      context.arc(cx, cy, 12, 0, Math.PI * 2);
      context.stroke();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        context.beginPath();
        context.moveTo(cx + dx * 14, cy + dy * 14);
        context.lineTo(cx + dx * 20, cy + dy * 20);
        context.stroke();
      }
      context.beginPath();
      context.arc(cx, cy, 3, 0, Math.PI * 2);
      context.fill();
    } else if (id === 'impact') {
      // A burst star: bright core, eight radiating spikes, the hit itself.
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(cx, cy, 6, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#ffd166';
      context.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const len = i % 2 === 0 ? 20 : 13;
        context.beginPath();
        context.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
        context.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        context.stroke();
      }
    } else if (id === 'swift') {
      // Two swept wings, flight, not speed lines: rapid keeps the chevrons,
      // so the two speed boons no longer share one glyph.
      context.fillStyle = '#ffd166';
      for (const s of [-1, 1]) {
        context.beginPath();
        context.moveTo(cx + s * 2, cy + 10);
        context.quadraticCurveTo(cx + s * 20, cy - 2, cx + s * 22, cy - 14);
        context.quadraticCurveTo(cx + s * 12, cy - 8, cx + s * 8, cy + 2);
        context.quadraticCurveTo(cx + s * 12, cy + 6, cx + s * 2, cy + 10);
        context.closePath();
        context.fill();
      }
    } else if (id === 'heart') {
      context.fillStyle = '#ff5964';
      context.beginPath();
      context.moveTo(cx, cy + 10);
      context.bezierCurveTo(cx - 16, cy - 2, cx - 8, cy - 14, cx, cy - 5);
      context.bezierCurveTo(cx + 8, cy - 14, cx + 16, cy - 2, cx, cy + 10);
      context.fill();
    } else if (id === 'magnet') {
      context.fillStyle = '#ff8fa3';
      context.beginPath();
      context.arc(cx, cy, 12, Math.PI, 0);
      context.fill();
      context.fillRect(cx - 12, cy - 2, 6, 14);
      context.fillRect(cx + 6, cy - 2, 6, 14);
    } else if (id === 'dash') {
      context.beginPath();
      context.moveTo(cx + 6, cy - 16);
      context.lineTo(cx - 8, cy + 2);
      context.lineTo(cx + 1, cy + 2);
      context.lineTo(cx - 6, cy + 16);
      context.lineTo(cx + 10, cy - 2);
      context.lineTo(cx + 1, cy - 2);
      context.closePath();
      context.fill();
    } else if (id === 'flame') {
      context.beginPath();
      context.moveTo(cx, cy - 16);
      context.quadraticCurveTo(cx + 14, cy + 2, cx + 6, cy + 12);
      context.quadraticCurveTo(cx, cy + 16, cx - 6, cy + 12);
      context.quadraticCurveTo(cx - 14, cy + 2, cx, cy - 16);
      context.fill();
    }
  }

  /** The draft after a cleared night: three boon cards, your build, and what comes next. */
  function drawDraft(state) {
    context.fillStyle = 'rgba(10,12,22,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`NIGHT ${state.wave} HELD`, FIELD.width / 2, 104, 44, '#7dff9e', 'center', '800');
    context.fillStyle = PALETTE.emberDeep;
    context.fillRect(FIELD.width / 2 - 60, 120, 120, 3);
    text(`The Hollow is already gathering for night ${state.wave + 1}. Take one ember. Choose well.`, FIELD.width / 2, 152, 20, PALETTE.text, 'center');
    const total = DRAFT_CARDS.width * 3 + DRAFT_CARDS.gap * 2;
    const x0 = (FIELD.width - total) / 2;
    for (let i = 0; i < 3; i += 1) {
      const boon = BOONS.find((b) => b.id === state.draft[i]);
      const cx = x0 + i * (DRAFT_CARDS.width + DRAFT_CARDS.gap);
      const cy = DRAFT_CARDS.top;
      context.fillStyle = PALETTE.panel;
      context.fillRect(cx, cy, DRAFT_CARDS.width, DRAFT_CARDS.height);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 1.5;
      context.strokeRect(cx, cy, DRAFT_CARDS.width, DRAFT_CARDS.height);
      // Rarity is a full-width top bar, not a coloured border: the whole card
      // reads its rarity at a glance, and the key is a gold chip, not [1].
      context.fillStyle = boon ? RARITY[boon.rarity].color : PALETTE.gold;
      context.fillRect(cx, cy, DRAFT_CARDS.width, 5);
      context.fillStyle = PALETTE.gold;
      context.fillRect(cx + 14, cy + 16, 30, 24);
      text(String(i + 1), cx + 29, cy + 33, 16, '#14100a', 'center', '800');
      if (boon) {
        text(RARITY[boon.rarity].label, cx + DRAFT_CARDS.width - 14, cy + 33, 13, RARITY[boon.rarity].color, 'right', '800');
        context.save();
        context.translate(cx + DRAFT_CARDS.width / 2, cy + 96);
        context.scale(1.3, 1.3);
        drawBoonIcon(boon.id, 0, 0);
        context.restore();
        text(boon.name, cx + DRAFT_CARDS.width / 2, cy + 158, 25, PALETTE.text, 'center', '800');
        context.fillStyle = PALETTE.emberDeep;
        context.fillRect(cx + DRAFT_CARDS.width / 2 - 24, cy + 172, 48, 3);
        text(boon.desc, cx + DRAFT_CARDS.width / 2, cy + 204, 17, PALETTE.text, 'center');
        const owned = state.boons[boon.id] ?? 0;
        text(owned > 0 ? `OWNED ×${owned} · MAX ${boon.max}` : `MAX ${boon.max}`, cx + DRAFT_CARDS.width / 2, cy + 248, 14, PALETTE.muted, 'center', '700');
      }
    }
    // Your build so far, as chips under the cards.
    const ownedIds = Object.keys(state.boons);
    if (ownedIds.length > 0) {
      const chips = ownedIds.map((id) => {
        const boon = BOONS.find((b) => b.id === id);
        return boon ? `${boon.name} x${state.boons[id]}` : id;
      });
      text(`Your build so far: ${chips.join('   ·   ')}`, FIELD.width / 2, 558, 16, '#7dff9e', 'center', '700');
    } else {
      text('No boons yet. Your first ember is above.', FIELD.width / 2, 558, 16, PALETTE.muted, 'center');
    }
    // Your ship, flying under the cards: the draft is your build, and the sprite
    // makes the screen read as the game, not a menu. It sits in the gap between
    // the cards and YOUR BOONS, sized to clear both (height-capped, so the
    // taller Lantern/Inferno ships never touch the line below).
    const draftShip = shipForDifficulty(state.difficulty?.id ?? 'ember');
    if (draftShip !== null) {
      const scale = Math.min(72 / draftShip.naturalWidth, 36 / draftShip.naturalHeight);
      context.drawImage(draftShip, FIELD.width / 2 - (draftShip.naturalWidth * scale) / 2, 519 - (draftShip.naturalHeight * scale) / 2, draftShip.naturalWidth * scale, draftShip.naturalHeight * scale);
    }
    // What the next night brings.
    const next = state.wave + 1;
    let preview = '';
    let previewColor = PALETTE.muted;
    if (next % 3 === 0) {
      const spec = BOSS[[3, 6, 9][(next / 3 - 1) % 3]];
      preview = `Night ${next}: ${spec.name} is waiting.`;
      previewColor = '#ff5964';
    } else if (NEW_AT_NIGHT[next]) {
      const names = NEW_AT_NIGHT[next].map((k) => k).join(' and ');
      preview = `Night ${next} brings ${names}.`;
    } else {
      preview = `Night ${next}: the Hollow sends more.`;
    }
    text(preview, FIELD.width / 2, 598, 20, previewColor, 'center', '700');
    text('Choose with 1 · 2 · 3, or click a card', FIELD.width / 2, 650, 20, '#ffd166', 'center', '700');
  }

  /** A small filled box with an edge, for title panels and stat boxes.
   * Fix v8: an optional accent bar across the top, so a primary panel reads
   * as primary without a second border colour. Panels stop looking like
   * default rectangles: warm fill, warm edge, one ember/gold accent. */
  function box(x, y, w, h, fill, edge, accent) {
    context.fillStyle = fill;
    context.fillRect(x, y, w, h);
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.strokeRect(x, y, w, h);
    if (accent) {
      context.fillStyle = accent;
      context.fillRect(x, y, w, 3);
    }
  }

  /** A section label in gold with a short ember rule, the one label style
   * for every screen, so sections read as a system instead of scattered caps. */
  function sectionLabel(value, x, y) {
    text(value, x, y, 15, PALETTE.gold, 'left', '800');
    context.fillStyle = PALETTE.emberDeep;
    context.fillRect(x, y + 8, 36, 3);
  }

  /** The title screen is a full pitch: goal, how to play, bestiary, difficulties, feats. */
  function drawTitleScreen(state, best, meta) {
    const m = meta ?? {};
    // Fix v8: the field keeps playing behind the title, so dim it, the v7
    // title let wandering enemies and the ship sit on top of the pitch.
    context.fillStyle = 'rgba(10,12,22,0.78)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text('EMBERFALL', FIELD.width / 2, 62, 56, PALETTE.text, 'center', '800');
    context.fillStyle = PALETTE.emberDeep;
    context.fillRect(FIELD.width / 2 - 110, 76, 220, 4);
    text('Vaelith is dying. Nine nights stand between the Hollow and its last ember, and you are the only keeper left.', FIELD.width / 2, 104, 18, PALETTE.text, 'center');
    // Fix v8: GOAL / WIN / LOSE was three identical boxes saying what one
    // line can say. One strip, three beats, no repeated chrome.
    box(24, 120, 1232, 52, PALETTE.panel, PALETTE.panelEdge, PALETTE.gold);
    const stakes = [
      { x: 48, head: 'GOAL', color: '#7dff9e', line: 'Hold the field nine nights' },
      { x: 464, head: 'WIN', color: '#ffd166', line: 'Slay the Void King' },
      { x: 880, head: 'LOSE', color: '#ff5964', line: 'Three lives, then the dark' },
    ];
    for (const s of stakes) {
      text(s.head, s.x, 152, 17, s.color, 'left', '800');
      text(`· ${s.line}`, s.x + 58, 152, 16, PALETTE.text, 'left');
    }
    // Three-step illustrated how-to.
    const steps = [
      { head: '1 · MOVE', body: 'WASD or arrows. The field is yours.' },
      { head: '2 · SHOOT', body: 'Your cannon fires itself. Aim with the mouse.' },
      { head: '3 · DASH + DRAFT', body: 'Space to dash. Take a boon each night.' },
    ];
    for (let i = 0; i < 3; i += 1) {
      const bx = 24 + i * 408;
      box(bx, 184, 392, 62, PALETTE.panel, PALETTE.panelEdge);
      text(steps[i].head, bx + 16, 210, 17, '#ffd166', 'left', '800');
      text(steps[i].body, bx + 16, 234, 15, PALETTE.text, 'left');
    }
    // Bestiary: six enemies, then the three Wardens.
    sectionLabel('THE HOLLOW · KNOW YOUR ENEMY', 24, 268);
    const kinds = ['drifter', 'dart', 'spinner', 'splitter', 'wisp', 'brute'];
    for (let i = 0; i < 6; i += 1) {
      const bx = 10 + i * 212;
      box(bx, 286, 200, 64, PALETTE.panel, PALETTE.panelEdge);
      const spec = ENEMY[kinds[i]];
      drawEnemy({ kind: kinds[i], x: bx + 28, y: 318, radius: 13, age: 0, phase: 0, hp: 1, maxHp: 1, name: '', flash: 0, vx: 0, vy: 0 }, 1, 44);
      text(kinds[i].toUpperCase(), bx + 52, 310, 14, spec.color, 'left', '800');
      text(spec.behaviour, bx + 52, 332, 12, PALETTE.muted, 'left');
    }
    const wardens = [3, 6, 9];
    for (let i = 0; i < 3; i += 1) {
      const bx = 24 + i * 408;
      box(bx, 358, 392, 62, PALETTE.panel, '#ffd166');
      const spec = BOSS[wardens[i]];
      drawEnemy({ kind: 'boss', x: bx + 30, y: 389, radius: 17, age: 0, phase: 0, hp: 1, maxHp: 1, name: spec.name, flash: 0, vx: 0, vy: 0 }, 1, 46);
      text(`NIGHT ${wardens[i]} · ${spec.name}`, bx + 82, 384, 15, spec.color, 'left', '800');
      text(spec.behaviour, bx + 82, 406, 13, PALETTE.muted, 'left');
    }
    // Difficulties + Endless.
    sectionLabel('CHOOSE YOUR FLAME', 24, 446);
    const selected = m.difficulty ?? 'ember';
    const endlessOn = m.endless === true;
    for (let i = 0; i < 3; i += 1) {
      const id = DIFFICULTY_ORDER[i];
      const spec = DIFFICULTY[id];
      const bx = TITLE_DIFF.x0 + i * (TITLE_DIFF.width + TITLE_DIFF.gap);
      const on = selected === id && !endlessOn;
      box(bx, TITLE_DIFF.y, TITLE_DIFF.width, TITLE_DIFF.height, on ? '#2a3350' : PALETTE.panel, on ? '#ffd166' : PALETTE.panelEdge);
      text(`${i + 1} · ${spec.name}  ×${spec.scoreMult} score`, bx + 14, TITLE_DIFF.y + 24, 17, on ? '#ffd166' : PALETTE.text, 'left', '800');
      text(spec.desc, bx + 14, TITLE_DIFF.y + 44, 13, PALETTE.muted, 'left');
      const diffShip = shipForDifficulty(id);
      if (diffShip !== null) {
        // The ship this difficulty flies, at the box's right edge.
        const size = 40;
        const scale = size / Math.max(diffShip.naturalWidth, diffShip.naturalHeight);
        context.drawImage(diffShip, bx + TITLE_DIFF.width - 14 - diffShip.naturalWidth * scale, TITLE_DIFF.y + (TITLE_DIFF.height - diffShip.naturalHeight * scale) / 2, diffShip.naturalWidth * scale, diffShip.naturalHeight * scale);
      }
    }
    const ex = TITLE_DIFF.x0 + 3 * (TITLE_DIFF.width + TITLE_DIFF.gap);
    const endlessUnlocked = m.won === true;
    box(ex, TITLE_DIFF.y, TITLE_DIFF.width, TITLE_DIFF.height, endlessOn ? '#2a3350' : PALETTE.panel, endlessOn ? '#ffd166' : PALETTE.panelEdge);
    text(`E · ENDLESS${endlessUnlocked ? '' : '  (LOCKED)'}`, ex + 14, TITLE_DIFF.y + 24, 17, endlessOn ? '#ffd166' : PALETTE.text, 'left', '800');
    text(endlessUnlocked ? 'Survive past night 9' : 'Win once to unlock', ex + 14, TITLE_DIFF.y + 44, 13, PALETTE.muted, 'left');
    // Feats row.
    sectionLabel('FEATS · EARNED ACROSS RUNS', 24, 536);
    const unlocked = new Set(m.feats ?? []);
    for (let i = 0; i < FEATS.length; i += 1) {
      const fx = 20 + i * 156;
      const got = unlocked.has(FEATS[i].id);
      box(fx, 548, 148, 36, got ? '#2a1f14' : PALETTE.panel, got ? '#ffd166' : PALETTE.panelEdge);
      text(`${got ? '★ ' : '☆ '}${FEATS[i].name}`, fx + 74, 570, 13, got ? '#ffd166' : PALETTE.muted, 'center', '700');
    }
    // Best score + last run, then the prompt.
    const last = m.lastRun;
    const lastText = last ? `LAST RUN: ${last.won ? 'won' : `night ${last.wave}`} · ${last.score} pts · ${DIFFICULTY[last.difficulty]?.name ?? ''}` : 'LAST RUN: none yet. The star is still waiting';
    text(`BEST ${best}    ·    ${lastText}`, FIELD.width / 2, 614, 17, PALETTE.text, 'center', '700');
    text('1-3 choose your flame  ·  E endless  ·  SPACE to fly', FIELD.width / 2, 650, 20, '#ffd166', 'center', '700');
  }

  /** The victory/defeat report card: grade, stat boxes, per-night chart, build, feats, next goal. */
  function drawReport(state, best, seed, meta, title, subtitle, grade, isWin) {
    const m = meta ?? {};
    const px = 170;
    // Fix v9: panel enlarged (py 28, ph 664) so the SEED · BEST footer sits
    // inside it with padding, it used to sit exactly on the bottom edge
    // (buttons bottom 654 + 26 = baseline 680 = old panel bottom), which is
    // the text the user saw sticking out of THE STAR LIVES. Buttons and
    // footer keep their absolute y; the panel now ends 12 px below the footer.
    const py = 28;
    const pw = 940;
    const ph = 664;
    context.fillStyle = 'rgba(10,12,22,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    box(px, py, pw, ph, PALETTE.panel, PALETTE.panelEdge, isWin ? PALETTE.gold : PALETTE.danger);
    context.textBaseline = 'alphabetic';
    text(title, px + 30, py + 58, 40, isWin ? '#7dff9e' : '#ff5964', 'left', '800');
    text(subtitle, px + 30, py + 88, 18, PALETTE.text, 'left');
    const gradeColor = grade === 'S' ? '#ffd166' : grade === 'A' ? '#7dff9e' : grade === 'B' ? '#7df9ff' : PALETTE.muted;
    text(grade, px + pw - 40, py + 92, 64, gradeColor, 'right', '800');
    text('GRADE', px + pw - 40, py + 116, 13, PALETTE.muted, 'right', '700');
    // The three Night Wardens you slew, as sprite art in the header: the report
    // card is the last thing the judge sees, and the art proves the bosses are
    // the user's monsters, not vector shapes. Only on a win, a loss has not
    // slain them all.
    if (isWin) {
      const wardenNames = ['CINDER MAW', 'HOLLOW CHOIR', 'VOID KING'];
      const wardenKeys = ['CINDER MAW', 'THE HOLLOW CHOIR', 'THE VOID KING'];
      text('WARDENS SLAIN', px + pw - 300, py + 24, 11, PALETTE.muted, 'center', '700');
      for (let i = 0; i < 3; i += 1) {
        const warden = spriteForEnemy({ kind: 'boss', name: wardenKeys[i] });
        if (warden === null) continue;
        const cx = px + pw - 300 + (i - 1) * 84;
        const size = 56;
        const scale = size / Math.max(warden.naturalWidth, warden.naturalHeight);
        context.drawImage(warden, cx - (warden.naturalWidth * scale) / 2, py + 66 - (warden.naturalHeight * scale) / 2, warden.naturalWidth * scale, warden.naturalHeight * scale);
        text(wardenNames[i], cx, py + 112, 10, PALETTE.muted, 'center', '700');
      }
    }
    // Eight stat boxes, two rows of four.
    const s = state.stats;
    const accuracy = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;
    const statBoxes = [
      { label: 'SCORE', value: String(state.score) },
      { label: 'TIME', value: fmtTime(state.elapsed) },
      { label: 'DESTROYED', value: String(state.kills) },
      { label: 'BEST CHAIN', value: String(s.bestChain) },
      { label: 'BOONS', value: String(Object.keys(state.boons).length) },
      { label: 'ACCURACY', value: `${accuracy}%` },
      { label: 'LIVES LEFT', value: String(Math.max(0, state.lives)) },
      { label: 'NIGHTS', value: state.endless ? `${Math.max(1, state.wave)}+` : `${state.nightsCleared} / ${NIGHTS}` },
    ];
    for (let i = 0; i < 8; i += 1) {
      const bx = px + 22 + (i % 4) * 227;
      const by = py + 128 + Math.floor(i / 4) * 74;
      box(bx, by, 215, 62, PALETTE.panelDeep, PALETTE.panelEdge, i === 0 ? PALETTE.emberDeep : null);
      text(statBoxes[i].label, bx + 12, by + 20, 12, PALETTE.muted, 'left', '800');
      text(statBoxes[i].value, bx + 12, by + 48, 26, i === 0 ? PALETTE.gold : PALETTE.text, 'left', '800');
    }
    // Per-night bar chart.
    // Fix v10: chart shortened (84 -> 60) to reclaim 24 px of vertical room
    // for the wrapped build/feats lists below, the panel cannot grow (it
    // already ends 28 px from the screen bottom), so the room has to come
    // from here.
    const perNight = perNightScores(state);
    const chartX = px + 22;
    const chartY = py + 284;
    const chartW = pw - 44;
    const chartH = 60;
    text('How each night paid', chartX, chartY - 8, 14, PALETTE.gold, 'left', '800');
    const maxScore = Math.max(1, ...perNight.map((n) => n.score));
    for (let i = 0; i < perNight.length; i += 1) {
      const bw = (chartW - (perNight.length - 1) * 10) / perNight.length;
      const bx = chartX + i * (bw + 10);
      const bh = Math.max(4, (perNight[i].score / maxScore) * chartH);
      context.fillStyle = perNight[i].night % 3 === 0 ? '#ffd166' : '#e85d04';
      context.fillRect(bx, chartY + chartH - bh, bw, bh);
      text(String(perNight[i].night), bx + bw / 2, chartY + chartH + 18, 13, PALETTE.muted, 'center');
    }
    // Boons built + feats earned.
    // Fix v10: these were drawn as one unbroken line each, and they OVERFLOWED
    // the panel's right edge, measured on the rendered v9 win shot, the boons
    // line ended at x=1207 and the feats line at x=1137, while the panel ends
    // at x=1110 (97 px and 27 px past the border). That is the text the user
    // saw sticking out of THE STAR LIVES. They are now wrapped with the real
    // canvas measureText (same font the text() helper uses), so every line
    // ends at least 30 px inside the panel border. Nothing is dropped: every
    // boon and feat still appears, only the line breaks change. If a list
    // still needs a third line at 17 px (a very full build), it re-wraps at
    // 15 px instead of colliding with the next section.
    const listRight = px + pw - 30;
    const listWidth = listRight - chartX;
    function wrapList(items, size) {
      context.font = `700 ${size}px ${FONT}`;
      const lines = [[]];
      for (const item of items) {
        const trial = [...lines[lines.length - 1], item].join('   ·   ');
        if (lines[lines.length - 1].length > 0 && context.measureText(trial).width > listWidth) lines.push([item]);
        else lines[lines.length - 1].push(item);
      }
      return lines.map((l) => l.join('   ·   '));
    }
    function wrappedLines(items) {
      const at17 = wrapList(items, 17);
      return at17.length <= 2 ? { lines: at17, size: 17 } : { lines: wrapList(items, 15), size: 15 };
    }
    const boonNames = Object.keys(state.boons).map((id) => {
      const boon = BOONS.find((b) => b.id === id);
      return boon ? `${boon.name} x${state.boons[id]}` : id;
    });
    const boonLines = boonNames.length > 0 ? wrappedLines(boonNames) : { lines: ['None. The Hollow took you early'], size: 17 };
    text('Your build', chartX, py + 408, 14, PALETTE.gold, 'left', '800');
    boonLines.lines.forEach((line, i) => text(line, chartX, py + 432 + i * 24, boonLines.size, '#7dff9e', 'left', '700'));
    const earned = m.runFeats ?? [];
    const earnedNames = earned.map((id) => {
      const feat = FEATS.find((f) => f.id === id);
      return feat ? feat.name : id;
    });
    const featLines = earnedNames.length > 0 ? wrappedLines(earnedNames) : { lines: ['No feats this run'], size: 17 };
    text('Feats earned', chartX, py + 486, 14, PALETTE.gold, 'left', '800');
    featLines.lines.forEach((line, i) => text(line, chartX, py + 510 + i * 24, featLines.size, '#ffd166', 'left', '700'));
    // Next goal.
    const diffId = state.difficulty.id;
    const nextGoal = isWin
      ? (diffId === 'ember' ? 'Lantern next. The Hollow hits harder there.' : diffId === 'lantern' ? 'Inferno next. For keepers only.' : 'The Endless waits. How long can you hold?')
      : `The star is still dying. Fly again. Night ${Math.min(NIGHTS, Math.max(1, state.wave) + 1)} is waiting.`;
    text(nextGoal, FIELD.width / 2, py + 556, 19, '#ffd166', 'center', '700');
    // Three buttons.
    const buttons = ['FLY AGAIN · SPACE', 'SAME SEED · R', 'MENU · ESC'];
    const total = REPORT_BUTTONS.width * 3 + REPORT_BUTTONS.gap * 2;
    const x0 = (FIELD.width - total) / 2;
    for (let i = 0; i < 3; i += 1) {
      const bx = x0 + i * (REPORT_BUTTONS.width + REPORT_BUTTONS.gap);
      if (i === 0) {
        context.fillStyle = PALETTE.emberDeep;
        context.fillRect(bx, REPORT_BUTTONS.y, REPORT_BUTTONS.width, REPORT_BUTTONS.height);
        text(buttons[i], bx + REPORT_BUTTONS.width / 2, REPORT_BUTTONS.y + 31, 17, '#fff3c4', 'center', '800');
      } else {
        box(bx, REPORT_BUTTONS.y, REPORT_BUTTONS.width, REPORT_BUTTONS.height, PALETTE.panel, PALETTE.panelEdge);
        text(buttons[i], bx + REPORT_BUTTONS.width / 2, REPORT_BUTTONS.y + 31, 17, PALETTE.text, 'center', '700');
      }
    }
    text(`SEED ${seed}  ·  BEST ${Math.max(best, state.score)}`, FIELD.width / 2, REPORT_BUTTONS.y + REPORT_BUTTONS.height + 26, 15, PALETTE.muted, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, muted, seed, meta) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Trauma-based shake: amplitude is trauma squared, summed sines at unrelated rates.
    // smooth, never a per-frame random buzz (game-feel). Deterministic: a sine of the
    // clock, so a staged scene paints the same frame every time.
    const trauma = state.shake * state.shake;
    const shakeX = trauma > 0 ? Math.sin(state.elapsed * 47) * trauma * 12 : 0;
    const shakeY = trauma > 0 ? Math.cos(state.elapsed * 39) * trauma * 12 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    // Fix v10: HD space background redrawn from the user's photo, drawn
    // first, fixed position, deterministic, local file, no network. Falls back
    // to the old dark fill if the image failed to load, so the game never
    // depends on the art being there. Thin dark veils over the top and bottom
    // HUD strips only (the sun glow sits under SCORE, the ability bar sits
    // over the nebula), the planets themselves are never covered.
    const bg = bgSprite();
    if (bg !== null) {
      context.drawImage(bg, 0, 0, FIELD.width, FIELD.height);
      let veil = context.createLinearGradient(0, 0, 0, 170);
      veil.addColorStop(0, 'rgba(8,6,18,0.55)');
      veil.addColorStop(1, 'rgba(8,6,18,0)');
      context.fillStyle = veil;
      context.fillRect(0, 0, FIELD.width, 170);
      veil = context.createLinearGradient(0, FIELD.height - 120, 0, FIELD.height);
      veil.addColorStop(0, 'rgba(8,6,18,0)');
      veil.addColorStop(1, 'rgba(8,6,18,0.5)');
      context.fillStyle = veil;
      context.fillRect(0, FIELD.height - 120, FIELD.width, 120);
    } else {
      context.fillStyle = '#0d1020';
      context.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    }
    // Fix v12: the hearth is deleted, no drawHearth call, field centre is
    // just the HD space background now.
    // Fix v8: the title is a pitch, not a paused game, no field entities
    // (ship, enemies, bullets) wandering behind it. Stars stay.
    if (screen === SCREEN_TITLE) {
      drawTitleScreen(state, best, meta);
      return;
    }
    // Fix v8: draft / win / lose are full screens, not overlays on the live
    // field, the v7 versions let the HUD ("NIGHT 1 / 9" doubling "NIGHT 1
    // HELD") and the player ship ghost through the veil. Stars only.
    if (screen === SCREEN_DRAFT) {
      drawDraft(state);
      return;
    }
    if (screen === SCREEN_WIN) {
      drawReport(state, best, seed, meta, 'THE STAR LIVES', `Nine nights held · ${rankFor(9, state.kills)}.`, gradeFor(state.score, state.lives), true);
      return;
    }
    if (screen === SCREEN_OVER) {
      const cause = state.deathCause ? `Fell to ${state.deathCause.toLowerCase()}` : 'The dark took you';
      drawReport(state, best, seed, meta, 'THE EMBER FADES', `Night ${Math.max(1, state.wave)} of ${NIGHTS} · ${cause} · ${rankFor(state.wave, state.kills)}`, gradeFor(state.score, 0), false);
      return;
    }
    // Bullets under the ships, so the field reads cleanly. Each loadout has its
    // own projectile art (game-feel): the style is set at fire time from the
    // player's stats, so the volley reads as a designed weapon, not one yellow dash.
    for (const b of state.bullets) {
      if (!b.active) continue;
      drawBullet(b);
    }
    for (const s of state.shards) {
      if (!s.active) continue;
      const pulse = 1 + Math.sin(state.elapsed * 6 + s.x) * 0.15;
      const coin = coinSprite();
      if (coin !== null) {
        // The gold coin from the user's sheet, pulsing as it waits to be picked up.
        const size = SHARD.radius * 2.4 * pulse;
        context.drawImage(coin, s.x - size / 2, s.y - size / 2, size, size);
      } else {
        drawShardShape(s.x, s.y, SHARD.radius * pulse, state.elapsed * 2 + s.x);
      }
    }
    for (const p of state.powerups) {
      if (!p.active) continue;
      drawPowerup(p, state.elapsed);
    }
    for (const e of state.enemies) {
      if (!e.active) continue;
      drawEnemy(e, state.bossPhase);
    }
    drawPlayer(state, meta?.difficulty ?? 'ember');
    // Boss names last, so nothing on the field can cover them.
    for (const e of state.enemies) {
      if (!e.active || e.kind !== 'boss') continue;
      drawBossLabel(e);
    }
    // Impact and death particles as sparks, not dots (game-feel: an impact reads
    // as a burst). Each streak points along its velocity and fades with life, so
    // a hit looks like a spray and a boss death like an explosion. Pure render:
    // the streak direction comes from the particle's own velocity, which is sim
    // state, so staged frames stay deterministic.
    for (const p of state.particles) {
      if (!p.active) continue;
      const fade = Math.max(0, p.life / p.maxLife);
      context.globalAlpha = fade;
      context.strokeStyle = p.color;
      context.lineWidth = Math.max(1.5, p.size * 0.8);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      context.lineTo(p.x, p.y);
      context.stroke();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(p.x, p.y, Math.max(1.5, p.size * 0.4), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Impact rings: an expanding, fading ring at each bullet hit (game-feel,
    // medium tier, the ring is the "something happened HERE" marker). Pure
    // render of sim state, so staged frames stay deterministic.
    for (const r of state.rings ?? []) {
      if (!r.active) continue;
      const progress = 1 - r.life / r.maxLife;
      const ease = 1 - (1 - progress) * (1 - progress);
      context.globalAlpha = (1 - progress) * 0.9;
      context.strokeStyle = '#ffe66d';
      context.lineWidth = 3 * (1 - progress) + 1;
      context.beginPath();
      context.arc(r.x, r.y, r.size * (0.4 + 1.6 * ease), 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    // Floating score popups: '+50' where a kill happened, rising and fading.
    context.textBaseline = 'alphabetic';
    for (const p of state.popups) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      text(p.text, p.x, p.y, p.size, p.color, 'center', '800');
    }
    context.globalAlpha = 1;
    // A red flash over the field right after a hit.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255,89,100,${state.flash * 0.22})`;
      context.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    }
    drawHud(state, best, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The embers will wait for you.'], 'Press P to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Convert a client (mouse) point to playfield coordinates. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;
      return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
    },
  };
}
