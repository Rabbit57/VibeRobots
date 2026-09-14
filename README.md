# Vibe Robots

A server-authoritative 3D factory racing game for 2–8 players, built with React, Three.js, React Three Fiber, Vinext, and Cloudflare Durable Objects.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Create a room in one browser context and join its invite URL in another.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

## Architecture

- `game/engine.ts` — deterministic 2005-compatible rules engine
- `game/content/` — typed Programs, Options, robots, boards, and courses
- `worker/index.ts` — Vinext Worker + SQLite `MatchRoom` Durable Object
- `components/game.tsx` — accessible DOM controls and R3F factory rendering
- `docs/rules-audit.md` — rule and Option source matrix

Production is configured for [vibe-robots.ailocalops.com](https://vibe-robots.ailocalops.com/). Match state is room-based and authoritative, so the AILO local-save bridge is intentionally disabled.

## Legal

Vibe Robots is an independent, unofficial, non-commercial adaptation inspired by the 2005 RoboRally rules. The name RoboRally is used only for factual compatibility attribution. All shipped artwork, models, sounds, layouts, and explanatory language are original.
