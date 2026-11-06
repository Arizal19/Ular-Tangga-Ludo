"use client";
/** The R3F canvas: camera, moody dungeon lighting, board, serpents, tokens, die, bloom. */
import { Environment, Lightformer, OrbitControls, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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
/** Default view direction from the board centre: lower than a top-down view so the tiers read in 3D/4D. */
const VIEW_DIR = new THREE.Vector3(0, 0.66, 0.75).normalize();
const HOME_DISTANCE = 20; // closer than before (was ~23.4) so the ziggurat fills the screen
const CAMERA_HOME = VIEW_DIR.clone().multiplyScalar(HOME_DISTANCE); // initial guess, CameraRig refines it

/** Where the camera rests for the current screen shape. */
function homePose(width: number, height: number) {
  const aspect = width / height;
  // Portrait: back off just enough that the board's width still fits.
  const k = Math.min(3, Math.max(1, 0.98 / aspect));
  const shiftX = width >= 768 ? 2.2 : 0; // desktop: aim right of centre, clear of the roster panel
  const target = new THREE.Vector3(shiftX, 0.6, 0.8);
  const position = VIEW_DIR.clone().multiplyScalar(HOME_DISTANCE * k).add(target);
  return { position, target };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const FLIGHT_SECONDS = 3.4;

/**
 * Owns the camera: rests at `homePose`, and when a match starts it flies in from a
 * low candle-height angle (like the opening clip) before handing control back to OrbitControls.
 */
function CameraRig({ playing }: { playing: boolean }) {
  const { camera, size, controls } = useThree();
  const orbit = controls as unknown as { target: THREE.Vector3; update: () => void; enabled: boolean } | null;
  const flight = useRef<{ t: number; from: THREE.Vector3; fromTarget: THREE.Vector3 } | null>(null);
  const wasPlaying = useRef(false);

  // Rest pose on mount and whenever the screen changes shape (never mid-flight).
  useEffect(() => {
    if (flight.current) return;
    const { position, target } = homePose(size.width, size.height);
    camera.position.copy(position);
    camera.lookAt(target);
    if (orbit) {
      orbit.target.copy(target);
      orbit.update();
    }
  }, [camera, orbit, size.width, size.height]);

  // Match just started → begin the fly-in.
  useEffect(() => {
    if (playing && !wasPlaying.current) {
      const { target } = homePose(size.width, size.height);
      flight.current = {
        t: 0,
        from: new THREE.Vector3(-11, 2.4, 11).add(target),
        fromTarget: new THREE.Vector3(0, 1.4, 0),
      };
      if (orbit) orbit.enabled = false;
    }
    wasPlaying.current = playing;
  }, [playing, orbit, size.width, size.height]);

  // Any touch ends the flight early.
  useEffect(() => {
    const skip = () => {
      if (flight.current) flight.current.t = FLIGHT_SECONDS;
    };
    window.addEventListener("pointerdown", skip);
    return () => window.removeEventListener("pointerdown", skip);
  }, []);

  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const f = flight.current;
    if (!f || !orbit) return;
    f.t = Math.min(FLIGHT_SECONDS, f.t + Math.min(delta, 0.1)); // clamp so a hitch can't skip the shot
    const e = easeInOut(f.t / FLIGHT_SECONDS);
    const home = homePose(size.width, size.height);
    camera.position.lerpVectors(f.from, home.position, e);
    tmpTarget.lerpVectors(f.fromTarget, home.target, e);
    camera.lookAt(tmpTarget);
    if (f.t >= FLIGHT_SECONDS) {
      flight.current = null;
      orbit.target.copy(home.target);
      orbit.enabled = true;
      orbit.update();
    }
  });
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
    // The flame mesh dances, but the light it casts stays steady: a fluctuating light read as a blinking lamp.
    if (light.current) light.current.intensity = 6.5 + (f - 1) * 0.6;
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
      <pointLight ref={light} position={[0, height + 0.3, 0]} color="#ffb35c" intensity={6.5} distance={8} decay={2} />
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
  // Adaptive resolution: start sharp, drop a notch only while the frame rate sags, climb back when it recovers.
  const [dpr, setDpr] = useState(2);
  const shadowSize = useMemo(() => (typeof window !== "undefined" && window.innerWidth < 768 ? 1024 : 2048), []);
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
    <Canvas
      shadows
      dpr={[1, dpr]}
      camera={{ position: CAMERA_HOME.toArray(), fov: 42, near: 0.1, far: 120 }}
      // antialias off: BloomEffect renders into its own multisampled target, so MSAA on the
      // default framebuffer would be paid for and then thrown away.
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.4; // brighter, stable image
        // If the mobile GPU driver drops the context (memory pressure), let three rebuild it
        // instead of leaving a black canvas.
        const canvas = gl.domElement;
        canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={({ factor }) => setDpr(Math.min(2, Math.max(1, Math.round((1 + factor) * 4) / 4)))}
      />
      <color attach="background" args={["#05140d"]} />
      <fog attach="fog" args={["#05140d", 45, 110]} />
      <CameraRig playing={!!game} />

      {/* Moonlight through the dungeon window + emerald under-glow. All lights are steady (no flicker). */}
      <ambientLight intensity={0.9} color="#b7f7d8" />
      <hemisphereLight args={["#c7d2de", "#0a3d22", 1.0]} />
      <directionalLight
        position={[7, 16, 5]}
        intensity={2.8}
        color="#e8edff"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 4.5, 0]} color="#22c55e" intensity={16} distance={14} decay={2} />

      {/* Local studio reflections for the silver & emerald (no network HDR needed) */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.2} color="#e2e8f0" position={[0, 6, -6]} scale={[12, 3, 1]} />
        <Lightformer intensity={0.8} color="#34d399" position={[-6, 3, 4]} scale={[6, 6, 1]} />
        <Lightformer intensity={0.6} color="#ffffff" position={[6, 4, 6]} scale={[4, 4, 1]} />
      </Environment>

      {/* Obsidian floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0c1512" metalness={0.45} roughness={0.5} />
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
        minDistance={6}
        maxDistance={75}
        maxPolarAngle={Math.PI / 2.25}
        autoRotate={!game}
        autoRotateSpeed={0.6}
      />

      <BloomEffect />
    </Canvas>
  );
}
