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
Robot shells use smoother enamel, machined bezels, service panels, fasteners,
running lights, wheel hubs and tire treads. The eight source animation clips remain
in the GLBs for editing, but runtime motion has one controller. Blender front is
converted to the game's north-facing convention with a half-turn wrapper.

## Motion and presentation

- Movement uses absolute smoothstep interpolation over an 850 ms action, with a
  short hold at its destination. Turns take 750 ms. Fast playback is 2.5×.
- Small suspension and impact movements act on an inner group. They never alter
  the robot's board position. No GLB root animation competes with travel.
- Each action waits for the 3D scene to acknowledge its revision before its timer
  starts. Events advance atomically; authority reconciles only after the queue
  drains. The submitted program and its hand remain visible during execution.
- The engine emits every register stage, even when no robot is affected, plus
  explicit heading changes at conveyor bends. The HUD follows these events.
- Camera movement is manual. Center restores an overview; drag or scroll explores.
- Reduced motion removes travel and ambient effects while retaining reading time.
  Auto uses Eco on software WebGL renderers; High keeps full detail and shadows.
- Printed conveyor surfaces use amber single arrows for normal belts and blue
  double arrows with 2× labels for express belts. Pits use hazard stripes; repairs,
  upgrades, docks, gears and laser emplacements have their own markings.
- Board markings are procedurally drawn canvas textures, batched by symbol using
  instanced meshes. Laser barrels and checkpoint flags are actual 3D geometry.
- Hover and keyboard tooltips explain controls and cards. Raycast inspection
  explains board tiles and robots; the accessible tactical map uses the same
  course data and descriptors as the live board, including rotated boards.

## Validation

`npm run assets:validate` checks ten GLBs, all eight clip names, required board
and garden nodes, triangle and file-size limits, editable sources, and runtime
artwork. Total GLB payload is 6.33 MB, below the 7 MB budget and each generated runtime image
is below 700 KB. The renderer exposes frame, call, and triangle counts through
`window.__VIBE_PERF__` in development. Ambient mode intentionally renders while
visible; reduced-motion and eco scenes settle back to demand rendering.

`tests/e2e/visual.spec.ts` covers home, lobby, programming, lasers, destruction,
respawn, victory, solo victory, and defeat at desktop and landscape tablet sizes.
`tests/e2e/interaction.spec.ts` also checks live course switching, exact map
inspection, card selection, fitted controls, and intermediate robot positions.
The solo browser test waits for the visual queue to drain before reconnection,
in addition to checking authoritative CPU turn resolution. Review screenshots
are in `artifacts/visual-slice`.
