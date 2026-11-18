// Keyboard and pointer input. Held keys give a steering vector; one-shot presses (start or
// restart, dash, pause, mute, draft picks) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse
// position is tracked in playfield coordinates for aiming and for draft-card clicks.

export const ACTION_CONFIRM = 1;
export const ACTION_DASH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK1 = 16;
export const ACTION_PICK2 = 32;
export const ACTION_PICK3 = 64;
export const ACTION_SEED = 128;
export const ACTION_ENDLESS = 256;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyJ']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const SEED = new Set(['KeyR']);
const ENDLESS = new Set(['KeyE']);
const PICK = new Map([['Digit1', ACTION_PICK1], ['Digit2', ACTION_PICK2], ['Digit3', ACTION_PICK3]]);

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let firing = false;
  let actions = 0;
  const mouse = { x: 0, y: 0, inside: false };
  // The last pointer-down point, for draft-card clicks; cleared when taken.
  let click = null;

  function trackMouse(event) {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.inside = true;
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (SEED.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SEED;
    } else if (ENDLESS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENDLESS;
    } else if (PICK.has(event.code)) {
      if (!event.repeat) actions |= PICK.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    firing = false;
  });
  target.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    firing = true;
    actions |= ACTION_CONFIRM;
    click = { x: mouse.x, y: mouse.y };
  });
  target.addEventListener('pointerup', () => {
    firing = false;
  });
  target.addEventListener('pointermove', trackMouse);
  target.addEventListener('pointerleave', () => {
    mouse.inside = false;
  });

  return {
    /** Steering vector, -1..1 on each axis (diagonals are normalised by the caller). */
    steer() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    get firing() {
      return firing;
    },
    get mouse() {
      return mouse;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointer-down point since the last call, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
