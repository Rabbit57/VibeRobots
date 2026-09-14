# Garden workshop art pipeline

## Art direction

An original cozy anime garden workshop: warm ivory paper, sage controls, apricot
highlights, rounded enamel robots with smiling faces, honey oak board edges,
terracotta pots, lanterns, workbenches, and a miniature greenhouse. The game
keeps board symbols and robot headings visible against the softer environment.

The launch screen uses `public/assets/images/garden-workshop.webp`. Course cards
use `garden-course-postcards.webp`, a single three-panel generated illustration
atlas displayed with CSS background positions. These are decorative course
illustrations; the live 3D board is the authoritative course layout.

Both images were created with the built-in ImageGen tool. Full prompts and lossless
masters are saved in `art/reference/garden-workshop-prompts.md`,
`garden-workshop-key-art.png`, `garden-course-prompts.md`, and
`garden-course-postcards.png`. The prior art is retained as historical source.

## Rebuild the assets

```sh
npm run assets:build
npm run assets:validate
```

Requires Blender 4.5 LTS and `cwebp` on PATH. The scripts generate all runtime
models and portraits, so neither Blender nor an image generation API is needed
at build or runtime. `tools/blender/build_assets.py` writes eight robot GLBs,
eight transparent portrait masters and their WebP versions, and the modular
board kit. `tools/blender/build_garden.py` writes the five-prop garden kit.
Editable `.blend` source scenes are saved under `art/blender/source`.

Static robot parts and garden props are joined by material to reduce draw calls.
RobotRoot owns eight shared animation clips: idle, move, turn, bump, hit,
power-down, respawn, and victory. Blender front is converted to the game's
north-facing convention with a presentation-only half-turn wrapper.

## Motion and presentation

- Slow idle breathing and swaying keep the robots alive during planning.
- Board arrows drift gently along conveyor directions; toothed gears turn when
  the gear stage runs.
- Moves use short eased translations, heading changes, and a little bounce.
- Impacts, destruction, checkpoint collection, and respawns emit colored particles.
- Lasers use a coral beam and bright core; checkpoints and victories play soft
  synthesized chimes. The sound toggle controls all game audio.
- The launch art drifts slowly with falling petals. Cards lift on hover, selected
  registers pop into place, and the finish screen floats the robot portrait.
- Reduced motion disables ambient motion, camera following, and GLB animation;
  game events still complete and remain readable. Eco mode omits ambient motion,
  shadows, and some scenery. Static fixtures disable ambient scene animation for
  reproducible screenshots.

The authoritative engine is unchanged. The presentation queue now gives each
active action its own timer, so changing queue state cannot cancel playback.
Submitted register cards remain visible while a plan executes.

## Validation

`npm run assets:validate` checks ten GLBs, all eight clip names, required board
and garden nodes, triangle and file-size limits, editable sources, and runtime
artwork. Total GLB payload remains below 6 MB and each generated runtime image
is below 700 KB. The renderer exposes frame, call, and triangle counts through
`window.__VIBE_PERF__` in development. Ambient mode intentionally renders while
visible; reduced-motion and eco scenes settle back to demand rendering.

`tests/e2e/visual.spec.ts` covers home, lobby, programming, lasers, destruction,
respawn, victory, solo victory, and defeat at desktop and landscape tablet sizes.
The solo browser test waits for the visual queue to drain before reconnection,
in addition to checking authoritative CPU turn resolution. Review screenshots
are in `artifacts/visual-slice`.
