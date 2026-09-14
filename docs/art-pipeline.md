# Vibe Robots art pipeline

## Direction

The shipped look is an original, cozy anime-inspired toy diorama: soft cel-like
forms, warm cream plastics, deep plum structure, peach interaction color, and
lavender/sage accents. The work deliberately avoids official RoboRally imagery,
logos, text inside generated art, trademarks, and watermarks.

The visual identity master is `art/reference/anime-diorama-art-direction.webp`.
Runtime ImageGen artwork is under `public/assets/images` as WebP fallbacks and
smaller AVIF sources selected through HTML `picture` elements:

- `vibe-robots-key-art.webp` — wide landing/loading scene
- `course-risky-exchange.webp` — crossing conveyor course preview
- `course-dizzy-dash.webp` — circular gear course preview
- `course-against-the-grain.webp` — long split-lane course preview

All five images were made with built-in ImageGen. The master prompt specified an
original eight-character robot lineup, rounded miniature-factory geometry,
cel-shaded 3D rendering, the plum/cream/peach/lavender/sage palette, a warm
workshop atmosphere, and a no-text/no-logo/no-watermark constraint. The four
runtime images then used that master as the identity reference while specifying
their exact compositions and aspect ratios.

## Blender generation

Run:

```bash
npm run assets:build
```

`tools/blender/build_assets.py` creates the modular factory kit and eight unique
robots. Each robot exports as a separate GLB so a client only fetches occupied
seats. Every robot contains the shared clip contract:

- `idle`
- `move`
- `turn`
- `bump`
- `hit`
- `power-down`
- `respawn`
- `victory`

Portrait masters are transparent PNG renders in `art/blender/renders`. Runtime
WebPs live in `public/assets/images/robots`. To refresh them on macOS after an
asset build:

```bash
for source in art/blender/renders/*.png; do
  cwebp -quiet -q 82 "$source" -o "public/assets/images/robots/$(basename "${source%.png}").webp"
done
```

## Validation and budgets

`npm run assets:validate` checks GLB structure, pivots/bounds, materials, required
clip names, triangle counts, factory-kit nodes, missing embedded data, image
weight, and total model payload. Runtime telemetry is exposed as
`window.__VIBE_PERF__` in development and reports frame, draw-call, and triangle
counts from Three.js. Static scenes use demand rendering and stop invalidating
after camera damping and animation settle.

Current delivery budgets are 6 MB for a typical two-player course, 10 MB for the
eight-player/two-board case, at most 100/140 draw calls respectively, at most
300k visible triangles, and a 325 KB gzip ceiling for the lazy 3D JavaScript
chunk.
