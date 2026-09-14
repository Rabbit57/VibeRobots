'use client';

import { ContactShadows, Line, OrbitControls, Text, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { courseBounds, courseTile } from '@/game/content/boards';
import { ROBOT_BY_ID } from '@/game/content/robots';
import { directionAngle, shortestAngle } from '@/game/presentation';
import type { CourseDefinition, MatchEvent, PublicRobotView } from '@/game/types';

export type GraphicsQuality = 'auto' | 'high' | 'eco';

export interface FactorySceneProps {
  course: CourseDefinition;
  robots: PublicRobotView[];
  activeEvent?: MatchEvent;
  stepDurationMs: number;
  reducedMotion: boolean;
  quality: GraphicsQuality;
  cameraReset: number;
}

type Kit = { nodes: Record<string, THREE.Mesh> };
type Instance = { x: number; z: number; y?: number; rotation?: number; color?: string; scale?: [number, number, number] };
type Actor = { group: THREE.Group; mixer: THREE.AnimationMixer };

const KIT_URL = '/assets/models/factory-kit.glb';
const PLUM = '#241b2f';

export function FactoryScene(props: FactorySceneProps) {
  const dpr = props.quality === 'eco' ? 1 : props.quality === 'high' ? 1.6 : [1, 1.4] as [number, number];
  const shadowMap = props.quality === 'high' ? 1536 : 768;
  return (
    <Canvas
      className="factory-canvas"
      frameloop="demand"
      dpr={dpr}
      shadows={props.quality === 'eco' ? false : 'basic'}
      camera={{ position: [9, 12, 14], fov: 37, near: 0.1, far: 90 }}
      gl={{ antialias: props.quality !== 'eco', alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        if (process.env.NODE_ENV !== 'production') {
          (window as typeof window & { __VIBE_PERF__?: unknown }).__VIBE_PERF__ = { renderer: gl.info, frames: 0 };
        }
      }}
      fallback={<div className="webgl-fallback"><strong>3D factory unavailable</strong><span>Enable hardware acceleration to enter the diorama.</span></div>}
    >
      <color attach="background" args={[PLUM]} />
      <fog attach="fog" args={[PLUM, 18, 46]} />
      <Suspense fallback={null}>
        <SceneContent {...props} shadowMap={shadowMap} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({ course, robots, activeEvent, stepDurationMs, reducedMotion, quality, cameraReset, shadowMap }: FactorySceneProps & { shadowMap: number }) {
  const bounds = courseBounds(course);
  const offset = useMemo(() => ({ x: -bounds.width / 2 + 0.5, z: -bounds.height / 2 + 0.5 }), [bounds.height, bounds.width]);
  useFrame(({ gl }) => {
    if (process.env.NODE_ENV !== 'production') {
      const metrics = (window as typeof window & { __VIBE_PERF__?: { frames: number; calls?: number; triangles?: number } }).__VIBE_PERF__;
      if (metrics) {
        metrics.frames += 1;
        metrics.calls = gl.info.render.calls;
        metrics.triangles = gl.info.render.triangles;
      }
    }
  });
  return <>
    <hemisphereLight intensity={1.35} color="#fff2dc" groundColor="#3c294a" />
    <directionalLight
      castShadow={quality !== 'eco'}
      position={[-7, 15, 8]}
      intensity={2.6}
      color="#ffd2a2"
      shadow-mapSize={[shadowMap, shadowMap]}
      shadow-camera-near={2}
      shadow-camera-far={46}
      shadow-camera-left={-16}
      shadow-camera-right={16}
      shadow-camera-top={18}
      shadow-camera-bottom={-18}
    />
    <pointLight position={[8, 6, -8]} color="#a990d0" intensity={quality === 'eco' ? 0 : 18} distance={24} />
    <group position={[offset.x, 0, offset.z]}>
      <FactoryBoard course={course} activeEvent={activeEvent} reducedMotion={reducedMotion} />
      <RobotFleet robots={robots} activeEvent={activeEvent} stepDurationMs={stepDurationMs} reducedMotion={reducedMotion} />
      <LaserEffect event={activeEvent} />
    </group>
    {quality !== 'eco' && <ContactShadows position={[0, -0.13, 0]} opacity={0.42} scale={Math.max(18, bounds.height + 6)} blur={2.7} frames={1} color="#120d18" />}
    <CameraRig course={course} activeEvent={activeEvent} reducedMotion={reducedMotion} reset={cameraReset} />
  </>;
}

function FactoryBoard({ course, activeEvent, reducedMotion }: { course: CourseDefinition; activeEvent?: MatchEvent; reducedMotion: boolean }) {
  const kit = useGLTF(KIT_URL) as unknown as Kit;
  const bounds = courseBounds(course);
  const cells = useMemo(() => Array.from({ length: bounds.width * bounds.height }, (_, index) => ({ x: index % bounds.width, y: Math.floor(index / bounds.width) })), [bounds.height, bounds.width]);
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
      base.push({ x, z: y, color: tile?.pit ? '#261c30' : (x + y) % 2 ? '#d7c7b7' : '#eadbca' });
      if (tile?.pit) pits.push({ x, z: y, y: 0.09 });
      if (tile?.conveyor) (tile.conveyor.speed === 2 ? express : conveyors).push({ x, z: y, y: 0.12, rotation: directionAngle(tile.conveyor.direction) });
      if (tile?.gear) gears.push({ x, z: y, y: 0.16, rotation: tile.gear === 'right' ? 0 : Math.PI });
      if (tile?.pusher) pushers.push({ x, z: y, y: 0.18, rotation: directionAngle(tile.pusher.direction) });
      if (tile?.laser) lasers.push({ x, z: y, y: 0.20, rotation: directionAngle(tile.laser.direction) });
      if (tile?.repair) repairs.push({ x, z: y, y: 0.14, scale: tile.optionSite ? [1, 1.18, 1] : [0.86, 0.86, 0.86] });
      if (tile?.checkpoint) checkpoints.push({ x, z: y, y: 0.16, number: tile.checkpoint });
      for (const wall of tile?.walls ?? []) {
        const horizontal = wall === 'north' || wall === 'south';
        walls.push({
          x: x + (wall === 'east' ? 0.46 : wall === 'west' ? -0.46 : 0),
          z: y + (wall === 'south' ? 0.46 : wall === 'north' ? -0.46 : 0),
          y: 0.17,
          rotation: horizontal ? 0 : Math.PI / 2,
        });
      }
    }
    const docks = course.docks.map((dock) => ({ x: dock.x, z: dock.y, y: 0.03, color: '#9f82c8' }));
    return { base, walls, conveyors, express, gears, pushers, lasers, repairs, checkpoints, pits, docks };
  }, [cells, course]);

  const gearSpin = activeEvent?.stage === 'gears' && !reducedMotion ? (activeEvent.revision % 8) * Math.PI / 4 : 0;
  const node = (name: string) => kit.nodes[name];
  return <group>
    <Instances node={node('tile_base')} items={features.base} receiveShadow />
    <Instances node={node('dock')} items={features.docks} receiveShadow />
    <Instances node={node('pit_rim')} items={features.pits} />
    <Instances node={node('wall')} items={features.walls} castShadow />
    <Instances node={node('conveyor')} items={features.conveyors} />
    <Instances node={node('express_conveyor')} items={features.express} />
    <Instances node={node('gear')} items={features.gears.map((item) => ({ ...item, rotation: (item.rotation ?? 0) + gearSpin }))} castShadow />
    <Instances node={node('pusher')} items={features.pushers} castShadow />
    <Instances node={node('laser')} items={features.lasers} castShadow />
    <Instances node={node('repair')} items={features.repairs} />
    <Instances node={node('checkpoint')} items={features.checkpoints} castShadow />
    <ConveyorArrows items={[...features.conveyors, ...features.express]} />
    {features.checkpoints.map((item) => <Text key={`checkpoint-${item.number}`} position={[item.x, 0.87, item.z]} fontSize={0.22} color="#2b1f36" anchorX="center" anchorY="middle">{item.number}</Text>)}
  </group>;
}

function Instances({ node, items, castShadow = false, receiveShadow = false }: { node?: THREE.Mesh; items: Instance[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => {
    const next = (node?.material as THREE.Material | undefined)?.clone() ?? new THREE.MeshStandardMaterial({ color: '#d8c4b4', roughness: 0.5, metalness: 0.18 });
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
  if (!items.length || !node?.geometry) return null;
  return <instancedMesh ref={ref} args={[node.geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled />;
}

function ConveyorArrows({ items }: { items: Instance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    items.forEach((item, index) => {
      quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, item.rotation ?? 0, 0));
      matrix.compose(new THREE.Vector3(item.x, 0.20, item.z), quaternion, new THREE.Vector3(1, 1, 1));
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]}>
    <coneGeometry args={[0.14, 0.34, 3]} />
    <meshBasicMaterial color="#fff2d8" toneMapped={false} />
  </instancedMesh>;
}

function RobotFleet({ robots, activeEvent, stepDurationMs, reducedMotion }: { robots: PublicRobotView[]; activeEvent?: MatchEvent; stepDurationMs: number; reducedMotion: boolean }) {
  const actors = useRef(new Map<string, Actor>());
  const startedAt = useRef(0);
  const { invalidate } = useThree();
  useEffect(() => {
    startedAt.current = performance.now();
    invalidate();
  }, [activeEvent?.revision, invalidate]);
  useFrame((_, delta) => {
    let moving = false;
    const progress = reducedMotion || !activeEvent ? 1 : Math.min(1, (performance.now() - startedAt.current) / Math.max(1, stepDurationMs));
    for (const robot of robots) {
      const actor = actors.current.get(robot.seatId);
      if (!actor) continue;
      const target = new THREE.Vector3(robot.position.x, robot.poweredDown ? 0.08 : 0.22, robot.position.y);
      const factor = reducedMotion ? 1 : 1 - Math.exp(-delta * 15);
      actor.group.position.lerp(target, factor);
      const targetAngle = shortestAngle(actor.group.rotation.y, directionAngle(robot.direction));
      actor.group.rotation.y = THREE.MathUtils.lerp(actor.group.rotation.y, targetAngle, factor);
      const targetScale = robot.destroyed || robot.eliminated ? 0.01 : 0.72;
      actor.group.scale.lerp(new THREE.Vector3(targetScale, robot.poweredDown ? targetScale * 0.72 : targetScale, targetScale), factor);
      if (activeEvent?.seatId === robot.seatId && ['move', 'push', 'conveyor', 'express-conveyor', 'pusher'].includes(activeEvent.type)) {
        actor.group.position.y += Math.sin(Math.PI * progress) * 0.16;
      }
      actor.mixer.update(delta);
      moving ||= actor.group.position.distanceTo(target) > 0.004 || Math.abs(actor.group.rotation.y - targetAngle) > 0.004 || progress < 1;
    }
    if (moving) invalidate();
  });
  return <>{robots.map((robot) => <RobotActor key={robot.seatId} robot={robot} event={activeEvent?.seatId === robot.seatId ? activeEvent : undefined} actors={actors} invalidate={invalidate} />)}</>;
}

function RobotActor({ robot, event, actors, invalidate }: { robot: PublicRobotView; event?: MatchEvent; actors: React.RefObject<Map<string, Actor>>; invalidate: () => void }) {
  const identity = ROBOT_BY_ID.get(robot.robotId)!;
  const gltf = useGLTF(identity.modelUrl);
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const group = useRef<THREE.Group>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  useEffect(() => {
    if (!group.current) return;
    group.current.position.set(robot.position.x, 0.22, robot.position.y);
    group.current.rotation.y = directionAngle(robot.direction);
    group.current.scale.setScalar(0.72);
    actors.current.set(robot.seatId, { group: group.current, mixer });
    invalidate();
    return () => { actors.current.delete(robot.seatId); };
  }, [actors, invalidate, mixer, robot.seatId]);
  useEffect(() => {
    if (!event) return;
    const clipName = event.type === 'damage' ? 'hit'
      : event.type === 'destroyed' || event.type === 'eliminated' ? 'power-down'
        : event.type === 'respawn' ? 'respawn'
          : event.type === 'victory' ? 'victory'
            : event.type === 'turn' || event.type === 'gear' ? 'turn'
              : event.type === 'push' ? 'bump'
                : event.type.includes('move') || event.type.includes('conveyor') || event.type === 'pusher' ? 'move'
                  : 'idle';
    const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
    if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
  }, [event?.revision, gltf.animations, mixer]);
  if (robot.eliminated) return null;
  return <group ref={group}>
    <primitive object={clone} />
    <mesh position={[0, 1.35, 0]}>
      <sphereGeometry args={[0.06, 10, 8]} />
      <meshBasicMaterial color={robot.connected ? identity.color : '#827688'} toneMapped={false} />
    </mesh>
  </group>;
}

function LaserEffect({ event }: { event?: MatchEvent }) {
  if (event?.type !== 'laser-fired' || !event.path || event.path.length < 2) return null;
  const points = event.path.map((point) => new THREE.Vector3(point.x, 0.48, point.y));
  return <group>
    <Line points={points} color="#ff5f68" lineWidth={7} transparent opacity={0.92} toneMapped={false} />
    <Line points={points} color="#fff2d8" lineWidth={2} transparent opacity={0.95} toneMapped={false} />
  </group>;
}

function CameraRig({ course, activeEvent, reducedMotion, reset }: { course: CourseDefinition; activeEvent?: MatchEvent; reducedMotion: boolean; reset: number }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const manual = useRef(false);
  const bounds = courseBounds(course);
  const center = useMemo(() => new THREE.Vector3(0, 0, course.docks.some((dock) => dock.y >= bounds.height) ? 0.45 : 0), [bounds.height, course.docks]);
  const overview = useMemo(() => {
    const aspect = Math.max(0.8, size.width / Math.max(1, size.height));
    const span = Math.max(bounds.height + 2, (bounds.width + 3) / aspect);
    return new THREE.Vector3(span * 0.58, span * 0.92, span * 0.82);
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
    const local = new THREE.Vector3(activeEvent.to.x - bounds.width / 2 + 0.5, 0, activeEvent.to.y - bounds.height / 2 + 0.5);
    controls.current.target.lerp(local, 0.28);
    controls.current.update();
    invalidate();
  }, [activeEvent?.revision, bounds.height, bounds.width, invalidate, reducedMotion]);
  return <OrbitControls
    ref={controls}
    makeDefault
    enablePan={false}
    enableDamping
    dampingFactor={0.08}
    minPolarAngle={0.55}
    maxPolarAngle={1.18}
    minDistance={8}
    maxDistance={42}
    onStart={() => { manual.current = true; }}
    onChange={() => invalidate()}
  />;
}

useGLTF.preload(KIT_URL);
