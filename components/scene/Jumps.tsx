"use client";
/**
 * Glowing emerald serpents (drop you down) and silver metallic ladders (lift you up).
 *
 * Performance: static parts are merged across all 16 jumps — every ladder rail and
 * rung is one mesh, every serpent head / eye pair / fang pair is one mesh each.
 * Only the serpent bodies stay separate so each keeps its own venom-pulse phase.
 */
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { JUMPS } from "@/lib/board";
import { ladderEnds, snakeCurve } from "@/lib/geometry";

const SNAKES = JUMPS.filter((j) => j.kind === "snake");
const LADDERS = JUMPS.filter((j) => j.kind === "ladder");

const SCALE_MATERIAL = { color: "#0b2e1b", emissive: "#15803d", metalness: 0.6, roughness: 0.28 } as const;

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

/** World matrix of a serpent head: at the curve start, facing away from the body. */
function headMatrix(curve: THREE.Curve<THREE.Vector3>) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(0).negate());
  return new THREE.Matrix4().compose(curve.getPointAt(0), q, new THREE.Vector3(1, 1, 1));
}

/** Copy of `geo` placed at `local` within the head, then into the world. */
const place = (geo: THREE.BufferGeometry, head: THREE.Matrix4, local: THREE.Matrix4) =>
  geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(head, local));

function SerpentBody({ geometry, phase }: { geometry: THREE.BufferGeometry; phase: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    // Venom pulse along the serpent.
    if (mat.current) mat.current.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 2.2 + phase) * 0.3;
  });
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial ref={mat} {...SCALE_MATERIAL} emissiveIntensity={0.55} />
    </mesh>
  );
}

function Serpents({ sparkle }: { sparkle: number }) {
  const { bodies, heads, eyes, fangs, mids } = useMemo(() => {
    const headGeo = new THREE.SphereGeometry(0.2, 20, 16);
    const eyeGeo = new THREE.SphereGeometry(0.032, 10, 10);
    const fangGeo = new THREE.ConeGeometry(0.014, 0.07, 6);
    const m = (x: number, y: number, z: number, rx = 0, sx = 1, sy = 1, sz = 1) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));

    const bodies: { geometry: THREE.BufferGeometry; phase: number }[] = [];
    const heads: THREE.BufferGeometry[] = [];
    const eyes: THREE.BufferGeometry[] = [];
    const fangs: THREE.BufferGeometry[] = [];
    const mids: THREE.Vector3[] = [];
    for (const jump of SNAKES) {
      const curve = snakeCurve(jump);
      bodies.push({ geometry: taperedTube(curve, 80, 0.15), phase: Math.random() * 10 });
      const head = headMatrix(curve);
      // Head: flattened wedge with venom-yellow eyes and silver fangs.
      heads.push(place(headGeo, head, m(0, 0, 0, 0, 1, 0.65, 1.45)));
      for (const s of [-1, 1]) {
        eyes.push(place(eyeGeo, head, m(s * 0.085, 0.07, 0.12)));
        fangs.push(place(fangGeo, head, m(s * 0.05, -0.08, 0.2, Math.PI)));
      }
      mids.push(curve.getPointAt(0.5));
    }
    return { bodies, heads: mergeGeometries(heads), eyes: mergeGeometries(eyes), fangs: mergeGeometries(fangs), mids };
  }, []);

  return (
    <group>
      {bodies.map((b, i) => (
        <SerpentBody key={i} geometry={b.geometry} phase={b.phase} />
      ))}
      <mesh geometry={heads} castShadow>
        <meshStandardMaterial {...SCALE_MATERIAL} emissiveIntensity={0.5} />
      </mesh>
      <mesh geometry={eyes}>
        <meshBasicMaterial color="#d9f99d" toneMapped={false} />
      </mesh>
      <mesh geometry={fangs}>
        <meshStandardMaterial color="#f1f5f9" metalness={1} roughness={0.2} />
      </mesh>
      {mids.map((p, i) => (
        <Sparkles key={i} position={p} count={Math.round(14 * sparkle)} scale={[1.2, 0.8, 1.2]} size={2.2} speed={0.4} color="#4ade80" />
      ))}
    </group>
  );
}

/** Cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const dir = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(radius, radius, dir.length(), 10);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

function SilverLadders({ sparkle }: { sparkle: number }) {
  const { geometry, glints } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const glints: THREE.Vector3[] = [];
    for (const jump of LADDERS) {
      const [foot, top] = ladderEnds(jump);
      const dir = top.clone().sub(foot);
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.17);
      parts.push(rod(foot.clone().add(side), top.clone().add(side), 0.05), rod(foot.clone().sub(side), top.clone().sub(side), 0.05));
      const count = Math.max(4, Math.round(dir.length() / 0.24));
      for (let i = 1; i < count; i++) {
        const p = foot.clone().lerp(top, i / count);
        parts.push(rod(p.clone().add(side), p.clone().sub(side), 0.03));
      }
      glints.push(top.clone().add(side).lerp(foot.clone().sub(side), 0.5));
    }
    return { geometry: mergeGeometries(parts), glints };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} castShadow>
        {/* Polished silver; envMapIntensity kept moderate so bloom doesn't wash the rungs out white. */}
        <meshStandardMaterial color="#d7dde5" metalness={1} roughness={0.24} envMapIntensity={0.95} />
      </mesh>
      {glints.map((p, i) => (
        <Sparkles key={i} position={p} count={Math.round(10 * sparkle)} scale={[0.8, 1, 0.8]} size={2} speed={0.5} color="#e2e8f0" />
      ))}
    </group>
  );
}

export function Jumps({ sparkle = 1 }: { sparkle?: number }) {
  return (
    <group>
      <Serpents sparkle={sparkle} />
      <SilverLadders sparkle={sparkle} />
    </group>
  );
}
