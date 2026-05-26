# Lumber & Lairy 🏎️

A chaotic British, PS1-style arcade kart racer for [finleywatson.com](https://finleywatson.com/racer/).
Vite + TypeScript + Three.js. Single-player prototype — low-poly, crunchy textures,
overcast London streets, rooftop shortcuts and a tea-crate kart.

## Develop

```bash
cd racer-src
npm install
npm run dev        # local dev server (hot reload)
npm run build      # typecheck + production build into ../racer
npm run preview    # preview the production build
npm run typecheck  # type-check only
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Accelerate | W / ↑ | ▲ |
| Brake / reverse | S / ↓ | ▼ |
| Steer left | A / ← | ◀ |
| Steer right | D / → | ▶ |
| Drift | Space | DRIFT |
| Boost ("Leggit") | Shift | LEGGIT |
| Restart | R | ↻ button |

Drift long enough through a corner to bank a **mini-turbo** that tops up the boost meter.

## Deployment

The site is served straight from the branch root on GitHub Pages, so this project
builds into the committed `../racer/` folder (`base: '/racer/'`). After changing the
game, run `npm run build` and commit the regenerated `racer/` output — it goes live
at `finleywatson.com/racer` on push. No CI step required.

## Architecture & future hooks

```
src/
  main.ts                bootstrap
  config.ts              all tuning + InputState shape
  game/
    Game.ts              scene/loop/race-state orchestration
    PlayerKart.ts        kart mesh + cosmetic flourishes
    Physics.ts           arcade physics (facing vs. travel heading) + collision
    Track.ts             curve-based track, barriers, scenery, obstacles, checkpoints
    CameraController.ts  smoothed chase camera
    InputController.ts   keyboard + touch -> unified InputState
    UI.ts                HUD / countdown / results
    textures.ts          procedural crunchy textures (NearestFilter)
  styles/main.css
```

Designed so later features slot in without rework (see inline `Future:` comments):

- **Multiplayer / AI**: `PlayerKart` is the unit to duplicate; feed each one its own
  `InputState` source (`Game` already anticipates a `karts[]` array).
- **Gadgets / sabotage**: apply effects on `KartState` in `Physics.stepKart`.
- **Destructible obstacles / traffic**: `Track.Obstacle` is the place to add health
  and movement; collision hook is in `Physics.resolveCollisions`.
- **Leaderboards**: best lap persists to `localStorage` now — swap for a service.
- **Unlockable tracks**: `Track` takes a definition; add more layouts.
