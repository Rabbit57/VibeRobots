"use client";

import { Html, Line, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree, events as createPointerEvents } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { courseBounds, courseTile } from "@/game/content/boards";
import { ROBOT_BY_ID } from "@/game/content/robots";
import { GEAR_COLORS } from "@/game/board-visuals";
import { directionAngle, shortestAngle, motionProgress } from "@/game/presentation";
import type { CourseDefinition, MatchEvent, PublicRobotView } from "@/game/types";

import { BoardSurfaces } from "./board-surfaces";
import { robotInspection, tileInspection, type Inspection } from "@/game/inspection";

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
  onPresented?: (revision: number) => void;
  ownSeatId?: string;
  ambientMotion?: boolean;
  onInspect?: (info?: Inspection) => void;
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

const KIT_URL = "/assets/models/factory-kit.glb";
const PLUM = "#dce4d7";

// HTML nameplates live inside the canvas event surface. Use viewport coordinates
// so their nested DOM targets cannot change the raycast origin.
const boardEvents: typeof createPointerEvents = (store) => ({
  ...createPointerEvents(store),
  compute(event, state) {
    const rect = state.gl.domElement.getBoundingClientRect();
    state.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    state.raycaster.setFromCamera(state.pointer, state.camera);
  },
});

export function FactoryScene(props: FactorySceneProps) {
  const [softwareRenderer, setSoftwareRenderer] = useState(false);
  const quality = props.quality === "auto" && softwareRenderer ? "eco" : props.quality;
  const dpr = quality === "eco" ? 1 : quality === "high" ? 2 : ([1, 1.7] as [number, number]);
  const shadowMap = quality === "high" ? 2048 : 1024;
  return (
    <Canvas
      className="factory-canvas"
      events={boardEvents}
      frameloop="demand"
      dpr={dpr}
      shadows={quality === "eco" ? false : "soft"}
      camera={{ position: [9, 12, 14], fov: 37, near: 0.1, far: 160 }}
      gl={{ antialias: quality !== "eco", alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        const context = gl.getContext();
        const rendererInfo = context.getExtension("WEBGL_debug_renderer_info");
        const renderer = rendererInfo
          ? String(context.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
          : "";
        setSoftwareRenderer(/swiftshader|llvmpipe|software/i.test(renderer));
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.95;
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
      <fog attach="fog" args={[PLUM, 65, 130]} />
      <Suspense fallback={null}>
        <SceneContent {...props} quality={quality} shadowMap={shadowMap} />
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
  onPresented,
  ownSeatId,
  ambientMotion = true,
  onInspect,
}: FactorySceneProps & { shadowMap: number }) {
  const bounds = courseBounds(course);
  const offset = useMemo(
    () => ({ x: -bounds.width / 2 + 0.5, z: -bounds.height / 2 + 0.5 }),
    [bounds.height, bounds.width],
  );
  useEffect(() => onReady?.(), [onReady]);
  useLayoutEffect(() => {
    if (activeEvent) onPresented?.(activeEvent.revision);
  }, [activeEvent?.revision, onPresented]);
  useFrame(({ gl, scene, camera }) => {
    if (process.env.NODE_ENV !== "production") {
      const metrics = (
        window as typeof window & {
          __VIBE_PERF__?: {
            frames: number;
            calls?: number;
            triangles?: number;
            scene?: THREE.Scene;
            camera?: THREE.Camera;
          };
        }
      ).__VIBE_PERF__;
      if (metrics) {
        metrics.scene = scene;
        metrics.camera = camera;
        metrics.frames += 1;
        metrics.calls = gl.info.render.calls;
        metrics.triangles = gl.info.render.triangles;
      }
    }
  });
  return (
    <>
      <hemisphereLight intensity={1.4} color="#fff5e8" groundColor="#879d92" />
      <directionalLight
        castShadow={quality !== "eco"}
        position={[-7, 15, 8]}
        intensity={2.5}
        color="#ffefd8"
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
      <group
        onPointerMove={(e) => {
          e.stopPropagation();
          onInspect?.({
            title: "Garden workshop",
            eyebrow: "SCENERY",
            detail:
              "The workshop surrounds the race course. Only marked board squares and starting docks can hold robots.",
          });
        }}
        onPointerOut={() => onInspect?.(undefined)}
      >
        <GardenEnvironment course={course} quality={quality} />
      </group>
      <AmbientLife enabled={!reducedMotion && ambientMotion && quality !== "eco"} bounds={bounds} />
      <group position={[offset.x, 0, offset.z]}>
        <FactoryBoard course={course} onInspect={onInspect} />
        <RobotFleet
          robots={robots}
          activeEvent={activeEvent}
          stepDurationMs={stepDurationMs}
          reducedMotion={reducedMotion}
          ownSeatId={ownSeatId}
          ambientMotion={ambientMotion && quality !== "eco"}
          onInspect={onInspect}
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
  onInspect,
}: {
  course: CourseDefinition;
  onInspect?: (info?: Inspection) => void;
}) {
  const [hovered, setHovered] = useState<{ x: number; y: number }>();
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
      base.push({ x, z: y, color: tile?.pit ? "#4c655a" : (x + y) % 2 ? "#dddcd1" : "#f5f0dd" });
      if (tile?.pit) pits.push({ x, z: y, y: 0.09 });
      if (tile?.conveyor)
        (tile.conveyor.speed === 2 ? express : conveyors).push({
          x,
          z: y,
          y: 0.12,
          color: tile.conveyor.speed === 2 ? "#4aaddb" : "#e9ac4c",
          rotation: directionAngle(tile.conveyor.direction),
        });
      if (tile?.gear) gears.push({ x, z: y, y: 0.16, color: GEAR_COLORS[tile.gear], rotation: 0 });
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
      <Instances node={node("gear")} items={features.gears} castShadow />
      <Instances node={node("pusher")} items={features.pushers} castShadow />
      <Instances node={node("repair")} items={features.repairs} />

      <BoardSurfaces course={course} />
      <CheckpointFlags items={features.checkpoints} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(bounds.width - 1) / 2, 0.1, bounds.height / 2]}
        onPointerMove={(event) => {
          event.stopPropagation();
          const local = event.object.parent!.worldToLocal(event.point.clone());
          const x = Math.round(local.x),
            y = Math.round(local.z);
          if (x < 0 || x >= bounds.width || y < 0 || y > bounds.height) return;
          setHovered((current) => (current?.x === x && current.y === y ? current : { x, y }));
          onInspect?.(tileInspection(course, x, y));
        }}
        onPointerOut={() => {
          setHovered(undefined);
          onInspect?.(undefined);
        }}
        onClick={(event) => {
          event.stopPropagation();
          const local = event.object.parent!.worldToLocal(event.point.clone());
          onInspect?.(tileInspection(course, Math.round(local.x), Math.round(local.z)));
        }}
      >
        <planeGeometry args={[bounds.width, bounds.height + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hovered && (
        <mesh
          position={[hovered.x, 0.27, hovered.y]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function Instances({
  node,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  node?: THREE.Mesh;
  items: Instance[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
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
          <mesh position={[0.42, 0.88, 0.24]} castShadow>
            <boxGeometry args={[0.3, 0.22, 0.024]} />
            <meshStandardMaterial color="#f9cb69" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.22, 0.27, 32]} />
            <meshStandardMaterial color="#fff0b4" metalness={0.4} roughness={0.3} />
          </mesh>
          <Html position={[0.28, 1.28, 0.24]} center zIndexRange={[7, 0]}>
            <div
              className="checkpoint-label"
              data-help-title={`Checkpoint ${item.number}`}
              data-help="Visit numbered checkpoints in order. Stay on this square through the laser stage to collect it and save your archive."
            >
              {item.number}
            </div>
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
  onInspect,
}: {
  robots: PublicRobotView[];
  activeEvent?: MatchEvent;
  stepDurationMs: number;
  reducedMotion: boolean;
  ownSeatId?: string;
  ambientMotion: boolean;
  onInspect?: (info?: Inspection) => void;
}) {
  return (
    <>
      {robots.map((robot) => (
        <RobotActor
          key={robot.seatId}
          robot={robot}
          event={activeEvent?.seatId === robot.seatId ? activeEvent : undefined}
          stepDurationMs={stepDurationMs}
          isYou={robot.seatId === ownSeatId}
          reducedMotion={reducedMotion}
          ambientMotion={ambientMotion}
          onInspect={onInspect}
        />
      ))}
    </>
  );
}

function RobotActor({
  robot,
  event,
  stepDurationMs,
  isYou,
  reducedMotion,
  ambientMotion,
  onInspect,
}: {
  robot: PublicRobotView;
  event?: MatchEvent;
  stepDurationMs: number;
  isYou: boolean;
  reducedMotion: boolean;
  ambientMotion: boolean;
  onInspect?: (info?: Inspection) => void;
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
  const suspension = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const initialized = useRef(false);
  const transition = useRef({
    start: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    angle: 0,
    targetAngle: 0,
    scale: 1,
    targetScale: 1,
  });
  useLayoutEffect(() => {
    if (!group.current) return;
    const target = new THREE.Vector3(robot.position.x, 0.15, robot.position.y);
    const size = robot.destroyed || robot.eliminated ? 0 : 0.94;
    if (!initialized.current || !event || reducedMotion) {
      group.current.position.copy(target);
      group.current.rotation.y = directionAngle(robot.direction);
      group.current.scale.setScalar(size);
      initialized.current = true;
    }
    // Respawns materialize at the archive instead of flying across the board.
    if (event?.type === "respawn") {
      group.current.position.copy(target);
      group.current.scale.setScalar(0);
    }
    transition.current = {
      start: performance.now(),
      from: group.current.position.clone(),
      to: target,
      angle: group.current.rotation.y,
      targetAngle: shortestAngle(group.current.rotation.y, directionAngle(robot.direction)),
      scale: group.current.scale.x,
      targetScale: size,
    };
    if (process.env.NODE_ENV !== "production")
      group.current.userData.motion = {
        revision: event?.revision,
        from: transition.current.from.toArray(),
        to: target.toArray(),
        start: transition.current.start,
      };
    invalidate();
  }, [
    event?.revision,
    robot.position.x,
    robot.position.y,
    robot.direction,
    robot.destroyed,
    robot.eliminated,
    reducedMotion,
    invalidate,
  ]);
  useFrame(({ clock }) => {
    if (!group.current || !suspension.current) return;
    const t = transition.current;
    const progress =
      reducedMotion || !event ? 1 : motionProgress(performance.now() - t.start, stepDurationMs);
    group.current.position.lerpVectors(t.from, t.to, progress);
    group.current.rotation.y = THREE.MathUtils.lerp(t.angle, t.targetAngle, progress);
    const size = THREE.MathUtils.lerp(t.scale, t.targetScale, progress);
    group.current.scale.set(size, size * (robot.poweredDown ? 0.76 : 1), size);
    const travelling =
      event && ["move", "push", "conveyor", "express-conveyor", "pusher"].includes(event.type);
    // Secondary motion is absolute and isolated from the authoritative position.
    suspension.current.position.y = reducedMotion
      ? 0
      : travelling
        ? Math.sin(progress * Math.PI) * 0.045
        : event?.type === "victory"
          ? Math.sin(progress * Math.PI) * 0.22
          : ambientMotion && !robot.poweredDown
            ? Math.sin(clock.elapsedTime * 1.3 + robot.seatId.length) * 0.012
            : 0;
    suspension.current.rotation.z =
      !reducedMotion && event?.type === "damage"
        ? Math.sin(progress * Math.PI * 4) * 0.05 * (1 - progress)
        : 0;
    if (
      !document.hidden &&
      (progress < 1 || (ambientMotion && !reducedMotion && !robot.poweredDown))
    )
      invalidate();
  });
  return (
    <group
      ref={group}
      name={`robot:${robot.seatId}`}
      onPointerOver={(e) => {
        e.stopPropagation();
        onInspect?.(robotInspection(robot));
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onInspect?.(robotInspection(robot));
      }}
      onPointerOut={() => onInspect?.(undefined)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect?.(robotInspection(robot));
      }}
    >
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.84, 1.2, 0.84]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={suspension}>
        <group rotation={[0, Math.PI, 0]}>
          <primitive object={clone} />
        </group>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]}>
        <ringGeometry args={[0.46, 0.505, 48]} />
        <meshBasicMaterial color={identity.color} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -0.56]}>
        <circleGeometry args={[0.12, 3, Math.PI / 2]} />
        <meshBasicMaterial color={isYou ? "#f9cf65" : identity.color} side={THREE.DoubleSide} />
      </mesh>
      <Html
        position={[0, isYou ? 1.65 : 1.5, 0]}
        center
        zIndexRange={[6, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          className={`robot-label ${isYou ? "own" : ""}`}
          data-help-title={robot.displayName}
          data-help={robotInspection(robot).detail}
          style={{ "--robot": identity.color, pointerEvents: "auto" } as React.CSSProperties}
        >
          {isYou ? "YOU" : identity.name.replace(" Bot", "")}
          <small>{robot.direction.slice(0, 1).toUpperCase()}</small>
        </span>
      </Html>
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
  reset,
}: {
  course: CourseDefinition;
  activeEvent?: MatchEvent;
  reducedMotion: boolean;
  reset: number;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const bounds = courseBounds(course);
  const center = useMemo(
    () => new THREE.Vector3(0, 0, course.docks.some((dock) => dock.y >= bounds.height) ? 1.1 : 0.7),
    [bounds.height, course.docks],
  );
  const overview = useMemo(() => {
    const aspect = Math.max(0.8, size.width / Math.max(1, size.height));
    const span = Math.max(bounds.height + 7, (bounds.width + 6) / aspect);
    return new THREE.Vector3(span * 0.28, span * 1.02, span * 0.8);
  }, [bounds.height, bounds.width, size.height, size.width]);
  useEffect(() => {
    camera.position.copy(overview);
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
  }, [camera, center, course.id, invalidate, overview, reset]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.55}
      maxPolarAngle={1.18}
      minDistance={5}
      maxDistance={68}
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
