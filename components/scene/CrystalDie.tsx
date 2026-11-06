"use client";
/**
 * Floating emerald-crystal die. Tumbles wildly while `rolling`, then slerps so
 * the rolled face points up. Click it to roll when it's a human's turn.
 */
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/board";

/** BoxGeometry face order: +x, −x, +y, −y, +z, −z. Opposite faces sum to 7. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];

/** Rotation that brings face `v` to +y. */
const FACE_UP: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2),
  4: new THREE.Euler(0, 0, -Math.PI / 2),
};

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
};

/** Glowing silver pips on black — used as an emissive map so pips shine through the crystal. */
function pipTexture(value: number) {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#3f6f5a";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, s - 8, s - 8);
  ctx.fillStyle = "#f0fdf4";
  for (const [x, y] of PIPS[value]) {
    ctx.beginPath();
    ctx.arc(x * s, y * s, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Props {
  position: Vec3;
  value: number | null;
  rolling: boolean;
  enabled: boolean;
  onRoll: () => void;
}

export function CrystalDie({ position, value, rolling, enabled, onRoll }: Props) {
  const mesh = useRef<THREE.Mesh>(null!);
  const spin = useRef(new THREE.Vector3(7, 9, 5));
  const goal = useRef(new THREE.Quaternion());
  const [hovered, setHovered] = useState(false);

  const materials = useMemo(
    () =>
      FACE_VALUES.map((v) => {
        const map = pipTexture(v);
        return new THREE.MeshPhysicalMaterial({
          color: "#34d399",
          emissive: "#ecfdf5",
          emissiveMap: map,
          emissiveIntensity: 1.6,
          transmission: 0.82,
          thickness: 0.9,
          roughness: 0.06,
          ior: 1.6,
          clearcoat: 1,
          attenuationColor: new THREE.Color("#065f46"),
          attenuationDistance: 1.2,
        });
      }),
    [],
  );

  useEffect(() => {
    if (rolling) spin.current.set(6 + Math.random() * 6, 6 + Math.random() * 6, 6 + Math.random() * 6);
    if (!rolling && value) {
      // Face-up rotation, then a random yaw about world-Y so it lands naturally.
      const face = new THREE.Quaternion().setFromEuler(FACE_UP[value]);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      goal.current.copy(yaw.multiply(face));
    }
  }, [rolling, value]);

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    const t = clock.elapsedTime;
    if (rolling) {
      m.rotation.x += spin.current.x * delta;
      m.rotation.y += spin.current.y * delta;
      m.rotation.z += spin.current.z * delta;
      m.position.y = position[1] + 0.6 + Math.abs(Math.sin(t * 9)) * 0.5;
    } else {
      m.quaternion.slerp(goal.current, 1 - Math.exp(-delta * 9));
      m.position.y = position[1] + Math.sin(t * 1.6) * 0.15;
    }
    const s = enabled && hovered ? 1.12 : 1;
    m.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh
        ref={mesh}
        position={[0, position[1], 0]}
        material={materials}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          if (enabled) onRoll();
        }}
        onPointerOver={() => {
          setHovered(true);
          if (enabled) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[0.85, 0.85, 0.85]} />
      </mesh>
      {/* Levitation glyph under the die */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.62, 48]} />
        <meshBasicMaterial color={enabled ? "#6ee7b7" : "#1f4d3a"} toneMapped={false} transparent opacity={0.8} />
      </mesh>
      <pointLight position={[0, position[1], 0]} color="#34d399" intensity={enabled ? 4 : 1.5} distance={4} />
      <Sparkles position={[0, position[1], 0]} count={rolling ? 40 : 12} scale={1.6} size={2.5} speed={rolling ? 2 : 0.4} color="#a7f3d0" />
    </group>
  );
}
