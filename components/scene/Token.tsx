"use client";
/**
 * A player's serpent token: house-coloured pedestal, coiled emerald snake and a
 * small Slytherin crest. Plays waypoint animations tile by tile (hop arcs,
 * snake slides, ladder climbs) with a glowing spell trail, and otherwise glides
 * to its rest spot (e.g. flying back to base after being captured).
 */
import { Trail } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Seat, Vec3 } from "@/lib/board";
import { SEAT_THEME } from "@/lib/theme";
import type { TokenAnimation, Waypoint } from "@/hooks/useGameEngine";
import type { SfxName } from "@/hooks/useSfx";
import { Crest } from "./Crest";

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const TRAIL_COLOR = { walk: "#6ee7b7", ladder: "#e2e8f0", snake: "#22c55e" } as const;

interface Props {
  seat: Seat;
  rest: Vec3;
  animation: TokenAnimation | null;
  selectable: boolean;
  onSelect: () => void;
  onWaypointSfx: (s: SfxName) => void;
  onDone: (animationId: number) => void;
}

export function Token({ seat, rest, animation, selectable, onSelect, onWaypointSfx, onDone }: Props) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const anim = useRef<{ id: number; wps: Waypoint[]; i: number; t: number; from: THREE.Vector3 } | null>(null);
  const target = useRef(new THREE.Vector3());
  const callbacks = useRef({ onWaypointSfx, onDone });
  const [hovered, setHovered] = useState(false);
  const { color, glow } = SEAT_THEME[seat];

  useEffect(() => {
    callbacks.current = { onWaypointSfx, onDone };
  }, [onWaypointSfx, onDone]);

  // Start exactly on the rest spot (no fly-in from the origin).
  useLayoutEffect(() => {
    group.current.position.set(...rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyed on the animation id: online guests receive fresh copies of the same animation.
  const animationId = animation?.id;
  const animationRef = useRef(animation);
  animationRef.current = animation;
  useEffect(() => {
    const a = animationRef.current;
    if (a) anim.current = { id: a.id, wps: a.waypoints, i: 0, t: 0, from: group.current.position.clone() };
  }, [animationId]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    const dt = Math.min(delta, 0.05);
    const a = anim.current;
    if (a) {
      const wp = a.wps[a.i];
      a.t += dt / wp.duration;
      const k = Math.min(1, a.t);
      target.current.set(...wp.pos);
      g.position.lerpVectors(a.from, target.current, wp.mode === "hop" ? easeInOut(k) : k);
      if (wp.mode === "hop") g.position.y += Math.sin(Math.PI * k) * (0.32 + a.from.distanceTo(target.current) * 0.12);
      if (k >= 1) {
        if (wp.sfx) callbacks.current.onWaypointSfx(wp.sfx);
        a.from = target.current.clone();
        a.i += 1;
        a.t = 0;
        if (a.i >= a.wps.length) {
          anim.current = null;
          callbacks.current.onDone(a.id);
        }
      }
    } else {
      // Glide to rest; arc upward while far away (capture fly-back).
      const t = target.current.set(...rest);
      const f = 1 - Math.exp(-dt * 6);
      const dx = t.x - g.position.x;
      const dz = t.z - g.position.z;
      g.position.x += dx * f;
      g.position.z += dz * f;
      const lift = Math.min(2.2, Math.hypot(dx, dz) * 0.45);
      g.position.y += (t.y + lift - g.position.y) * f;
    }
    // Idle breathing + slow crest turn; selectable tokens pulse their ring.
    body.current.position.y = Math.sin(clock.elapsedTime * 2 + seat) * 0.02;
    body.current.rotation.y += dt * 0.6;
    const pulse = selectable ? 1 + Math.sin(clock.elapsedTime * 6) * 0.15 : 1;
    ring.current.scale.setScalar(pulse * (hovered && selectable ? 1.25 : 1));
    (ring.current.material as THREE.MeshBasicMaterial).opacity = selectable ? 0.95 : 0.35;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (selectable) onSelect();
  };

  return (
    <group
      ref={group}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        if (selectable) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh ref={ring} position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.34, 32]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent />
      </mesh>
      <group ref={body}>
        {/* House-coloured pedestal */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.25, 0.1, 28]} />
          <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} emissive={color} emissiveIntensity={0.35} />
        </mesh>
        {/* Coiled serpent */}
        <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.15, 0.045, 12, 32]} />
          <meshStandardMaterial color="#0f5132" emissive="#22c55e" emissiveIntensity={0.5} metalness={0.5} roughness={0.3} />
        </mesh>
        <group position={[0, 0.42, 0]}>
          <Crest size={0.34} glow={0.9} />
        </group>
      </group>
      {animation && (
        <Trail width={1.6} length={5} color={TRAIL_COLOR[animation.trail]} attenuation={(w) => w * w}>
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={TRAIL_COLOR[animation.trail]} toneMapped={false} />
          </mesh>
        </Trail>
      )}
    </group>
  );
}
