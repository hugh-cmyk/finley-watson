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
| Steer | A / D, ← / →, or **move the mouse** | ◀ ▶ |
| Jump | Space | JUMP |
| Drift | Shift | DRIFT |
| Boost ("Leggit") | B or **left mouse button** | LEGGIT |
| Restart | R | ↻ button |

Steer with the mouse like a wheel — move it left/right, centre is straight ahead
(it stays inactive until you first move the mouse, so keyboard-only play is unaffected).
**Jump** to clear obstacles — one press hops, a second press mid-air gives an extra
leap (max two before landing). Cones go under any hop; the parody double-decker buses
need the timing or a double-jump. Drift long enough through a corner to bank a
**mini-turbo** that tops up the boost meter.

Collisions are arcade-style: barriers and buses slow and deflect you in proportion to
how head-on the hit is, so you scrape and glance off rather than getting stuck. Jump
and gravity feel are tuned via the constants at the top of `src/game/Physics.ts`
(`JUMP_FORCE`, `DOUBLE_JUMP_FORCE`, `GRAVITY`, `MAX_JUMPS`, `COLLISION_SPEED_RETAINED`,
`COLLISION_BOUNCE_FORCE`, `WALL_SLIDE_FACTOR`, …).

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
