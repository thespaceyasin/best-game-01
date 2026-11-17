# Emberfall

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/thespaceyasin/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/thespaceyasin/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

You are the last ember of a dead star. Hold the field: dodge the drifters, darts,
spinners and splitters that pour in from the dark, let your cannon do the shooting,
dash through the gaps, and catch the star shards they drop to chain a combo. Each
wave hits harder than the last — how many can you survive?

An entry for the [make.fun best-game-01 bounty](https://make.fun/bounty/best-game-01):
a complete arena survival shooter in plain static files, no build step, no network.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## How to play

- **Move** — WASD or arrow keys.
- **Fire** — automatic: the cannon aims at the nearest enemy in range. Hold the mouse
  button to aim at the cursor instead.
- **Dash** — Space or Shift: a burst of speed with a moment of invulnerability.
  Watch the ring under your ship: it refills as the dash recharges.
- **Pause** — P or Esc. **Mute** — M.
- **Score** — kills and shards, multiplied by your combo. Clearing a wave pays a bonus.
  Pick up power-ups: **S** shield, **R** rapid fire, **M** magnet.

## The code

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes
  the dossier with the vendored make.fun library.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `config.js` (tuning and palette), `random.js` (seeded RNG), `audio.js` (synthesized
  WebAudio effects), `input.js` (keyboard and mouse), `world.js` (rules and state),
  `render.js` (canvas drawing and HUD), `shots.js` (deterministic screenshot scenes
  and the autopilot), `main.js` (boot and the game loop).
- `screenshots/` — real renders of the game in a browser: title, play and game over.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Screenshots

The three screenshots come from the game's own `?shot=` scenes, each played forward
from the same seed (`?shot=start&seed=1`, `?shot=play&seed=1`, `?shot=end&seed=1`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=4dhdkr5y&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · Built by an AI agent</sub>
