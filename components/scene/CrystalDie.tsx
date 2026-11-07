"use client";
/**
 * Floating emerald gemstone die above the guardians' altar: polished, rounded
 * edges and inlaid silver pips that catch the light. Tumbles wildly while
 * `rolling`, then slerps so the rolled face points up. Tap it to roll.
 */
import { RoundedBox, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/board";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ALTAR_TOP } from "./Statues";

const SCALE = new THREE.Vector3(); // reused every frame, no per-frame allocation

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

const SIZE = 0.85;

/** Face normal + in-plane axes, in BoxGeometry face order (+x, −x, +y, −y, +z, −z). */
const FACE_AXES: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
];

/** All 21 pips as one geometry: silver enamel domes sunk into the faces so only a low cap shows. */
function pipGeometry() {
  const r = 0.075;
  const parts: THREE.BufferGeometry[] = [];
  FACE_VALUES.forEach((value, f) => {
    const [n, u, v] = FACE_AXES[f];
    for (const [px, py] of PIPS[value]) {
      const pos = n.clone().multiplyScalar(SIZE / 2 + 0.004 - r * 0.78)
        .addScaledVector(u, (px - 0.5) * SIZE * 0.84)
        .addScaledVector(v, (0.5 - py) * SIZE * 0.84);
      parts.push(new THREE.SphereGeometry(r, 16, 12).translate(pos.x, pos.y, pos.z));
    }
  });
  return mergeGeometries(parts)!;
}

interface Props {
  position: Vec3;
  value: number | null;
  rolling: boolean;
  enabled: boolean;
  onRoll: () => void;
}

export function CrystalDie({ position, value, rolling, enabled, onRoll }: Props) {
  const mesh = useRef<THREE.Group>(null!);
  const spin = useRef(new THREE.Vector3(7, 9, 5));
  const goal = useRef(new THREE.Quaternion());
  const [hovered, setHovered] = useState(false);

  const { pips, body, silver } = useMemo(
    () => ({
      pips: pipGeometry(),
      // Polished emerald: opaque gem body, glassy clearcoat, faint inner glow.
      body: new THREE.MeshPhysicalMaterial({
        color: "#0b7a4d",
        emissive: "#065f46",
        emissiveIntensity: 0.35,
        roughness: 0.08,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        ior: 1.6,
        specularIntensity: 1,
        envMapIntensity: 1.7,
      }),
      // Enamel-silver pips: partly metallic so they stay bright even where the reflection is dark.
      silver: new THREE.MeshStandardMaterial({ color: "#f1f5f9", emissive: "#cbd5e1", emissiveIntensity: 0.18, metalness: 0.45, roughness: 0.22 }),
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
    m.scale.lerp(SCALE.set(s, s, s), 0.2);
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      <group
        ref={mesh}
        position={[0, position[1], 0]}
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
        <RoundedBox args={[SIZE, SIZE, SIZE]} radius={0.11} smoothness={5} material={body} castShadow />
        <mesh geometry={pips} material={silver} />
      </group>
      {/* Levitation glyph on the altar under the die */}
      <mesh position={[0, ALTAR_TOP + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.62, 48]} />
        <meshBasicMaterial color={enabled ? "#6ee7b7" : "#1f4d3a"} toneMapped={false} transparent opacity={0.8} />
      </mesh>
      <pointLight position={[0, position[1], 0]} color="#34d399" intensity={3} distance={4} />
      <Sparkles position={[0, position[1], 0]} count={rolling ? 40 : 12} scale={1.6} size={2.5} speed={rolling ? 2 : 0.4} color="#a7f3d0" />
    </group>
  );
}
