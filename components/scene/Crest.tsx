"use client";
/**
 * Procedural Slytherin crest: silver shield rim + serpent, emerald field.
 * Geometry is built once per size and shared by every crest instance; the silver
 * parts are merged, so each crest costs 2 draw calls.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function shieldShape(scale: number) {
  const s = new THREE.Shape();
  s.moveTo(-0.5 * scale, 0.55 * scale);
  s.lineTo(0.5 * scale, 0.55 * scale);
  s.lineTo(0.5 * scale, 0.05 * scale);
  s.quadraticCurveTo(0.45 * scale, -0.45 * scale, 0, -0.65 * scale);
  s.quadraticCurveTo(-0.45 * scale, -0.45 * scale, -0.5 * scale, 0.05 * scale);
  s.closePath();
  return s;
}

export const SILVER = new THREE.MeshStandardMaterial({ color: "#d9dee6", metalness: 1, roughness: 0.22 });

const cache = new Map<number, { silver: THREE.BufferGeometry; field: THREE.BufferGeometry }>();

function crestGeometry(size: number) {
  let g = cache.get(size);
  if (g) return g;
  const rim = new THREE.ExtrudeGeometry(shieldShape(size), { depth: 0.06 * size, bevelEnabled: true, bevelSize: 0.03 * size, bevelThickness: 0.03 * size, bevelSegments: 2 });
  const field = new THREE.ExtrudeGeometry(shieldShape(size * 0.84), { depth: 0.08 * size, bevelEnabled: false }).translate(0, 0, 0.01 * size);
  // S-curve serpent across the field.
  const pts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return new THREE.Vector3(Math.sin(t * Math.PI * 2) * 0.22 * size, (0.38 - t * 0.8) * size, 0.12 * size);
  });
  const serpent = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035 * size, 8, false);
  const head = new THREE.SphereGeometry(0.055 * size, 12, 12).translate(0.06 * size, 0.38 * size, 0.15 * size);
  // Extrude/Tube/Sphere differ in attributes; keep the shared ones so they merge.
  const strip = (geo: THREE.BufferGeometry) => {
    const out = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(out.attributes)) if (k !== "position" && k !== "normal") out.deleteAttribute(k);
    return out;
  };
  g = { silver: mergeGeometries([strip(rim), strip(serpent), strip(head)]), field };
  cache.set(size, g);
  return g;
}

export function Crest({ size = 1, glow = 0.6 }: { size?: number; glow?: number }) {
  const { silver, field } = crestGeometry(size);
  return (
    <group>
      <mesh geometry={silver} material={SILVER} castShadow />
      <mesh geometry={field}>
        <meshPhysicalMaterial color="#0b6b3a" metalness={0.2} roughness={0.18} clearcoat={1} emissive="#10b981" emissiveIntensity={glow} />
      </mesh>
    </group>
  );
}
