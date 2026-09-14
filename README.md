# Vibe Robots

A server-authoritative 3D factory racing game for one player against three CPU robots or 2–8 online players, built with React, Three.js, React Three Fiber, Vinext, and Cloudflare Durable Objects.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Start a solo race, or create an online room in one browser context and join its invite URL in another.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

## Art pipeline

The production models are generated from a deterministic Blender script. Blender
4.5 LTS and `cwebp` are required to regenerate assets.

```bash
npm run assets:build
npm run assets:validate
```

`assets:build` writes editable source scenes to `art/blender/source`, portrait
masters to `art/blender/renders`, eight individually loadable robot GLBs to
`public/assets/models/robots`, the shared modular board kit to
`public/assets/models/factory-kit.glb`, and the greenhouse, plants, lanterns and
workbench kit to `public/assets/models/garden-kit.glb`. Runtime portrait WebPs are checked in so
the deployed application does not require Blender. See `docs/art-pipeline.md`
for animation contracts, ImageGen prompts, and performance budgets.

## Architecture

- `game/engine.ts` — deterministic 2005-compatible rules engine
- `game/bot.ts` — deterministic, route-aware solo opponent programming
- `game/content/` — typed Programs, Options, robots, boards, and courses
- `worker/index.ts` — Vinext Worker + SQLite `MatchRoom` Durable Object
- `components/game.tsx` — server connection and the authority/presentation boundary
- `components/factory-scene.tsx` — demand-rendered R3F diorama and GLB animation
- `game/presentation.ts` — deterministic event-to-keyframe presentation compiler
- `docs/rules-audit.md` — rule and Option source matrix

Production is configured for [vibe-robots.ailocalops.com](https://vibe-robots.ailocalops.com/). Multiplayer and solo match state are room-based and authoritative, so the AILO local-save bridge is intentionally disabled.

## Legal

Vibe Robots is an independent, unofficial, non-commercial adaptation inspired by the 2005 RoboRally rules. The name RoboRally is used only for factual compatibility attribution. All shipped artwork, models, sounds, layouts, and explanatory language are original.
