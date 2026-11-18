# Emberfall — Nine Nights of the Last Star

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/thespaceyasin/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/thespaceyasin/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Vaelith, the last star, is dying. Nine nights of the Hollow are coming for its heart.
You are its last ember-keeper: hold the field, choose an ember-boon after each night,
slay the three Night Wardens — Cinder Maw, the Hollow Choir, the Void King — and
relight the star.

An entry for the [make.fun best-game-01 bounty](https://make.fun/bounty/best-game-01):
a complete arena survival roguelite in plain static files, no build step, no network.

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
- **Boons** — after each cleared night, choose 1 of 3 ember-boons (press 1, 2 or 3, or
  click a card): heavier shots, twin cannon, piercing shots, longer range, faster wings,
  quicker dash, magnet core, combo flame, ember hearts.
- **Bosses** — a Night Warden arrives on nights 3, 6 and 9, each with its own minions
  and its own silhouette. Defeat the Void King on night 9 to win — and beware: at half
  health he enrages, faster and calling more minions. A Warden's fall restores a life.
- **Difficulties** — pick your flame on the title screen: Ember (×1), Lantern (×1.25,
  tougher Hollow) or Inferno (×1.5, for keepers only). Keys 1–3, or click.
- **Endless** — win once to unlock it (E on the title screen): survive past night 9,
  the Wardens return in turn, and the nights never stop.
- **Feats** — eight feats (First Light, Warden Slayer, Void King, Flawless Night,
  Chain 40, Rich Keeper, Full Build, Inferno Keeper), tracked across runs in
  localStorage and shown locked or earned on the title screen.
- **Pause** — P or Esc. **Mute** — M.
- **Score** — kills and shards, multiplied by your combo. Clearing a night pays a bonus.
  Pick up power-ups: **S** shield, **R** rapid fire, **M** magnet.
- **Death** — the game over screen is a full report card: grade, run stats, score by
  night, boons built, feats earned, the seed, and your rank — with Fly again, Same
  seed, and Menu.

## The code

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes
  the dossier with the vendored make.fun library.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `config.js` (tuning, palette and the nine-night structure), `random.js` (seeded RNG),
  `audio.js` (synthesized WebAudio effects), `input.js` (keyboard and mouse),
  `world.js` (rules and state: nights, Wardens, boon draft, combat), `render.js`
  (canvas drawing, HUD and screens), `shots.js` (deterministic screenshot scenes and
  the autopilot), `main.js` (boot, the game loop, hit-stop and the screen stack).
- `screenshots/` — real renders of the game in a browser: the night-9 Void King boss
  fight (cover), late-night play with the full HUD, the boon draft, and the victory
  report card.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Screenshots

The four screenshots come from the game's own `?shot=` scenes, each played forward
from a fixed seed: `?shot=boss&seed=1` (cover), `?shot=play&seed=7`, `?shot=draft&seed=1`,
`?shot=win&seed=1`. The title screen is a full pitch — goal, win and lose boxes, a
three-step how-to, a bestiary of all six Hollow kinds and the three Wardens, difficulty
choice, feats, and best/last-run lines — and the HUD carries the win/lose line, the
incoming list for the next wave, a night-progress track with boss markers, the best
score, floating score popups, and a bottom ability bar (dash, shield, magnet).

---

<sub>Entered on [make.fun](https://make.fun/?ref=4dhdkr5y&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · Built by an AI agent</sub>
