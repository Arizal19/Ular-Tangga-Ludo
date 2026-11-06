"use client";
/**
 * The emerald ziggurat: 100 obsidian/emerald tiles whose height grows ring by
 * ring, silver edge lines, rune numbers, Protego markers, the four corner
 * dungeon bases and the floating summit crest.
 */
import { Edges, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BASE_CENTER,
  GRID,
  type Seat,
  SEATS,
  START_TILES,
  STAR_TILES,
  SUMMIT_Y,
  TILE_COUNT,
  TILE_SIZE,
  type TileId,
  runeNumber,
  tilePosition,
  tileTopY,
} from "@/lib/board";
import { SEAT_THEME } from "@/lib/theme";
import { Crest } from "./Crest";

/** Draw a tile face: emerald or obsidian field, silver numerals, optional seat/Protego mark. */
function makeTileTexture(id: TileId): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const [r, c] = [Math.floor(id / GRID), id % GRID];
  const emerald = (r + c) % 2 === 0;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  if (emerald) {
    grad.addColorStop(0, "#0f5a35");
    grad.addColorStop(1, "#06321d");
  } else {
    grad.addColorStop(0, "#1a1f1d");
    grad.addColorStop(1, "#0a0d0c");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Stone speckle for an obsidian feel.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const startSeat = START_TILES.indexOf(id);
  const isStar = STAR_TILES.includes(id);
  if (startSeat >= 0 || isStar) {
    const color = startSeat >= 0 ? SEAT_THEME[startSeat as Seat].color : "#cbd5e1";
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Silver inset frame.
  ctx.strokeStyle = "rgba(210,218,228,0.85)";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  ctx.fillStyle = "#e7ebf0";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.font = "bold 104px Cinzel, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(runeNumber(id)), size / 2, size / 2 + 6);
  if (isStar) {
    ctx.font = "bold 34px Cinzel, Georgia, serif";
    ctx.fillText("PROTEGO", size / 2, size - 38);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const SIDE_MATERIAL = new THREE.MeshStandardMaterial({ color: "#0c1210", roughness: 0.55, metalness: 0.35 });

function Tile({ id }: { id: TileId }) {
  const [x, , z] = tilePosition(id);
  const height = tileTopY(id);
  const top = useMemo(() => {
    const map = makeTileTexture(id);
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.3 });
  }, [id]);
  // Box material order: +x, −x, +y (top), −y, +z, −z.
  const materials = useMemo(() => [SIDE_MATERIAL, SIDE_MATERIAL, top, SIDE_MATERIAL, SIDE_MATERIAL, SIDE_MATERIAL], [top]);
  return (
    <mesh position={[x, height / 2, z]} material={materials} castShadow receiveShadow>
      <boxGeometry args={[TILE_SIZE * 0.97, height, TILE_SIZE * 0.97]} />
      <Edges color="#aeb8c4" threshold={20} />
    </mesh>
  );
}

/** Pulsing emerald rings over tiles a human player can move to. */
export function TileHighlights({ tiles }: { tiles: TileId[] }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 5) * 0.08;
    group.current?.children.forEach((m) => m.scale.set(s, s, 1));
  });
  return (
    <group ref={group}>
      {tiles.map((t) => {
        const [x, y, z] = tilePosition(t);
        return (
          <mesh key={t} position={[x, y + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.44, 40]} />
            <meshBasicMaterial color="#6ee7b7" toneMapped={false} transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Corner dungeon bases (Ludo starting zones). Inactive seats stay dark. */
function BaseZone({ seat, active, current }: { seat: Seat; active: boolean; current: boolean }) {
  const [x, y, z] = BASE_CENTER[seat];
  const { color } = SEAT_THEME[seat];
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const m = ring.current.material as THREE.MeshBasicMaterial;
    m.opacity = current ? 0.65 + Math.sin(clock.elapsedTime * 4) * 0.35 : active ? 0.45 : 0.08;
  });
  // Crest stands on the outer edge, facing the board centre.
  const yaw = Math.atan2(-x, -z);
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[2.5, y * 2, 2.5]} radius={0.08} position={[0, y, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#0b100e" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <mesh ref={ring} position={[0, y * 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.02, 1.14, 64]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent />
      </mesh>
      <group position={[-Math.sin(yaw) * 0.95, 0.85, -Math.cos(yaw) * 0.95]} rotation={[0, yaw, 0]}>
        <Crest size={0.55} glow={active ? 0.9 : 0.1} />
      </group>
    </group>
  );
}

/** Floating crest above the summit; finished tokens orbit around it. */
function SummitCrest() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.rotation.y = clock.elapsedTime * 0.35;
    g.current.position.y = SUMMIT_Y + 1.6 + Math.sin(clock.elapsedTime * 1.3) * 0.12;
  });
  return (
    <group ref={g}>
      <Crest size={0.7} glow={1.4} />
      <pointLight color="#34d399" intensity={6} distance={6} />
    </group>
  );
}

export function Board({ activeSeats, currentSeat }: { activeSeats: Seat[]; currentSeat: Seat | null }) {
  const ids = useMemo(() => Array.from({ length: TILE_COUNT }, (_, i) => i), []);
  const half = (GRID * TILE_SIZE) / 2;
  return (
    <group>
      {/* Obsidian plinth with silver trim */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[GRID + 0.7, 0.24, GRID + 0.7]} />
        <meshStandardMaterial color="#070a09" metalness={0.5} roughness={0.4} />
        <Edges color="#cfd6de" />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {/* 4-segment ring = square glow outline just outside the plinth */}
        <ringGeometry args={[half * 1.54, half * 1.58, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color="#10b981" toneMapped={false} transparent opacity={0.5} />
      </mesh>
      {ids.map((id) => (
        <Tile key={id} id={id} />
      ))}
      {SEATS.map((s) => (
        <BaseZone key={s} seat={s} active={activeSeats.includes(s)} current={currentSeat === s} />
      ))}
      <SummitCrest />
      <mesh position={[0, SUMMIT_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.95, 48]} />
        <meshBasicMaterial color="#34d399" toneMapped={false} transparent opacity={0.18} />
      </mesh>
    </group>
  );
}
