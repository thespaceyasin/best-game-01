// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A dark nebula sky, a three-layer starfield, the glowing heart of the last star
// at the field's centre, glowing vector shapes for every entity, and canvas text for the
// HUD and the panels. Screen shake is a deterministic sine of the elapsed time, so a
// staged scene paints the same frame every time.

import { BOONS, BOSS, COMBO, ENEMY, FIELD, FONT, LIVES, NIGHTS, PALETTE, PLAYER, POWERUP, SHARD } from './config.js';

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

/** The three draft cards: three 300x260 cards in a row, centred on the field. */
export const DRAFT_CARDS = { width: 300, height: 260, gap: 24, top: 230 };

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

  function nebula() {
    const blobs = [
      { x: 240, y: 150, r: 330, color: PALETTE.nebulaA },
      { x: 1080, y: 110, r: 300, color: PALETTE.nebulaB },
      { x: 640, y: 640, r: 380, color: PALETTE.nebulaC },
    ];
    for (const blob of blobs) {
      const gradient = context.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(1, 'rgba(10,12,22,0)');
      context.fillStyle = gradient;
      context.fillRect(blob.x - blob.r, blob.y - blob.r, blob.r * 2, blob.r * 2);
    }
  }

  /** The heart of Vaelith, the last star: a slow pulse of ember-light at the field's centre. */
  function drawHearth(state) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;
    const pulse = 0.75 + Math.sin(state.elapsed * 1.4) * 0.25;
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, 130);
    gradient.addColorStop(0, `rgba(255,158,0,${0.34 * pulse})`);
    gradient.addColorStop(0.5, `rgba(255,110,40,${0.16 * pulse})`);
    gradient.addColorStop(1, 'rgba(255,110,40,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, 130, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(255,230,109,${0.5 * pulse})`;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, 34 + Math.sin(state.elapsed * 1.4) * 3, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = `rgba(255,230,109,${0.85 * pulse})`;
    context.beginPath();
    context.arc(cx, cy, 12, 0, Math.PI * 2);
    context.fill();
  }

  function drawStars(state) {
    for (const star of state.stars) {
      context.fillStyle = `rgba(226,232,255,${0.35 + star.factor * 0.6})`;
      context.fillRect(star.x, star.y, star.size, star.size);
    }
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

  function drawEnemy(e) {
    const spec = e.kind === 'boss' ? BOSS[3] : ENEMY[e.kind];
    context.save();
    context.translate(e.x, e.y);
    if (e.kind === 'drifter') {
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
      // A Night Warden: a huge crowned ember with burning eyes.
      const specBoss = BOSS[3];
      const color = e.name === 'CINDER MAW' ? '#ff6b35' : e.name === 'THE HOLLOW CHOIR' ? '#b5179e' : '#7209b7';
      void specBoss;
      const pulse = 1 + Math.sin(e.age * 3) * 0.05;
      context.scale(pulse, pulse);
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
      // Burning eyes.
      context.fillStyle = '#ffe66d';
      context.beginPath();
      context.arc(-e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
      context.arc(e.radius * 0.22, -e.radius * 0.1, e.radius * 0.11, 0, Math.PI * 2);
      context.fill();
      // Crown spikes.
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
    // Hit points left, as a thin arc over the tough ones.
    if (e.hp > 1 && e.kind !== 'boss') {
      context.restore();
      context.save();
      context.translate(e.x, e.y);
      context.strokeStyle = 'rgba(242,245,255,0.85)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, e.radius + 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.hp) / e.maxHp);
      context.stroke();
    }
    context.restore();
    // A hit flashes the enemy white for a few frames, so every bullet landing reads.
    if (e.flash > 0) {
      context.save();
      context.translate(e.x, e.y);
      context.globalAlpha = Math.min(1, e.flash * 6);
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.85, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // A boss wears its name over its head.
    if (e.kind === 'boss') {
      context.font = `700 20px ${FONT}`;
      context.fillStyle = '#ffe66d';
      context.textAlign = 'center';
      context.fillText(e.name, e.x, e.y - e.radius - 18);
    }
  }

  function drawPlayer(state) {
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
      context.moveTo(-PLAYER.radius * 0.8, -6);
      context.lineTo(-PLAYER.radius - 14 * flicker, 0);
      context.lineTo(-PLAYER.radius * 0.8, 6);
      context.closePath();
      context.fill();
      context.restore();
    }
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
    context.restore();
    // Shield ring.
    if (player.shield) {
      context.strokeStyle = 'rgba(125,249,255,0.9)';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(player.x, player.y, PLAYER.radius + 9 + Math.sin(state.elapsed * 5) * 2, 0, Math.PI * 2);
      context.stroke();
    }
    // Dash cooldown: a small arc under the ship while it recharges.
    if (player.dashCooldown > 0) {
      const frac = 1 - player.dashCooldown / player.stats.dashCooldown;
      context.strokeStyle = 'rgba(125,249,255,0.55)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(player.x, player.y, PLAYER.radius + 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      context.stroke();
    }
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

  function drawHud(state, best, muted) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 30, PALETTE.text, 'left', '700');
    if (state.mult > 1) {
      text(`x${state.mult} COMBO ${state.combo}`, 24, 54, 20, '#ffd166', 'left', '700');
      context.fillStyle = 'rgba(255,209,102,0.25)';
      context.fillRect(24, 80, 120, 6);
      context.fillStyle = '#ffd166';
      context.fillRect(24, 80, 120 * Math.max(0, state.comboTimer / state.player.stats.comboWindow), 6);
    }
    const boonCount = Object.keys(state.boons).length;
    if (boonCount > 0) text(`BOONS ${boonCount}`, 24, 96, 18, '#7dff9e', 'left', '700');
    text(state.wave > 0 ? `${nightLabel(state.wave)} / ${NIGHTS}` : 'GET READY', FIELD.width / 2, 18, 30, PALETTE.text, 'center', '700');
    // A Warden's health bar, under the night label.
    if (state.boss !== null && state.boss.active) {
      const barW = 420;
      const barX = (FIELD.width - barW) / 2;
      const barY = 56;
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(barX, barY, barW, 12);
      context.fillStyle = '#ff5964';
      context.fillRect(barX, barY, barW * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
      context.strokeStyle = 'rgba(242,245,255,0.6)';
      context.lineWidth = 1.5;
      context.strokeRect(barX, barY, barW, 12);
    }
    const firstHeart = FIELD.width - 24 - 5 * (HEART_SIZE + HEART_GAP) + HEART_GAP;
    text('LIVES', firstHeart - 14, 18, 30, PALETTE.text, 'right', '700');
    for (let life = 0; life < 5; life += 1) {
      const x = firstHeart + life * (HEART_SIZE + HEART_GAP);
      const y = 24;
      context.fillStyle = life < state.lives ? '#ff5964' : 'rgba(255,255,255,0.14)';
      context.beginPath();
      context.moveTo(x + HEART_SIZE / 2, y + HEART_SIZE * 0.9);
      context.bezierCurveTo(x - 2, y + HEART_SIZE * 0.45, x + 1, y, x + HEART_SIZE * 0.32, y + HEART_SIZE * 0.28);
      context.bezierCurveTo(x + HEART_SIZE * 0.45, y - 1, x + HEART_SIZE * 0.55, y - 1, x + HEART_SIZE * 0.68, y + HEART_SIZE * 0.28);
      context.bezierCurveTo(x + HEART_SIZE - 1, y, x + HEART_SIZE + 2, y + HEART_SIZE * 0.45, x + HEART_SIZE / 2, y + HEART_SIZE * 0.9);
      context.fill();
    }
    // Active power-up timers, bottom right.
    let line = 0;
    context.textBaseline = 'alphabetic';
    if (state.player.shield) {
      text('SHIELD READY', FIELD.width - 24, FIELD.height - 24 - line * 26, 18, '#7df9ff', 'right', '700');
      line += 1;
    }
    if (state.player.rapidTimer > 0) {
      text(`RAPID FIRE ${Math.ceil(state.player.rapidTimer)}s`, FIELD.width - 24, FIELD.height - 24 - line * 26, 18, '#ffe66d', 'right', '700');
      line += 1;
    }
    if (state.player.magnetTimer > 0) {
      text(`MAGNET ${Math.ceil(state.player.magnetTimer)}s`, FIELD.width - 24, FIELD.height - 24 - line * 26, 18, '#ff8fa3', 'right', '700');
      line += 1;
    }
    if (muted) text('MUTED (M)', 24, FIELD.height - 24, 16, PALETTE.muted, 'left');
    else text('M: mute   P: pause', 24, FIELD.height - 24, 16, PALETTE.muted, 'left');
    // Night banner, centre screen: full strength, then a quick fade.
    if (state.bannerTimer > 0) {
      const alpha = state.bannerTimer > 0.5 ? 1 : state.bannerTimer / 0.5;
      context.save();
      context.globalAlpha = alpha;
      text(state.bannerText, FIELD.width / 2, 120, 44, '#ffe66d', 'center', '800');
      context.restore();
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,12,22,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 52, PALETTE.text, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, '#ffd166', 'center', '700');
  }

  /** The draft after a cleared night: three boon cards, pick one with 1/2/3 or a click. */
  function drawDraft(state) {
    context.fillStyle = 'rgba(10,12,22,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`NIGHT ${state.wave} CLEARED`, FIELD.width / 2, 110, 44, '#7dff9e', 'center', '800');
    text('Choose an ember-boon — the Hollow grows stronger each night.', FIELD.width / 2, 158, 22, PALETTE.muted, 'center');
    const total = DRAFT_CARDS.width * 3 + DRAFT_CARDS.gap * 2;
    const x0 = (FIELD.width - total) / 2;
    for (let i = 0; i < 3; i += 1) {
      const boon = BOONS.find((b) => b.id === state.draft[i]);
      const cx = x0 + i * (DRAFT_CARDS.width + DRAFT_CARDS.gap);
      const cy = DRAFT_CARDS.top;
      context.fillStyle = PALETTE.panel;
      context.fillRect(cx, cy, DRAFT_CARDS.width, DRAFT_CARDS.height);
      context.strokeStyle = '#ffd166';
      context.lineWidth = 2;
      context.strokeRect(cx, cy, DRAFT_CARDS.width, DRAFT_CARDS.height);
      text(`[${i + 1}]`, cx + DRAFT_CARDS.width / 2, cy + 56, 22, '#ffd166', 'center', '700');
      if (boon) {
        text(boon.name, cx + DRAFT_CARDS.width / 2, cy + 108, 26, PALETTE.text, 'center', '800');
        text(boon.desc, cx + DRAFT_CARDS.width / 2, cy + 152, 20, PALETTE.muted, 'center');
        const owned = state.boons[boon.id] ?? 0;
        text(owned > 0 ? `Owned x${owned}  ·  max ${boon.max}` : `max ${boon.max}`, cx + DRAFT_CARDS.width / 2, cy + 196, 18, PALETTE.muted, 'center');
      }
    }
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, DRAFT_CARDS.top + DRAFT_CARDS.height + 52, 24, '#ffd166', 'center', '700');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, muted, seed) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Trauma-based shake: amplitude is trauma squared, summed sines at unrelated rates —
    // smooth, never a per-frame random buzz (game-feel). Deterministic: a sine of the
    // clock, so a staged scene paints the same frame every time.
    const trauma = state.shake * state.shake;
    const shakeX = trauma > 0 ? Math.sin(state.elapsed * 47) * trauma * 12 : 0;
    const shakeY = trauma > 0 ? Math.cos(state.elapsed * 39) * trauma * 12 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    context.fillStyle = '#0d1020';
    context.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    nebula();
    drawHearth(state);
    drawStars(state);
    // Bullets under the ships, so the field reads cleanly.
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = '#ffe66d';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    for (const s of state.shards) {
      if (!s.active) continue;
      const pulse = 1 + Math.sin(state.elapsed * 6 + s.x) * 0.15;
      drawShardShape(s.x, s.y, SHARD.radius * pulse, state.elapsed * 2 + s.x);
    }
    for (const p of state.powerups) {
      if (!p.active) continue;
      drawPowerup(p, state.elapsed);
    }
    for (const e of state.enemies) {
      if (!e.active) continue;
      drawEnemy(e);
    }
    drawPlayer(state);
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // A red flash over the field right after a hit.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255,89,100,${state.flash * 0.22})`;
      context.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    }
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Vaelith, the last star, is dying. Nine nights of the',
        'Hollow are coming for its heart. You are its last',
        'ember-keeper: hold the field, choose your boons,',
        'slay the three Night Wardens — and relight the star.',
        '',
        'Move with WASD or arrows. Your cannon fires on its own.',
        'Dash with Space or Shift. Catch shards, chain combos.',
        '',
        `BEST ${best}`,
      ];
      drawPanel('EMBERFALL', lines, 'Press Space or click to start');
      return;
    }
    if (screen === SCREEN_DRAFT) {
      drawHud(state, best, muted);
      drawDraft(state);
      return;
    }
    drawHud(state, best, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The embers will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_WIN) {
      const lines = [
        `${finalLabel(state.score)}    ${bestLabel(Math.max(best, state.score))}`,
        `NIGHT 9 OF 9  ·  ${state.kills} DESTROYED  ·  ${Object.keys(state.boons).length} BOONS`,
        `SEED ${seed}`,
        `RANK: ${rankFor(9, state.kills)}`,
        '',
      ];
      drawPanel('THE STAR LIVES', lines, 'Press Space or click to fly again');
    } else if (screen === SCREEN_OVER) {
      // The death screen names the run: seed, depth, cause (roguelike), rank, best.
      const lines = [
        `${finalLabel(state.score)}    ${bestLabel(Math.max(best, state.score))}`,
        `NIGHT ${Math.max(1, state.wave)} OF ${NIGHTS}  ·  ${state.kills} DESTROYED`,
        state.deathCause ? `FELL TO ${state.deathCause}` : '',
        `SEED ${seed}`,
        `RANK: ${rankFor(state.wave, state.kills)}`,
        '',
      ];
      drawPanel('THE EMBER FADES', lines, 'Press Space or click to fly again');
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
