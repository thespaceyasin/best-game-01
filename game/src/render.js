// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A dark nebula sky, a three-layer starfield, glowing vector shapes for every entity,
// and canvas text for the HUD and the panels. Screen shake is a deterministic sine of the
// elapsed time, so a staged scene paints the same frame every time.

import { COMBO, ENEMY, FIELD, FONT, LIVES, PALETTE, PLAYER, POWERUP, SHARD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 66 };
const HEART_SIZE = 18;
const HEART_GAP = 8;

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
  if (wave >= 10) return 'EMBER MASTER';
  if (wave >= 7) return 'STAR KEEPER';
  if (wave >= 5) return 'VOID RUNNER';
  if (wave >= 3) return 'DRIFTER';
  if (kills >= 20) return 'SPARK HUNTER';
  return 'SPARK';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
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
    const spec = ENEMY[e.kind];
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
    if (e.hp > 1) {
      context.restore();
      context.save();
      context.translate(e.x, e.y);
      context.strokeStyle = 'rgba(242,245,255,0.85)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, e.radius + 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.hp) / ENEMY[e.kind].hp);
      context.stroke();
    }
    context.restore();
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
      const frac = 1 - player.dashCooldown / 2.4;
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
      context.fillRect(24, 80, 120 * Math.max(0, state.comboTimer / COMBO.window), 6);
    }
    text(state.wave > 0 ? waveLabel(state.wave) : 'GET READY', FIELD.width / 2, 18, 30, PALETTE.text, 'center', '700');
    const firstHeart = FIELD.width - 24 - LIVES * (HEART_SIZE + HEART_GAP) + HEART_GAP;
    text('LIVES', firstHeart - 14, 18, 30, PALETTE.text, 'right', '700');
    for (let life = 0; life < LIVES; life += 1) {
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
    // Wave banner, centre screen.
    if (state.bannerTimer > 0) {
      const alpha = Math.min(1, state.bannerTimer);
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

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Deterministic shake: a sine of the clock, never Math.random.
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 47) * state.shake * 9 : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 39) * state.shake * 9 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    context.fillStyle = '#0d1020';
    context.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    nebula();
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
        'You are the last ember of a dead star. Hold the field.',
        'Move with WASD or arrows. Your cannon fires on its own.',
        'Dash with Space or Shift. Catch shards, chain combos,',
        'grab power-ups — and survive the waves.',
        '',
        `BEST ${best}`,
      ];
      drawPanel('EMBERFALL', lines, 'Press Space or click to start');
      return;
    }
    drawHud(state, best, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The embers will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const lines = [
        `${finalLabel(state.score)}    ${bestLabel(Math.max(best, state.score))}`,
        `WAVE ${Math.max(1, state.wave)}  ·  ${state.kills} DESTROYED`,
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
