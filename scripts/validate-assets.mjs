import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const robotIds = [
  "hammer-bot",
  "hulk-x90",
  "spin-bot",
  "squash-bot",
  "trundle-bot",
  "twitch",
  "twonky",
  "zoom-bot",
];
const clips = ["idle", "move", "turn", "bump", "hit", "power-down", "respawn", "victory"];

async function parseGlb(path) {
  const bytes = await readFile(path);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF", `${path} is not a GLB`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path} must use glTF 2`);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString("utf8", 16, 20);
  assert.equal(jsonType, "JSON", `${path} has no JSON chunk`);
  const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
  return { bytes, json };
}

function triangleCount(json) {
  let total = 0;
  for (const mesh of json.meshes ?? [])
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      if (accessor && (primitive.mode ?? 4) === 4) total += Math.floor(accessor.count / 3);
    }
  return total;
}

let modelBytes = 0;
for (const id of robotIds) {
  const path = join(root, "public/assets/models/robots", `${id}.glb`);
  const { bytes, json } = await parseGlb(path);
  modelBytes += bytes.length;
  const names = new Set((json.animations ?? []).map((animation) => animation.name));
  for (const clip of clips) assert.ok(names.has(clip), `${id} is missing ${clip}`);
  assert.ok((json.materials?.length ?? 0) >= 3, `${id} needs painted, screen and glow materials`);
  assert.ok(triangleCount(json) < 40_000, `${id} exceeds the 40k triangle budget`);
  const positionAccessors = (json.accessors ?? []).filter(
    (accessor) => accessor.type === "VEC3" && accessor.min && accessor.max,
  );
  assert.ok(positionAccessors.length > 0, `${id} has no exported bounds`);
  await stat(join(root, "public/assets/images/robots", `${id}.webp`));
  await stat(join(root, "art/blender/source", `${id}.blend`));
}

const factoryPath = join(root, "public/assets/models/factory-kit.glb");
const factory = await parseGlb(factoryPath);
modelBytes += factory.bytes.length;
const factoryNames = new Set((factory.json.nodes ?? []).map((node) => node.name));
for (const name of [
  "tile_base",
  "wall",
  "conveyor",
  "express_conveyor",
  "gear",
  "pusher",
  "laser",
  "repair",
  "checkpoint",
  "dock",
  "pit_rim",
]) {
  assert.ok(factoryNames.has(name), `factory kit is missing ${name}`);
}
assert.ok(triangleCount(factory.json) < 60_000, "factory kit exceeds the 60k triangle budget");
const garden = await parseGlb(join(root, "public/assets/models/garden-kit.glb"));
modelBytes += garden.bytes.length;
const gardenNames = new Set(garden.json.nodes.map((node) => node.name));
for (const name of ["planter", "tree", "lantern", "workbench", "greenhouse"])
  assert.ok(gardenNames.has(name), `garden kit is missing ${name}`);
assert.ok(triangleCount(garden.json) < 60_000, "garden kit exceeds 60k triangles");
await stat(join(root, "art/blender/source/garden-kit.blend"));
for (const asset of ["garden-workshop.webp", "garden-course-postcards.webp"]) {
  assert.ok(
    (await stat(join(root, "public/assets/images", asset))).size < 700 * 1024,
    `${asset} exceeds 700 KB`,
  );
}
assert.ok(modelBytes < 6 * 1024 * 1024, "all GLB files must remain below 6 MB");

for (const image of [
  "vibe-robots-key-art.webp",
  "course-risky-exchange.webp",
  "course-dizzy-dash.webp",
  "course-against-the-grain.webp",
]) {
  const info = await stat(join(root, "public/assets/images", image));
  assert.ok(info.size < 700 * 1024, `${image} exceeds 700 KB`);
  const avif = image.replace(/\.webp$/, ".avif");
  const avifInfo = await stat(join(root, "public/assets/images", avif));
  assert.ok(avifInfo.size < info.size, `${avif} should be smaller than its WebP fallback`);
}

console.log(
  `Validated 10 GLBs and 18 runtime images (${(modelBytes / 1024).toFixed(0)} KB of models).`,
);
