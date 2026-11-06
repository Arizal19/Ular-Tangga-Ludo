"use client";
/** The R3F canvas: camera, moody dungeon lighting, board, serpents, tokens, die, bloom. */
import { Environment, Lightformer, OrbitControls, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type Seat, type Vec3, stackOffset, tileAt } from "@/lib/board";
import type { GameState, Move } from "@/lib/rules";
import { tokenTile } from "@/lib/rules";
import { type DiceState, type Phase, type TokenAnimation, restPosition } from "@/hooks/useGameEngine";
import type { SfxName } from "@/hooks/useSfx";
import { BloomEffect } from "./BloomEffect";
import { Board, TileHighlights } from "./Board";
import { CrystalDie } from "./CrystalDie";
import { Jumps } from "./Jumps";
import { Token } from "./Token";

const DIE_POSITION: Vec3 = [-8.4, 1.6, 0.6];
const CAMERA_HOME = new THREE.Vector3(0, 17.5, 15.5);

/**
 * Pull the camera back on narrow (portrait) screens so the whole ziggurat fits,
 * and on desktop aim right of centre so the board clears the roster panel.
 */
function CameraFit() {
  const { camera, size, controls } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const k = Math.min(3, Math.max(1, 1.05 / aspect));
    const shiftX = size.width >= 768 ? 2.2 : 0;
    const target = new THREE.Vector3(shiftX, 0.6, 0.8);
    camera.position.copy(CAMERA_HOME).multiplyScalar(k).add(new THREE.Vector3(shiftX, 0, 0));
    camera.lookAt(target);
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    orbit?.target.copy(target);
    orbit?.update();
  }, [camera, controls, size.width, size.height]);
  return null;
}

/** Wax candle with a flickering flame light (nod to the candle-lit table art). */
function Candle({ position, height = 0.9 }: { position: Vec3; height?: number }) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06;
    if (light.current) light.current.intensity = 5 * f;
    if (flame.current) flame.current.scale.set(1, f, 1);
  });
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, height, 20]} />
        <meshStandardMaterial color="#e8dcc0" roughness={0.8} />
      </mesh>
      <mesh ref={flame} position={[0, height + 0.12, 0]}>
        <coneGeometry args={[0.06, 0.22, 12]} />
        <meshBasicMaterial color="#ffcf7a" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, height + 0.3, 0]} color="#ffb35c" intensity={5} distance={7} decay={2} />
    </group>
  );
}

export interface SceneProps {
  game: GameState | null;
  phase: Phase;
  dice: DiceState;
  moves: Move[];
  animation: TokenAnimation | null;
  onRoll: () => void;
  onSelectToken: (id: string) => void;
  onAnimationDone: (animationId: number) => void;
  onSfx: (s: SfxName) => void;
  /** This device controls the current turn (local human, or our seat online). */
  canAct: boolean;
}

export function Scene({ game, phase, dice, moves, animation, onRoll, onSelectToken, onAnimationDone, onSfx, canAct }: SceneProps) {
  const activeSeats: Seat[] = game ? game.players.map((p) => p.seat) : [];
  const current = game ? game.players[game.turn] : null;

  // Rest position per token, fanning out tokens that share a tile.
  const rests = useMemo(() => {
    const out = new Map<string, Vec3>();
    if (!game) return out;
    const byTile = new Map<number, string[]>();
    for (const t of game.tokens) {
      const tile = tokenTile(t);
      if (tile !== null) byTile.set(tile, [...(byTile.get(tile) ?? []), t.id]);
    }
    for (const t of game.tokens) {
      const tile = tokenTile(t);
      const [x, y, z] = restPosition(t.seat, t.index, t.progress, tile);
      if (tile === null) {
        out.set(t.id, [x, y, z]);
        continue;
      }
      const group = byTile.get(tile)!;
      const [ox, oz] = stackOffset(group.indexOf(t.id), group.length);
      out.set(t.id, [x + ox, y, z + oz]);
    }
    return out;
  }, [game]);

  const highlightTiles = useMemo(() => {
    if (!game || phase !== "choosing" || !canAct) return [];
    return moves.map((m) => tileAt(game.tokens.find((t) => t.id === m.tokenId)!.seat, m.to));
  }, [game, moves, phase, canAct]);
  const selectable = new Set(phase === "choosing" && canAct ? moves.map((m) => m.tokenId) : []);

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: CAMERA_HOME.toArray(), fov: 42, near: 0.1, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        // The crystal die's refraction re-renders the scene; half resolution is invisible on a
        // small, glossy cube but halves that pass's pixel cost.
        gl.transmissionResolutionScale = 0.5;
      }}
    >
      <color attach="background" args={["#020403"]} />
      <fog attach="fog" args={["#020403", 40, 100]} />
      <CameraFit />

      {/* Moonlight through the dungeon window + emerald under-glow */}
      <ambientLight intensity={0.35} color="#a7f3d0" />
      <hemisphereLight args={["#9ca3af", "#022c16", 0.5]} />
      <directionalLight
        position={[7, 16, 5]}
        intensity={2.2}
        color="#e0e7ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 4.5, 0]} color="#22c55e" intensity={30} distance={16} decay={2} />

      {/* Local studio reflections for the silver & emerald (no network HDR needed) */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.2} color="#e2e8f0" position={[0, 6, -6]} scale={[12, 3, 1]} />
        <Lightformer intensity={0.8} color="#34d399" position={[-6, 3, 4]} scale={[6, 6, 1]} />
        <Lightformer intensity={0.6} color="#ffffff" position={[6, 4, 6]} scale={[4, 4, 1]} />
      </Environment>

      {/* Obsidian floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#050807" metalness={0.55} roughness={0.42} />
      </mesh>

      <Candle position={[-9.6, -0.25, -3.2]} height={1.1} />
      <Candle position={[-9.4, -0.25, 4.2]} height={0.7} />
      <Candle position={[9.3, -0.25, -3.2]} height={0.9} />
      <Candle position={[9.6, -0.25, 2.8]} height={1.2} />

      <Board activeSeats={activeSeats} currentSeat={current?.seat ?? null} />
      <Jumps />
      <TileHighlights tiles={highlightTiles} />

      {game?.tokens.map((t) => (
        <Token
          key={t.id}
          seat={t.seat}
          rest={rests.get(t.id)!}
          animation={animation?.tokenId === t.id ? animation : null}
          selectable={selectable.has(t.id)}
          onSelect={() => onSelectToken(t.id)}
          onWaypointSfx={onSfx}
          onDone={onAnimationDone}
        />
      ))}

      <CrystalDie
        position={DIE_POSITION}
        value={dice.value}
        rolling={dice.rolling}
        enabled={phase === "await-roll" && canAct}
        onRoll={onRoll}
      />

      {/* Drifting magical dust */}
      <Sparkles count={120} scale={[22, 6, 22]} position={[0, 2.5, 0]} size={2.5} speed={0.25} opacity={0.6} color="#4ade80" />

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={9}
        maxDistance={75}
        maxPolarAngle={Math.PI / 2.25}
        autoRotate={!game}
        autoRotateSpeed={0.6}
      />

      <BloomEffect />
    </Canvas>
  );
}
