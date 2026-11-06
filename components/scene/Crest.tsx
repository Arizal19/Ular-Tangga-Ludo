"use client";
/** Procedural Slytherin crest: silver shield rim, emerald field, silver S-serpent. */
import { useMemo } from "react";
import * as THREE from "three";

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

export function Crest({ size = 1, glow = 0.6 }: { size?: number; glow?: number }) {
  const { rim, field, serpent } = useMemo(() => {
    const rim = new THREE.ExtrudeGeometry(shieldShape(size), { depth: 0.06 * size, bevelEnabled: true, bevelSize: 0.03 * size, bevelThickness: 0.03 * size, bevelSegments: 2 });
    const field = new THREE.ExtrudeGeometry(shieldShape(size * 0.84), { depth: 0.08 * size, bevelEnabled: false });
    // S-curve serpent across the field.
    const pts = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      return new THREE.Vector3(Math.sin(t * Math.PI * 2) * 0.22 * size, (0.38 - t * 0.8) * size, 0.12 * size);
    });
    const serpent = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035 * size, 8, false);
    return { rim, field, serpent };
  }, [size]);

  return (
    <group>
      <mesh geometry={rim} material={SILVER} castShadow />
      <mesh geometry={field} position={[0, 0, 0.01 * size]}>
        <meshPhysicalMaterial color="#0b6b3a" metalness={0.2} roughness={0.18} clearcoat={1} emissive="#10b981" emissiveIntensity={glow} />
      </mesh>
      <mesh geometry={serpent} material={SILVER} />
      <mesh position={[0.06 * size, 0.38 * size, 0.15 * size]}>
        <sphereGeometry args={[0.055 * size, 12, 12]} />
        <meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}
