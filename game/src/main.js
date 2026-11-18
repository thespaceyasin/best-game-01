// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, draft, paused, game over and
// victory.
//
// ?seed=N fixes the night pattern. ?shot=start|play|boss|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, DIFFICULTY_ORDER, FEATS_KEY, LAST_KEY, LIVES, NIGHTS, STEP, WON_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BOON, EVENT_BOSS, EVENT_DASH, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_POWERUP, EVENT_SHOOT, EVENT_WAVE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_ENDLESS, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK1, ACTION_PICK2, ACTION_PICK3, ACTION_SEED, createInput } from './input.js';
import { createRenderer, SCREEN_DRAFT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, draftCardAt, reportClickAt, titleClickAt } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { loadSprites } from './sprites.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
let seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
let world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Profile state (kept across runs): unlocked feats, whether the star was ever relit. */
function readFeats() {
  try {
    const raw = window.localStorage.getItem(FEATS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFeats(feats) {
  try {
    window.localStorage.setItem(FEATS_KEY, JSON.stringify([...feats]));
  } catch {
    // Storage can be off: feats then last this visit only.
  }
}

function readLast() {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLast(run) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(run));
  } catch {
    // Storage can be off.
  }
}

function readWon() {
  try {
    return window.localStorage.getItem(WON_KEY) === '1';
  } catch {
    return false;
  }
}

function saveWon() {
  try {
    window.localStorage.setItem(WON_KEY, '1');
  } catch {
    // Storage can be off.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const meta = { difficulty: 'ember', endless: false, feats: [], lastRun: null, won: false, runFeats: world.runFeats() };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false, seed, meta);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toField(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let feats = readFeats();
  let lastRun = readLast();
  let won = readWon();
  let difficulty = 'ember';
  let endless = false;
  let runFeats = [];
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;
  let muted = false;
  // Hit-stop end time (real clock): the newest freeze owns the restore, so overlapping
  // hits extend rather than cut each other short (game-feel).
  let hitStopUntil = 0;

  function hitStop(ms) {
    hitStopUntil = Math.max(hitStopUntil, performance.now() + ms);
  }

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  /** Everything the title and report screens need, rebuilt every frame. */
  function meta() {
    return { difficulty, endless, feats: [...feats], lastRun, won, runFeats };
  }

  function startGame(sameSeed) {
    audio.unlock();
    if (!sameSeed) seed = Math.floor(Math.random() * 4294967296);
    world = createWorld(createRandom(seed), { difficulty, endless });
    runFeats = [];
    accumulator = 0;
    dashQueued = false;
    screen = SCREEN_PLAY;
    announce(`Playing. Three lives. Nine nights between the Hollow and the last ember.`);
  }

  function finishRun(didWin) {
    runFeats = world.runFeats();
    for (const id of runFeats) feats.add(id);
    saveFeats(feats);
    lastRun = { score: world.state.score, wave: world.state.wave, won: didWin, difficulty };
    saveLast(lastRun);
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (didWin) {
      won = true;
      saveWon();
    }
  }

  function endGame() {
    finishRun(false);
    screen = SCREEN_OVER;
    announce(`Game over. Score ${world.state.score}. Best ${best}. Night ${world.state.wave} of ${NIGHTS}. Felled by ${world.state.deathCause || 'the dark'}. Seed ${seed}.`);
  }

  function winGame() {
    finishRun(true);
    screen = SCREEN_WIN;
    announce(`Victory. The star lives. Score ${world.state.score}. Best ${best}.`);
  }

  function goMenu() {
    world.reset();
    screen = SCREEN_TITLE;
    announce('Emberfall. Vaelith is dying. Nine nights stand between the Hollow and its last ember. Press Space or click to start.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_PICK1) difficulty = DIFFICULTY_ORDER[0];
      else if (actions & ACTION_PICK2) difficulty = DIFFICULTY_ORDER[1];
      else if (actions & ACTION_PICK3) difficulty = DIFFICULTY_ORDER[2];
      if (actions & ACTION_ENDLESS && won) endless = !endless;
      const click = input.takeClick();
      if (click !== null) {
        const hit = titleClickAt(click.x, click.y);
        if (hit !== null) {
          if (hit.difficulty) {
            difficulty = hit.difficulty;
            endless = false;
          } else if (hit.endless && won) {
            endless = !endless;
          }
          return;
        }
        audio.unlock();
        startGame(false);
      } else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame(false);
      }
      return;
    }
    if (screen === SCREEN_DRAFT) {
      // A draft pick: key 1/2/3, or a click on a card.
      let pick = -1;
      if (actions & ACTION_PICK1) pick = 0;
      else if (actions & ACTION_PICK2) pick = 1;
      else if (actions & ACTION_PICK3) pick = 2;
      const click = input.takeClick();
      if (pick === -1 && click !== null) pick = draftCardAt(click.x, click.y);
      if (pick >= 0 && pick < world.state.draft.length) {
        const id = world.state.draft[pick];
        world.applyBoon(id);
        audio.powerup();
        screen = SCREEN_PLAY;
        announce(`Boon taken. Night ${world.state.wave + 1} of ${NIGHTS} is coming.`);
      }
      return;
    }
    if (screen === SCREEN_WIN || screen === SCREEN_OVER) {
      const click = input.takeClick();
      if (click !== null) {
        const hit = reportClickAt(click.x, click.y);
        if (hit === 'again') startGame(false);
        else if (hit === 'seed') startGame(true);
        else if (hit === 'menu') goMenu();
        return;
      }
      if (actions & ACTION_SEED) {
        startGame(true);
      } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        // Esc/P goes back to the menu; Space/Enter flies again.
        if (actions & ACTION_PAUSE) goMenu();
        else startGame(false);
      }
      return;
    }
    input.takeClick();
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_DASH) dashQueued = true;
  }

  // Feedback tiers (game-feel): small = pickup (ping + a few sparks, no shake, no stop);
  // medium = power-up / wave clear (chime + banner); large = boss kill, player hit, death
  // (big burst + full trauma shake + a short hit-stop). Shake and hit-stop are for impacts
  // only, never for routine movement.
  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_PICKUP) audio.pickup(world.state.combo);
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_BOSS) {
      audio.boss();
      hitStop(120);
    }
    if (events & EVENT_BOON) audio.powerup();
    if (events & EVENT_HIT) {
      audio.hit();
      hitStop(50);
      announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_WIN) {
      audio.win();
      hitStop(120);
      winGame();
    } else if (events & EVENT_OVER) {
      hitStop(150);
      endGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    if (screen === SCREEN_DRAFT) {
      // The draft holds the field still; the world ticks its own draft branch.
      world.step(STEP, null, false);
      return;
    }
    const steer = input.steer();
    const mouse = input.mouse;
    const control = {
      steerX: steer.x,
      steerY: steer.y,
      aimX: mouse.x,
      aimY: mouse.y,
      aimInside: mouse.inside,
      firing: input.firing,
      dash: dashQueued,
    };
    dashQueued = false;
    playEvents(world.step(STEP, control, false));
    if (world.state.waveState === 'draft' && screen === SCREEN_PLAY) {
      screen = SCREEN_DRAFT;
      announce(`Night ${world.state.wave} held. Take one ember: press 1, 2 or 3.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    handleActions();
    // During a hit-stop the world holds still (real time; input still queues through it).
    if (now < hitStopUntil) {
      accumulator = 0;
      last = now;
      renderer.draw(world.state, screen, best, muted, seed, meta());
      return;
    }
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_DRAFT) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_DRAFT)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, muted, seed, meta());
  }

  // Leaving the tab pauses a running game rather than letting enemies close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Vaelith is dying. Nine nights stand between the Hollow and its last ember. Press Space or click to start.');
  requestAnimationFrame(frame);
}

// Sprite art loads before the first frame (and before __shotReady), so a staged
// scene always paints with the art in place; the sim never depends on it.
await loadSprites();

if (shot) runShot(shot);
else runGame();
