"use client";

import { Html, Line, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { courseBounds, courseTile } from "@/game/content/boards";
import { ROBOT_BY_ID } from "@/game/content/robots";
import { directionAngle, shortestAngle } from "@/game/presentation";
import type { CourseDefinition, MatchEvent, PublicRobotView } from "@/game/types";

export type GraphicsQuality = "auto" | "high" | "eco";

export interface FactorySceneProps {
  course: CourseDefinition;
  robots: PublicRobotView[];
  activeEvent?: MatchEvent;
  stepDurationMs: number;
  reducedMotion: boolean;
  quality: GraphicsQuality;
  cameraReset: number;
  onReady?: () => void;
  ownSeatId?: string;
  ambientMotion?: boolean;
}

type Kit = { nodes: Record<string, THREE.Mesh> };
type Instance = {
  x: number;
  z: number;
  y?: number;
  rotation?: number;
  color?: string;
  scale?: [number, number, number];
};
type Actor = { group: THREE.Group; mixer: THREE.AnimationMixer };

const KIT_URL = "/assets/models/factory-kit.glb";
const PLUM = "#dce4d7";

export function FactoryScene(props: FactorySceneProps) {
  const dpr =
    props.quality === "eco" ? 1 : props.quality === "high" ? 1.6 : ([1, 1.4] as [number, number]);
  const shadowMap = props.quality === "high" ? 2048 : 1024;
  return (
    <Canvas
      className="factory-canvas"
      frameloop="demand"
      dpr={dpr}
      shadows={props.quality === "eco" ? false : "soft"}
      camera={{ position: [9, 12, 14], fov: 37, near: 0.1, far: 90 }}
      gl={{ antialias: props.quality !== "eco", alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
        if (process.env.NODE_ENV !== "production") {
          (window as typeof window & { __VIBE_PERF__?: unknown }).__VIBE_PERF__ = {
            renderer: gl.info,
            frames: 0,
          };
        }
      }}
      fallback={
        <div className="webgl-fallback">
          <strong>3D factory unavailable</strong>
          <span>Enable hardware acceleration to enter the diorama.</span>
        </div>
      }
    >
      <color attach="background" args={[PLUM]} />
      <fog attach="fog" args={[PLUM, 32, 68]} />
      <Suspense fallback={null}>
        <SceneContent {...props} shadowMap={shadowMap} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({
  course,
  robots,
  activeEvent,
  stepDurationMs,
  reducedMotion,
  quality,
  cameraReset,
  shadowMap,
  onReady,
  ownSeatId,
  ambientMotion = true,
}: FactorySceneProps & { shadowMap: number }) {
  const bounds = courseBounds(course);
  const offset = useMemo(
    () => ({ x: -bounds.width / 2 + 0.5, z: -bounds.height / 2 + 0.5 }),
    [bounds.height, bounds.width],
  );
  useEffect(() => onReady?.(), [onReady]);
  useFrame(({ gl }) => {
    if (process.env.NODE_ENV !== "production") {
      const metrics = (
        window as typeof window & {
          __VIBE_PERF__?: { frames: number; calls?: number; triangles?: number };
        }
      ).__VIBE_PERF__;
      if (metrics) {
        metrics.frames += 1;
        metrics.calls = gl.info.render.calls;
        metrics.triangles = gl.info.render.triangles;
      }
    }
  });
  return (
    <>
      <hemisphereLight intensity={1.2} color="#fff2dc" groundColor="#94aa7e" />
      <directionalLight
        castShadow={quality !== "eco"}
        position={[-7, 15, 8]}
        intensity={2.2}
        color="#fff1d4"
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-normalBias={0.04}
        shadow-bias={-0.0001}
        shadow-camera-near={2}
        shadow-camera-far={46}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <directionalLight position={[8, 7, -10]} color="#d5ece9" intensity={0.65} />
      <GardenEnvironment course={course} quality={quality} />
      <AmbientLife enabled={!reducedMotion && ambientMotion && quality !== "eco"} bounds={bounds} />
      <group position={[offset.x, 0, offset.z]}>
        <FactoryBoard
          course={course}
          activeEvent={activeEvent}
          reducedMotion={reducedMotion || !ambientMotion}
        />
        <RobotFleet
          robots={robots}
          activeEvent={activeEvent}
          stepDurationMs={stepDurationMs}
          reducedMotion={reducedMotion}
          ownSeatId={ownSeatId}
          ambientMotion={ambientMotion && quality !== "eco"}
        />
        <EventParticles event={activeEvent} reducedMotion={reducedMotion || !ambientMotion} />
        <LaserEffect event={activeEvent} />
      </group>

      <CameraRig
        course={course}
        activeEvent={activeEvent}
        reducedMotion={reducedMotion}
        reset={cameraReset}
      />
    </>
  );
}

function FactoryBoard({
  course,
  activeEvent,
  reducedMotion,
}: {
  course: CourseDefinition;
  activeEvent?: MatchEvent;
  reducedMotion: boolean;
}) {
  const kit = useGLTF(KIT_URL) as unknown as Kit;
  const bounds = courseBounds(course);
  const cells = useMemo(
    () =>
      Array.from({ length: bounds.width * bounds.height }, (_, index) => ({
        x: index % bounds.width,
        y: Math.floor(index / bounds.width),
      })),
    [bounds.height, bounds.width],
  );
  const features = useMemo(() => {
    const base: Instance[] = [];
    const walls: Instance[] = [];
    const conveyors: Instance[] = [];
    const express: Instance[] = [];
    const gears: Instance[] = [];
    const pushers: Instance[] = [];
    const lasers: Instance[] = [];
    const repairs: Instance[] = [];
    const checkpoints: Array<Instance & { number: number }> = [];
    const pits: Instance[] = [];
    for (const { x, y } of cells) {
      const tile = courseTile(course, x, y);
      base.push({ x, z: y, color: tile?.pit ? "#4c655a" : (x + y) % 2 ? "#edebd7" : "#fff4db" });
      if (tile?.pit) pits.push({ x, z: y, y: 0.09 });
      if (tile?.conveyor)
        (tile.conveyor.speed === 2 ? express : conveyors).push({
          x,
          z: y,
          y: 0.12,
          rotation: directionAngle(tile.conveyor.direction),
        });
      if (tile?.gear)
        gears.push({ x, z: y, y: 0.16, rotation: tile.gear === "right" ? 0 : Math.PI });
      if (tile?.pusher)
        pushers.push({ x, z: y, y: 0.18, rotation: directionAngle(tile.pusher.direction) });
      if (tile?.laser)
        lasers.push({ x, z: y, y: 0.2, rotation: directionAngle(tile.laser.direction) });
      if (tile?.repair)
        repairs.push({
          x,
          z: y,
          y: 0.14,
          scale: tile.optionSite ? [1, 1.18, 1] : [0.86, 0.86, 0.86],
        });
      if (tile?.checkpoint) checkpoints.push({ x, z: y, y: 0.16, number: tile.checkpoint });
      for (const wall of tile?.walls ?? []) {
        const horizontal = wall === "north" || wall === "south";
        walls.push({
          x: x + (wall === "east" ? 0.46 : wall === "west" ? -0.46 : 0),
          z: y + (wall === "south" ? 0.46 : wall === "north" ? -0.46 : 0),
          y: 0.17,
          rotation: horizontal ? 0 : Math.PI / 2,
        });
      }
    }
    const docks = course.docks.map((dock) => ({ x: dock.x, z: dock.y, y: 0.03, color: "#d0bdde" }));
    return {
      base,
      walls,
      conveyors,
      express,
      gears,
      pushers,
      lasers,
      repairs,
      checkpoints,
      pits,
      docks,
    };
  }, [cells, course]);

  const node = (name: string) => kit.nodes[name];
  return (
    <group>
      <Instances node={node("tile_base")} items={features.base} receiveShadow />
      <Instances node={node("dock")} items={features.docks} receiveShadow />
      <Instances node={node("pit_rim")} items={features.pits} />
      <Instances node={node("wall")} items={features.walls} castShadow />
      <Instances node={node("conveyor")} items={features.conveyors} />
      <Instances node={node("express_conveyor")} items={features.express} />
      <Instances
        node={node("gear")}
        items={features.gears}
        rotationTrigger={
          activeEvent?.stage === "gears" && !reducedMotion ? activeEvent.revision : undefined
        }
        castShadow
      />
      <Instances node={node("pusher")} items={features.pushers} castShadow />
      <Instances node={node("laser")} items={features.lasers} castShadow />
      <Instances node={node("repair")} items={features.repairs} />

      <ConveyorArrows
        items={[...features.conveyors, ...features.express]}
        reducedMotion={reducedMotion}
      />
      <CheckpointFlags items={features.checkpoints} />
      {features.repairs.map((item, index) => (
        <group key={index} position={[item.x, 0.205, item.z]}>
          <mesh>
            <boxGeometry args={[0.35, 0.025, 0.1]} />
            <meshBasicMaterial color="#f6ffe4" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.1, 0.025, 0.35]} />
            <meshBasicMaterial color="#f6ffe4" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Instances({
  node,
  items,
  castShadow = false,
  receiveShadow = false,
  rotationTrigger,
}: {
  node?: THREE.Mesh;
  items: Instance[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  rotationTrigger?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rotationStart = useRef(0);
  const { invalidate } = useThree();
  useEffect(() => {
    rotationStart.current = performance.now();
    invalidate();
  }, [rotationTrigger, invalidate]);
  useFrame(() => {
    if (rotationTrigger === undefined || !ref.current) return;
    const t = Math.min(1, (performance.now() - rotationStart.current) / 350);
    const ease = 1 - Math.pow(1 - t, 3);
    const matrix = new THREE.Matrix4();
    items.forEach((item, index) => {
      const angle = (item.rotation ?? 0) + ((item.rotation === 0 ? 1 : -1) * ease * Math.PI) / 2;
      matrix.compose(
        new THREE.Vector3(item.x, item.y ?? 0, item.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
        new THREE.Vector3(1, 1, 1),
      );
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (t < 1) invalidate();
  });
  const material = useMemo(() => {
    const next =
      (node?.material as THREE.Material | undefined)?.clone() ??
      new THREE.MeshStandardMaterial({ color: "#d8c4b4", roughness: 0.5, metalness: 0.18 });
    return next;
  }, [node]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    items.forEach((item, index) => {
      position.set(item.x, item.y ?? 0, item.z);
      rotation.setFromEuler(new THREE.Euler(0, item.rotation ?? 0, 0));
      scale.set(...(item.scale ?? [1, 1, 1]));
      matrix.compose(position, rotation, scale);
      ref.current!.setMatrixAt(index, matrix);
      if (item.color) ref.current!.setColorAt(index, new THREE.Color(item.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  useEffect(() => () => material.dispose(), [material]);
  if (!items.length || !node?.geometry) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[node.geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled
    />
  );
}

function ConveyorArrows({ items, reducedMotion }: { items: Instance[]; reducedMotion: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, -0.11);
    shape.lineTo(0, 0.08);
    shape.lineTo(0.15, -0.11);
    shape.lineTo(0.15, 0.01);
    shape.lineTo(0, 0.2);
    shape.lineTo(-0.15, 0.01);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const phase = reducedMotion ? 0 : ((clock.elapsedTime * 0.28) % 0.24) - 0.12;
    items.forEach((item, index) => {
      const angle = item.rotation ?? 0;
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      matrix.compose(
        new THREE.Vector3(item.x - Math.sin(angle) * phase, 0.18, item.z - Math.cos(angle) * phase),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]}>
      <meshBasicMaterial color="#fff8df" side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function CheckpointFlags({ items }: { items: Array<Instance & { number: number }> }) {
  return (
    <>
      {items.map((item) => (
        <group key={item.number} position={[item.x, 0, item.z]}>
          <mesh position={[0, 0.12, 0]} receiveShadow>
            <cylinderGeometry args={[0.33, 0.36, 0.16, 20]} />
            <meshStandardMaterial color="#e5c476" roughness={0.7} />
          </mesh>
          <mesh position={[0.28, 0.56, 0.24]} castShadow>
            <cylinderGeometry args={[0.025, 0.03, 0.95, 8]} />
            <meshStandardMaterial color="#ad8556" />
          </mesh>
          <mesh position={[0.28, 1.07, 0.24]}>
            <sphereGeometry args={[0.057, 10, 8]} />
            <meshStandardMaterial color="#e0b966" />
          </mesh>
          <Html position={[0.28, 1.28, 0.24]} center zIndexRange={[7, 0]}>
            <div className="checkpoint-label">{item.number}</div>
          </Html>
        </group>
      ))}
    </>
  );
}

function RobotFleet({
  robots,
  activeEvent,
  stepDurationMs,
  reducedMotion,
  ownSeatId,
  ambientMotion,
}: {
  robots: PublicRobotView[];
  activeEvent?: MatchEvent;
  stepDurationMs: number;
  reducedMotion: boolean;
  ownSeatId?: string;
  ambientMotion: boolean;
}) {
  const actors = useRef(new Map<string, Actor>());
  const startedAt = useRef(0);
  const { invalidate } = useThree();
  useEffect(() => {
    startedAt.current = performance.now();
    invalidate();
  }, [activeEvent?.revision, invalidate]);
  useFrame((_, delta) => {
    let moving = false;
    const progress =
      reducedMotion || !activeEvent
        ? 1
        : Math.min(1, (performance.now() - startedAt.current) / Math.max(1, stepDurationMs));
    for (const robot of robots) {
      const actor = actors.current.get(robot.seatId);
      if (!actor) continue;
      const target = new THREE.Vector3(
        robot.position.x,
        robot.poweredDown ? 0.08 : 0.22,
        robot.position.y,
      );
      const factor = reducedMotion ? 1 : 1 - Math.exp(-delta * 15);
      actor.group.position.lerp(target, factor);
      const targetAngle = shortestAngle(actor.group.rotation.y, directionAngle(robot.direction));
      actor.group.rotation.y = THREE.MathUtils.lerp(actor.group.rotation.y, targetAngle, factor);
      const targetScale = robot.destroyed || robot.eliminated ? 0.01 : 0.86;
      actor.group.scale.lerp(
        new THREE.Vector3(
          targetScale,
          robot.poweredDown ? targetScale * 0.72 : targetScale,
          targetScale,
        ),
        factor,
      );
      if (
        activeEvent?.seatId === robot.seatId &&
        ["move", "push", "conveyor", "express-conveyor", "pusher"].includes(activeEvent.type)
      ) {
        actor.group.position.y += Math.sin(Math.PI * progress) * 0.16;
      }
      if (!reducedMotion) actor.mixer.update(Math.min(delta, 0.05));
      moving ||=
        actor.group.position.distanceTo(target) > 0.004 ||
        Math.abs(actor.group.rotation.y - targetAngle) > 0.004 ||
        progress < 1;
    }
    if (!document.hidden && (moving || (!reducedMotion && ambientMotion))) invalidate();
  });
  return (
    <>
      {robots.map((robot) => (
        <RobotActor
          key={robot.seatId}
          robot={robot}
          event={activeEvent?.seatId === robot.seatId ? activeEvent : undefined}
          actors={actors}
          invalidate={invalidate}
          isYou={robot.seatId === ownSeatId}
          reducedMotion={reducedMotion}
          ambientMotion={ambientMotion}
        />
      ))}
    </>
  );
}

function RobotActor({
  robot,
  event,
  actors,
  invalidate,
  isYou,
  reducedMotion,
  ambientMotion,
}: {
  robot: PublicRobotView;
  event?: MatchEvent;
  actors: React.RefObject<Map<string, Actor>>;
  invalidate: () => void;
  isYou: boolean;
  reducedMotion: boolean;
  ambientMotion: boolean;
}) {
  const identity = ROBOT_BY_ID.get(robot.robotId)!;
  const gltf = useGLTF(identity.modelUrl);
  const clone = useMemo(() => {
    const object = gltf.scene.clone(true);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  }, [gltf.scene]);
  const group = useRef<THREE.Group>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clone);
    },
    [mixer, clone],
  );
  useEffect(() => {
    if (!group.current) return;
    group.current.position.set(robot.position.x, 0.22, robot.position.y);
    group.current.rotation.y = directionAngle(robot.direction);
    group.current.scale.setScalar(0.86);
    actors.current.set(robot.seatId, { group: group.current, mixer });
    invalidate();
    return () => {
      actors.current.delete(robot.seatId);
    };
  }, [actors, invalidate, mixer, robot.seatId]);
  useEffect(() => {
    if (reducedMotion) {
      mixer.stopAllAction();
      return;
    }
    const clipName =
      event?.type === "damage"
        ? "hit"
        : event?.type === "destroyed" || event?.type === "eliminated"
          ? "power-down"
          : event?.type === "respawn"
            ? "respawn"
            : event?.type === "victory"
              ? "victory"
              : event?.type === "turn" || event?.type === "gear"
                ? "turn"
                : event?.type === "push"
                  ? "bump"
                  : event?.type.includes("move") ||
                      event?.type.includes("conveyor") ||
                      event?.type === "pusher"
                    ? "move"
                    : "idle";
    if (clipName === "idle" && (!ambientMotion || robot.poweredDown)) {
      mixer.stopAllAction();
      return;
    }
    const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
    if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action
      .reset()
      .setLoop(
        clipName === "idle" ? THREE.LoopRepeat : THREE.LoopOnce,
        clipName === "idle" ? Infinity : 1,
      );
    action.timeScale = clipName === "idle" ? 0.55 : 1;
    action.clampWhenFinished = true;
    action.play();
  }, [event?.revision, gltf.animations, mixer, reducedMotion, ambientMotion, robot.poweredDown]);
  if (robot.eliminated) return null;
  return (
    <group ref={group}>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={clone} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -0.53]}>
        <coneGeometry args={[0.1, 0.2, 3]} />
        <meshBasicMaterial color={identity.color} />
      </mesh>
      {isYou && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
            <ringGeometry args={[0.48, 0.54, 32]} />
            <meshBasicMaterial color="#71955e" transparent opacity={0.8} />
          </mesh>
          <Html position={[0, 1.7, 0]} center zIndexRange={[6, 0]}>
            <span className="robot-label">YOU</span>
          </Html>
        </>
      )}
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshBasicMaterial
          color={robot.connected ? identity.color : "#827688"}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function LaserEffect({ event }: { event?: MatchEvent }) {
  if (event?.type !== "laser-fired" || !event.path || event.path.length < 2) return null;
  const points = event.path.map((point) => new THREE.Vector3(point.x, 0.48, point.y));
  return (
    <group>
      <Line
        points={points}
        color="#ff5f68"
        lineWidth={7}
        transparent
        opacity={0.92}
        toneMapped={false}
      />
      <Line
        points={points}
        color="#fff2d8"
        lineWidth={2}
        transparent
        opacity={0.95}
        toneMapped={false}
      />
    </group>
  );
}

function CameraRig({
  course,
  activeEvent,
  reducedMotion,
  reset,
}: {
  course: CourseDefinition;
  activeEvent?: MatchEvent;
  reducedMotion: boolean;
  reset: number;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const manual = useRef(false);
  const bounds = courseBounds(course);
  const center = useMemo(
    () => new THREE.Vector3(0, 0, course.docks.some((dock) => dock.y >= bounds.height) ? 1.1 : 0.7),
    [bounds.height, course.docks],
  );
  const overview = useMemo(() => {
    const aspect = Math.max(0.8, size.width / Math.max(1, size.height));
    const span = Math.max(bounds.height + 8, (bounds.width + 7) / aspect);
    return new THREE.Vector3(span * 0.44, span * 0.88, span * 0.82);
  }, [bounds.height, bounds.width, size.height, size.width]);
  useEffect(() => {
    manual.current = false;
    camera.position.copy(overview);
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
  }, [camera, center, course.id, invalidate, overview, reset]);
  useEffect(() => {
    if (reducedMotion || manual.current || !activeEvent?.to || !controls.current) return;
    const local = new THREE.Vector3(
      activeEvent.to.x - bounds.width / 2 + 0.5,
      0,
      activeEvent.to.y - bounds.height / 2 + 0.5,
    );
    controls.current.target.lerp(local, 0.28);
    controls.current.update();
    invalidate();
  }, [activeEvent?.revision, bounds.height, bounds.width, invalidate, reducedMotion]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.55}
      maxPolarAngle={1.18}
      minDistance={8}
      maxDistance={42}
      onStart={() => {
        manual.current = true;
      }}
      onChange={() => invalidate()}
    />
  );
}

useGLTF.preload(KIT_URL);

function GardenProp({
  name,
  position,
  scale = 1,
  rotation = 0,
}: {
  name: string;
  position: [number, number, number];
  scale?: number;
  rotation?: number;
}) {
  const { nodes } = useGLTF("/assets/models/garden-kit.glb");
  const object = useMemo(() => {
    const clone = nodes[name].clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [nodes, name]);
  return (
    <primitive object={object} position={position} scale={scale} rotation={[0, rotation, 0]} />
  );
}

function GardenEnvironment({
  course,
  quality,
}: {
  course: CourseDefinition;
  quality: GraphicsQuality;
}) {
  const { width, height } = courseBounds(course);
  const w = width / 2,
    h = height / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.74, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#dce4d2" roughness={1} />
      </mesh>
      <RoundedBox
        args={[width + 3.8, 0.42, height + 4.4]}
        radius={0.18}
        smoothness={3}
        position={[0, -0.46, -0.2]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color="#b89164" roughness={0.85} />
      </RoundedBox>
      <RoundedBox
        args={[width + 3.5, 0.13, height + 4.1]}
        radius={0.055}
        smoothness={2}
        position={[0, -0.19, -0.2]}
        receiveShadow
      >
        <meshStandardMaterial color="#bbcea0" roughness={1} />
      </RoundedBox>
      <RoundedBox
        args={[width + 0.28, 0.33, height + 1.65]}
        radius={0.09}
        smoothness={2}
        position={[0, -0.11, 0.5]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#d3ae79" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, -0.37, h + 1.94]}>
        <boxGeometry args={[width + 2.5, 0.055, 0.02]} />
        <meshStandardMaterial color="#e2c79a" />
      </mesh>
      <GardenProp name="greenhouse" position={[0, -0.12, -h - 1.15]} scale={0.85} />
      <GardenProp name="tree" position={[-w - 1, -0.12, -h + 0.8]} scale={0.95} />
      <GardenProp name="tree" position={[w + 1, -0.12, -h + 0.3]} scale={1.15} />
      <GardenProp name="workbench" position={[-w + 1, -0.12, -h - 1.22]} rotation={0.07} />
      <GardenProp name="planter" position={[w + 1, -0.12, h + 0.6]} scale={1.2} />
      <GardenProp name="planter" position={[-w - 1, -0.12, h + 1]} scale={1.1} />
      <GardenProp name="lantern" position={[-w - 1.15, -0.12, h - 1.5]} scale={0.8} />
      <GardenProp name="lantern" position={[w + 1.13, -0.12, -h + 3]} scale={0.8} />
      {quality !== "eco" && (
        <>
          <GardenProp name="planter" position={[-w - 1.12, -0.12, 0]} scale={0.9} />
          <GardenProp name="planter" position={[w + 1.08, -0.12, 2.3]} scale={0.85} />
          <GardenProp name="planter" position={[2.5, -0.12, -h - 1.1]} scale={0.9} />
          <GardenProp
            name="workbench"
            position={[w - 1.1, -0.12, -h - 1.2]}
            rotation={-0.05}
            scale={0.85}
          />
        </>
      )}
    </group>
  );
}

function AmbientLife({
  enabled,
  bounds,
}: {
  enabled: boolean;
  bounds: { width: number; height: number };
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: Math.sin(i * 12.39) * bounds.width * 0.65,
        z: Math.cos(i * 8.17) * bounds.height * 0.65,
        phase: i * 1.73,
      })),
    [bounds.width, bounds.height],
  );
  useFrame(({ clock }) => {
    if (!enabled || !ref.current || document.hidden) return;
    const t = clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    particles.forEach((p, i) => {
      const y = 0.6 + ((t * 0.12 + p.phase) % 3);
      matrix.compose(
        new THREE.Vector3(p.x + Math.sin(t * 0.35 + p.phase) * 0.35, y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(t * 0.4 + p.phase, 0, t * 0.2)),
        new THREE.Vector3(0.05, 0.08, 0.025),
      );
      ref.current!.setMatrixAt(i, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    invalidate();
  });
  if (!enabled) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, particles.length]}>
      <sphereGeometry args={[1, 5, 3]} />
      <meshBasicMaterial color="#fff9c9" transparent opacity={0.62} />
    </instancedMesh>
  );
}

function EventParticles({ event, reducedMotion }: { event?: MatchEvent; reducedMotion: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const started = useRef(0);
  const { invalidate } = useThree();
  const celebratory = event?.type === "checkpoint" || event?.type === "victory";
  const visible =
    event && ["damage", "destroyed", "respawn", "checkpoint", "victory"].includes(event.type);
  const origin = event?.to ?? event?.from;
  useEffect(() => {
    started.current = performance.now();
    invalidate();
  }, [event?.revision, invalidate]);
  useFrame(() => {
    if (!ref.current || !visible || !origin) return;
    const t = reducedMotion ? 0.32 : Math.min(1, (performance.now() - started.current) / 1000);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399;
      const radius = t * (0.5 + (i % 4) * 0.19);
      const y =
        event.type === "respawn" ? t * 1.7 : 0.4 + Math.sin(t * Math.PI) * (0.4 + (i % 5) * 0.18);
      matrix.compose(
        new THREE.Vector3(
          origin.x + Math.cos(angle) * radius,
          y,
          origin.y + Math.sin(angle) * radius,
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(i + t * 6, t * 3, angle)),
        new THREE.Vector3(0.04, 0.07, 0.04).multiplyScalar(1 - t),
      );
      ref.current.setMatrixAt(i, matrix);
      ref.current.setColorAt(
        i,
        new THREE.Color(
          celebratory
            ? ["#e9bc60", "#f9e4aa", "#c290b4", "#82b697"][i % 4]
            : event.type === "respawn"
              ? "#a4d9bc"
              : ["#eb9d6c", "#ffe6ad"][i % 2],
        ),
      );
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    if (t < 1 && !reducedMotion) invalidate();
  });
  if (!visible || !origin) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 24]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

useGLTF.preload("/assets/models/garden-kit.glb");
