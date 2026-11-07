"use client";
/**
 * A player's miniature: house-coloured pedestal, robed wizard figure and a floating
 * portrait medallion of the chosen character that always faces the camera. Plays waypoint animations tile by tile (hop arcs,
 * snake slides, ladder climbs) with a glowing spell trail, and otherwise glides
 * to its rest spot (e.g. flying back to base after being captured).
 */
import { Billboard, Trail, useTexture } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Seat, Vec3 } from "@/lib/board";
import { SEAT_THEME } from "@/lib/theme";
import type { TokenAnimation, Waypoint } from "@/hooks/useGameEngine";
import type { SfxName } from "@/hooks/useSfx";
import { Wizard, type WizardMotion } from "./Wizard";


const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const TRAIL_COLOR = { walk: "#6ee7b7", ladder: "#e2e8f0", snake: "#22c55e" } as const;

interface Props {
  seat: Seat;
  /** Portrait key: /characters/<key>.jpg */
  character: string;
  rest: Vec3;
  animation: TokenAnimation | null;
  selectable: boolean;
  onSelect: () => void;
  onWaypointSfx: (s: SfxName) => void;
  onDone: (animationId: number) => void;
  /** Full figure (arms, wand, scarf…) vs. a light silhouette on Low graphics. */
  detailed: boolean;
}

export function Token({ seat, character, rest, animation, selectable, onSelect, onWaypointSfx, onDone, detailed }: Props) {
  const motion = useRef<WizardMotion>({ moving: false, ready: false });
  const lastPos = useRef(new THREE.Vector3());
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const anim = useRef<{ id: number; wps: Waypoint[]; i: number; t: number; from: THREE.Vector3 } | null>(null);
  const target = useRef(new THREE.Vector3());
  const callbacks = useRef({ onWaypointSfx, onDone });
  const [hovered, setHovered] = useState(false);
  const { color, glow } = SEAT_THEME[seat];
  const portrait = useTexture(`/characters/${character}.jpg`);
  portrait.colorSpace = THREE.SRGBColorSpace;

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
    // Face the direction of travel (smallest turn), then keep that heading at rest.
    const vx = g.position.x - lastPos.current.x;
    const vz = g.position.z - lastPos.current.z;
    if (vx * vx + vz * vz > 1e-6) {
      const want = Math.atan2(vx, vz);
      const cur = body.current.rotation.y;
      const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      body.current.rotation.y = cur + diff * Math.min(1, dt * 10);
    }
    lastPos.current.copy(g.position);
    motion.current.moving = !!anim.current;
    motion.current.ready = selectable;
    // Selectable tokens pulse their ring.
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
        <Wizard character={character} color={color} glow={glow} simple={!detailed} motion={motion} />
      </group>
      {/* Portrait medallion (outside the turning body): who this piece is, from any camera angle */}
      <Billboard position={[0, 1.24, 0]}>
          <mesh>
            <circleGeometry args={[0.3, 40]} />
            <meshBasicMaterial map={portrait} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.001]}>
            <ringGeometry args={[0.295, 0.35, 40]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
      </Billboard>
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
