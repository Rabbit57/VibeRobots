"use client";

import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { courseBounds, courseTile } from "@/game/content/boards";
import {
  GEAR_COLORS,
  GEAR_OUTLINE,
  GEAR_ARROW_ARC,
  GEAR_ARROW_HEAD,
  surfaceRotation,
} from "@/game/board-visuals";
import { directionAngle } from "@/game/presentation";
import type { CourseDefinition } from "@/game/types";

type Mark = { x: number; z: number; angle: number; y: number };

// Batched printed enamel surfaces: explicit symbols remain readable at board scale.
export function BoardSurfaces({ course }: { course: CourseDefinition }) {
  const groups = useMemo(() => {
    const result = new Map<string, Mark[]>();
    const add = (key: string, x: number, z: number, angle = 0, y = 0.167) =>
      result.set(key, [...(result.get(key) ?? []), { x, z, angle, y }]);
    const { width, height } = courseBounds(course);
    for (let z = 0; z < height; z++)
      for (let x = 0; x < width; x++) {
        const tile = courseTile(course, x, z);
        if (tile?.conveyor)
          add(
            `belt-${tile.conveyor.speed}${tile.conveyor.rotate ? `-${tile.conveyor.rotate}` : ""}`,
            x,
            z,
            surfaceRotation(tile.conveyor.direction)[2],
          );
        else if (tile?.pit) add("pit", x, z, 0, 0.19);
        else if (tile?.repair) add(tile.optionSite ? "upgrade" : "repair", x, z, 0, 0.2);
        if (tile?.gear) add(`gear-${tile.gear}`, x, z, 0, 0.23);
        else if (tile?.pusher)
          add(
            `push-${tile.pusher.activeRegisters.join("")}`,
            x,
            z,
            surfaceRotation(tile.pusher.direction)[2],
            0.35,
          );
        else if (!tile?.checkpoint && !tile?.laser) add("floor", x, z, 0, 0.085);
        if (tile?.laser)
          add(`laser-${tile.laser.count}`, x, z, surfaceRotation(tile.laser.direction)[2], 0.09);
      }
    for (const dock of course.docks) add(`dock-${dock.number}`, dock.x, dock.y, 0, 0.08);
    return [...result.entries()];
  }, [course]);
  return (
    <>
      {groups.map(([kind, items]) => (
        <SurfaceBatch key={kind} kind={kind} items={items} />
      ))}
      <LaserHardware course={course} />
    </>
  );
}

function LaserHardware({ course }: { course: CourseDefinition }) {
  const emitters = useMemo(() => {
    const { width, height } = courseBounds(course);
    return Array.from({ length: width * height }, (_, i) => {
      const x = i % width,
        z = Math.floor(i / width);
      return { x, z, laser: courseTile(course, x, z)?.laser };
    }).filter((item) => item.laser);
  }, [course]);
  return (
    <>
      {emitters.map(({ x, z, laser }) => (
        <group
          key={`${x},${z}`}
          position={[x, 0.1, z]}
          rotation={[0, directionAngle(laser!.direction), 0]}
        >
          <mesh position={[0, 0.07, 0.08]} castShadow>
            <boxGeometry args={[0.52, 0.14, 0.4]} />
            <meshStandardMaterial color="#3b5652" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.23, 0.06]} castShadow>
            <boxGeometry args={[0.42, 0.22, 0.25]} />
            <meshStandardMaterial color="#b46c4c" metalness={0.45} roughness={0.32} />
          </mesh>
          {Array.from({ length: laser!.count }, (_, i) => (
            <group
              key={i}
              position={[(i - (laser!.count - 1) / 2) * 0.14, 0.24, -0.14]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <mesh castShadow>
                <cylinderGeometry args={[0.058, 0.073, 0.28, 16]} />
                <meshStandardMaterial color="#3d5452" metalness={0.8} roughness={0.24} />
              </mesh>
              <mesh position={[0, 0.13, 0]}>
                <cylinderGeometry args={[0.068, 0.068, 0.04, 16]} />
                <meshStandardMaterial color="#c5c6a5" metalness={0.7} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0.154, 0]}>
                <cylinderGeometry args={[0.043, 0.043, 0.012, 16]} />
                <meshStandardMaterial
                  color="#ff7a52"
                  emissive="#ff4726"
                  emissiveIntensity={1.8}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ))}
          {[-0.19, 0.19].map((side) => (
            <mesh key={side} position={[side, 0.35, 0.06]}>
              <sphereGeometry args={[0.022, 8, 6]} />
              <meshStandardMaterial color="#f6d290" metalness={0.7} roughness={0.25} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function SurfaceBatch({ kind, items }: { kind: string; items: Mark[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => drawSurface(kind), [kind]);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    items.forEach((item, index) => {
      matrix.compose(
        new THREE.Vector3(item.x, item.y, item.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...surfaceRotation(item.angle))),
        new THREE.Vector3(1, 1, 1),
      );
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} raycast={() => null}>
      <planeGeometry args={[0.83, 0.83]} />
      <meshStandardMaterial
        map={texture}
        transparent
        roughness={0.65}
        metalness={0.1}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </instancedMesh>
  );
}

function drawSurface(kind: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const text = (value: string, y: number, size = 24, color = "#fff4d9") => {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(value, 128, y);
  };
  const arrow = (y: number, color: string, width = 18) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(72, y + 29);
    ctx.lineTo(128, y - 22);
    ctx.lineTo(184, y + 29);
    ctx.stroke();
  };
  if (kind.startsWith("belt-")) {
    const express = kind.startsWith("belt-2");
    ctx.fillStyle = express ? "#226e9e" : "#ac7327";
    ctx.fillRect(4, 4, 248, 248);
    ctx.fillStyle = express ? "#123c59" : "#704b22";
    ctx.fillRect(12, 0, 13, 256);
    ctx.fillRect(231, 0, 13, 256);
    for (let y = 7; y < 250; y += 19) {
      ctx.fillStyle = express ? "#4c9ac5" : "#cd9951";
      ctx.fillRect(30, y, 196, 3);
      ctx.fillStyle = "#f2e1b885";
      ctx.fillRect(15, y, 7, 8);
      ctx.fillRect(234, y, 7, 8);
    }
    arrow(express ? 62 : 96, "#fff9df");
    if (express) arrow(120, "#fff9df");
    text(express ? "2× EXPRESS" : "1×", 221, express ? 24 : 30);
    if (kind.endsWith("left") || kind.endsWith("right"))
      text(kind.endsWith("left") ? "↶" : "↷", 180, 36);
  } else if (kind === "pit") {
    ctx.fillStyle = "#e7b74f";
    ctx.fillRect(0, 0, 256, 256);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 256, 256);
    ctx.clip();
    ctx.strokeStyle = "#33433d";
    ctx.lineWidth = 17;
    for (let x = -256; x < 512; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 256, 256);
      ctx.stroke();
    }
    ctx.restore();
    const gradient = ctx.createRadialGradient(128, 105, 5, 128, 128, 125);
    gradient.addColorStop(0, "#050f14");
    gradient.addColorStop(1, "#2c4145");
    ctx.fillStyle = gradient;
    ctx.fillRect(22, 22, 212, 212);
    text("VOID", 216, 20, "#d9ab62");
  } else if (kind === "repair" || kind === "upgrade") {
    ctx.fillStyle = "#266b53";
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 240, 26);
    ctx.fill();
    ctx.strokeStyle = "#aee1bb";
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, 212, 212);
    ctx.fillStyle = "#e5f8d9";
    ctx.fillRect(109, 47, 38, 110);
    ctx.fillRect(73, 83, 110, 38);
    text(kind === "upgrade" ? "◆ UPGRADE" : "REPAIR", 205, 25, "#daefbf");
  } else if (kind.startsWith("gear-")) {
    const left = kind.endsWith("left");
    const rim = ctx.createLinearGradient(0, 0, 256, 256);
    rim.addColorStop(0, "#e3dfc5");
    rim.addColorStop(0.45, "#b8b99b");
    rim.addColorStop(1, "#6a7868");
    ctx.fillStyle = rim;
    ctx.strokeStyle = "#35483e";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    const teeth = new Path2D(GEAR_OUTLINE);
    ctx.fill(teeth);
    ctx.stroke(teeth);
    ctx.fillStyle = GEAR_COLORS[left ? "left" : "right"];
    ctx.beginPath();
    ctx.arc(128, 128, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#35483e";
    ctx.lineWidth = 5;
    ctx.stroke();
    // Two sweeping arrows make the direction visible from either side of the table.
    ctx.save();
    if (left) {
      ctx.translate(256, 0);
      ctx.scale(-1, 1);
    }
    for (const half of [0, 1]) {
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate(half * Math.PI);
      ctx.translate(-128, -128);
      ctx.strokeStyle = "#fffbea";
      ctx.fillStyle = "#fffbea";
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.stroke(new Path2D(GEAR_ARROW_ARC));
      ctx.fill(new Path2D(GEAR_ARROW_HEAD));
      ctx.restore();
    }
    ctx.restore();
    // Recessed center hub and four flush bolts give the face a mechanical silhouette.
    ctx.fillStyle = "#35483e";
    ctx.beginPath();
    ctx.arc(128, 128, 29, 0, Math.PI * 2);
    ctx.fill();
    text("90°", 136, 23, "#fffbea");
    for (let index = 0; index < 4; index++) {
      const angle = Math.PI / 4 + (index * Math.PI) / 2;
      const x = 128 + Math.cos(angle) * 87,
        y = 128 + Math.sin(angle) * 87;
      ctx.fillStyle = "#eadfbc";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5c6657";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x + 2, y);
      ctx.stroke();
    }
  } else if (kind.startsWith("dock-")) {
    ctx.strokeStyle = "#6e6187";
    ctx.lineWidth = 9;
    ctx.strokeRect(12, 12, 232, 232);
    text(kind.split("-")[1], 159, 90, "#655079");
    text("DOCK", 214, 24, "#655079");
  } else if (kind.startsWith("laser-")) {
    ctx.fillStyle = "#983e34";
    ctx.fillRect(32, 12, 192, 232);
    arrow(71, "#ffe0bc", 12);
    text("LASER", 160, 27);
    text(`${kind.split("-")[1]} DMG`, 204, 23);
  } else if (kind.startsWith("push-")) {
    arrow(65, "#fff2bf");
    text("PUSH", 158, 30);
    text(kind.split("-")[1].split("").join("·"), 212, 27);
  } else {
    ctx.fillStyle = "#80785c60";
    for (const x of [12, 244])
      for (const y of [12, 244]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.strokeStyle = "#a7a68b28";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, 204, 204);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
