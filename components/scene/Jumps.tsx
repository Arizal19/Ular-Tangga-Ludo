"use client";
/** Glowing emerald serpents (drop you down) and silver metallic ladders (lift you up). */
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { JUMPS, type Jump } from "@/lib/board";
import { ladderEnds, snakeCurve } from "@/lib/geometry";

/** Tube whose radius tapers from head to tail. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number) {
  const geo = new THREE.TubeGeometry(curve, segments, radius, 10, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const ring = 11; // radialSegments + 1 vertices per ring
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t); // TubeGeometry samples the same points
    const scale = 1.05 - 0.75 * Math.pow(t, 1.4); // thick neck → thin tail
    for (let j = 0; j < ring; j++) {
      const idx = i * ring + j;
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(scale).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function Serpent({ jump }: { jump: Jump }) {
  const { body, headPos, headDir, mid } = useMemo(() => {
    const curve = snakeCurve(jump);
    const body = taperedTube(curve, 80, 0.15);
    const headPos = curve.getPointAt(0);
    const headDir = curve.getTangentAt(0).negate();
    const mid = curve.getPointAt(0.5);
    return { body, headPos, headDir, mid };
  }, [jump]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const phase = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    // Venom pulse along the serpent.
    if (mat.current) mat.current.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 2.2 + phase) * 0.3;
  });
  const headQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), headDir),
    [headDir],
  );

  return (
    <group>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial ref={mat} color="#0b2e1b" emissive="#15803d" emissiveIntensity={0.55} metalness={0.6} roughness={0.28} />
      </mesh>
      {/* Head: flattened wedge with venom-yellow eyes and silver fangs. */}
      <group position={headPos} quaternion={headQuat}>
        <mesh scale={[1, 0.65, 1.45]} castShadow>
          <sphereGeometry args={[0.2, 20, 16]} />
          <meshStandardMaterial color="#0b2e1b" emissive="#15803d" emissiveIntensity={0.5} metalness={0.6} roughness={0.28} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.085, 0.07, 0.12]}>
            <sphereGeometry args={[0.032, 10, 10]} />
            <meshBasicMaterial color="#d9f99d" toneMapped={false} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`f${s}`} position={[s * 0.05, -0.08, 0.2]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.014, 0.07, 6]} />
            <meshStandardMaterial color="#f1f5f9" metalness={1} roughness={0.2} />
          </mesh>
        ))}
      </group>
      <Sparkles position={mid} count={14} scale={[1.2, 0.8, 1.2]} size={2.2} speed={0.4} color="#4ade80" />
    </group>
  );
}

function Rod({ a, b, radius }: { a: THREE.Vector3; b: THREE.Vector3; radius: number }) {
  const { pos, quat, len } = useMemo(() => {
    const dir = b.clone().sub(a);
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[radius, radius, len, 10]} />
      <meshStandardMaterial color="#e2e8f0" metalness={1} roughness={0.18} envMapIntensity={1.4} />
    </mesh>
  );
}

function SilverLadder({ jump }: { jump: Jump }) {
  const { rails, rungs } = useMemo(() => {
    const [foot, top] = ladderEnds(jump);
    const dir = top.clone().sub(foot);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.17);
    const rails: [THREE.Vector3, THREE.Vector3][] = [
      [foot.clone().add(side), top.clone().add(side)],
      [foot.clone().sub(side), top.clone().sub(side)],
    ];
    const count = Math.max(4, Math.round(dir.length() / 0.24));
    const rungs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 1; i < count; i++) {
      const p = foot.clone().lerp(top, i / count);
      rungs.push([p.clone().add(side), p.clone().sub(side)]);
    }
    return { rails, rungs };
  }, [jump]);
  return (
    <group>
      {rails.map(([a, b], i) => (
        <Rod key={`r${i}`} a={a} b={b} radius={0.05} />
      ))}
      {rungs.map(([a, b], i) => (
        <Rod key={i} a={a} b={b} radius={0.03} />
      ))}
      <Sparkles position={rails[0][1].clone().lerp(rails[1][0], 0.5)} count={10} scale={[0.8, 1, 0.8]} size={2} speed={0.5} color="#e2e8f0" />
    </group>
  );
}

export function Jumps() {
  return (
    <group>
      {JUMPS.map((j) => (j.kind === "snake" ? <Serpent key={j.id} jump={j} /> : <SilverLadder key={j.id} jump={j} />))}
    </group>
  );
}
