"use client";
/**
 * The emerald ziggurat: 100 obsidian/emerald tiles whose height grows ring by
 * ring, silver edge lines, rune numbers, Protego markers, the four corner
 * dungeon bases and the floating summit crest.
 */
import { Edges, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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

/** Draw one tile face into the atlas cell at (ox, oy): emerald or obsidian field, silver numerals, seat/Protego mark. */
function drawTileFace(ctx: CanvasRenderingContext2D, id: TileId, ox: number, oy: number, size: number) {
  const [r, c] = [Math.floor(id / GRID), id % GRID];
  const emerald = (r + c) % 2 === 0;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();

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
  ctx.font = `bold ${Math.round(size * 0.406)}px Cinzel, Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(runeNumber(id)), size / 2, size / 2 + 6);
  if (isStar) {
    ctx.font = `bold ${Math.round(size * 0.133)}px Cinzel, Georgia, serif`;
    ctx.fillText("PROTEGO", size / 2, size - 38);
  }
  ctx.restore();
}


/**
 * All 100 tiles as two merged meshes (stone sides + numbered tops) and one
 * merged silver outline: ~3 draw calls instead of ~200, identical look.
 */
function Tiles({ cell: CELL }: { cell: number }) {
  const { sides, tops, topMaterial, outline } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = CELL * GRID;
    const ctx = canvas.getContext("2d")!;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;

    const sideGeos: THREE.BufferGeometry[] = [];
    const topGeos: THREE.BufferGeometry[] = [];
    const outlinePts: number[] = [];
    const w = TILE_SIZE * 0.97;

    for (let id = 0; id < TILE_COUNT; id++) {
      const [r, c] = [Math.floor(id / GRID), id % GRID];
      drawTileFace(ctx, id, c * CELL, r * CELL, CELL);
      const [x, , z] = tilePosition(id);
      const h = tileTopY(id);

      // Box without its top face (group 2 = +y), the plane below replaces it.
      const box = new THREE.BoxGeometry(w, h, w).translate(x, h / 2, z);
      const top = box.groups[2];
      const index = Array.from(box.index!.array);
      index.splice(top.start, top.count);
      box.setIndex(index);
      box.clearGroups();
      sideGeos.push(box);

      // Top face mapped to this tile's atlas cell (canvas row r ↔ v from the top).
      const plane = new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2).translate(x, h, z);
      const uv = plane.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (c + uv.getX(i)) / GRID, 1 - (r + 1 - uv.getY(i)) / GRID);
      topGeos.push(plane);

      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, w), 20).translate(x, h / 2, z);
      outlinePts.push(...(edges.attributes.position.array as Float32Array));
      edges.dispose();
    }
    map.needsUpdate = true;

    return {
      sides: mergeGeometries(sideGeos),
      tops: mergeGeometries(topGeos),
      topMaterial: new THREE.MeshPhysicalMaterial({ map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0.22, roughness: 0.38, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
      outline: outlinePts,
    };
  }, [CELL]);

  return (
    <group>
      <mesh geometry={sides} material={SIDE_MATERIAL} castShadow receiveShadow />
      <mesh geometry={tops} material={topMaterial} castShadow receiveShadow />
      <Line points={outline} segments color="#aeb8c4" lineWidth={1} />
    </group>
  );
}

const SIDE_MATERIAL = new THREE.MeshStandardMaterial({ color: "#1d3027", roughness: 0.5, metalness: 0.3 });

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
  // Crest lies flat on the outer corner, top toward −z so it reads upright from the default camera
  // (standing up it looked like a thin stick when seen from behind).
  const outward = new THREE.Vector2(x, z).normalize();
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[2.5, y * 2, 2.5]} radius={0.08} position={[0, y, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#0b100e" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <mesh ref={ring} position={[0, y * 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.02, 1.14, 64]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent />
      </mesh>
      <group position={[outward.x * 0.78, y * 2 + 0.02, outward.y * 0.78]} rotation={[-Math.PI / 2, 0, 0]}>
        <Crest size={0.42} glow={active ? 0.9 : 0.1} />
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
      <Crest size={0.7} glow={0.75} />
      <pointLight color="#34d399" intensity={2} distance={4} />
    </group>
  );
}

export function Board({ activeSeats, currentSeat, atlasCell }: { activeSeats: Seat[]; currentSeat: Seat | null; atlasCell: number }) {
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
      <Tiles cell={atlasCell} />
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
