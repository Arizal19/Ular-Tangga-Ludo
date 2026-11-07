"use client";
/**
 * Wizard miniature (original design, not a likeness of any book/film character):
 * folded cloak, torso, arms, wand, head with hat or hood, house scarf and belt.
 * The character's identity is shown by the portrait medallion in Token.tsx.
 *
 * Animated: breathing, head glance, and the wand arm raises (tip glows) while the
 * piece can be chosen or is moving. Low quality renders only cloak + head + headwear.
 */
import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useMemo, useRef } from "react";
import * as THREE from "three";

export interface WizardMotion {
  moving: boolean;
  ready: boolean;
}

/** Cloak: flared lathe whose hem is pushed in and out to read as cloth folds. */
const CLOAK = (() => {
  const profile = [
    [0.19, 0], [0.185, 0.03], [0.16, 0.14], [0.125, 0.27], [0.095, 0.38], [0.075, 0.44], [0, 0.44],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 48);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const fold = 1 + 0.08 * Math.sin(Math.atan2(z, x) * 9) * Math.max(0, 1 - y / 0.36);
    pos.setXYZ(i, x * fold, y, z * fold);
  }
  geo.computeVertexNormals();
  return geo;
})();
const TORSO = new THREE.CapsuleGeometry(0.072, 0.11, 6, 16);
const MANTLE = new THREE.CylinderGeometry(0.06, 0.135, 0.11, 24, 1, true);
const ARM = new THREE.CapsuleGeometry(0.028, 0.16, 4, 10).translate(0, -0.1, 0); // pivot at the shoulder
const HAND = new THREE.SphereGeometry(0.03, 12, 10);
const WAND = new THREE.CylinderGeometry(0.007, 0.012, 0.24, 8).translate(0, 0.12, 0);
const WAND_TIP = new THREE.SphereGeometry(0.02, 10, 8);
const HEAD = new THREE.SphereGeometry(0.072, 24, 18);
const EYE = new THREE.SphereGeometry(0.009, 8, 6);
const NOSE = new THREE.ConeGeometry(0.012, 0.03, 8).rotateX(Math.PI / 2);
const BROW = new THREE.BoxGeometry(0.026, 0.006, 0.008);
const BOOT = new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const CLASP = new THREE.SphereGeometry(0.016, 10, 8);
const HOOD = new THREE.SphereGeometry(0.095, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
const HAT = new THREE.ConeGeometry(0.1, 0.27, 24);
const BRIM = new THREE.CylinderGeometry(0.165, 0.165, 0.012, 32);
const SCARF = new THREE.TorusGeometry(0.06, 0.022, 10, 24);
const SCARF_TAIL = new THREE.BoxGeometry(0.04, 0.16, 0.012);
const BELT = new THREE.TorusGeometry(0.098, 0.012, 8, 32);

const CLOTH = "#16201b";
const SKIN = "#d6bc9c";

/** Stable per-character pick of headwear (cosmetic variety only). */
const wearsHat = (key: string) => [...key].reduce((s, c) => s + c.charCodeAt(0), 0) % 2 === 0;

export function Wizard({
  character,
  color,
  glow,
  simple,
  motion,
}: {
  character: string;
  color: string;
  glow: string;
  simple: boolean;
  motion: MutableRefObject<WizardMotion>;
}) {
  const torso = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const wandArm = useRef<THREE.Group>(null);
  const tip = useRef<THREE.MeshBasicMaterial>(null);
  const hat = wearsHat(character);
  const phase = useMemo(() => Math.random() * 10, []);
  const raise = useRef(0);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + phase;
    const { moving, ready } = motion.current;
    if (torso.current) torso.current.scale.setScalar(1 + Math.sin(t * 2.1) * 0.012); // breathing
    // Lean into the stride while moving; the cloak sways with it.
    if (root.current) {
      const lean = moving ? 0.16 + Math.sin(t * 14) * 0.03 : Math.sin(t * 1.3) * 0.015;
      root.current.rotation.x += (lean - root.current.rotation.x) * Math.min(1, delta * 8);
      root.current.rotation.z = moving ? Math.sin(t * 7) * 0.04 : 0;
    }
    if (head.current) head.current.rotation.y = Math.sin(t * 0.7) * 0.35 * (moving ? 0.2 : 1); // glance around
    // Wand arm: rests low, rises to cast when this piece is in play.
    const want = moving || ready ? 1 : 0;
    raise.current += (want - raise.current) * Math.min(1, delta * 5);
    if (wandArm.current) {
      wandArm.current.rotation.x = -0.35 - raise.current * 1.5 + Math.sin(t * 3) * 0.06 * raise.current;
    }
    if (tip.current) tip.current.opacity = 0.35 + raise.current * 0.65;
  });

  const headwear = hat ? (
    <group position={[0, 0.055, 0]}>
      <mesh geometry={BRIM} castShadow>
        <meshStandardMaterial color={CLOTH} roughness={0.7} />
      </mesh>
      <mesh geometry={HAT} position={[0, 0.13, -0.015]} rotation={[-0.18, 0, 0]} castShadow>
        <meshStandardMaterial color={CLOTH} roughness={0.7} />
      </mesh>
    </group>
  ) : (
    <mesh geometry={HOOD} position={[0, 0.005, -0.012]} rotation={[-0.35, 0, 0]} castShadow>
      <meshStandardMaterial color={CLOTH} roughness={0.75} side={THREE.DoubleSide} />
    </mesh>
  );

  return (
    <group ref={root} position={[0, 0.1, 0]}>
      {/* Boot toes peeking out under the hem */}
      {!simple &&
        [-1, 1].map((sx) => (
          <mesh key={sx} geometry={BOOT} position={[sx * 0.06, 0, 0.15]} scale={[0.9, 0.7, 1.3]} castShadow>
            <meshStandardMaterial color="#1a1310" roughness={0.45} metalness={0.2} />
          </mesh>
        ))}
      <mesh geometry={CLOAK} castShadow>
        <meshStandardMaterial color={CLOTH} roughness={0.75} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {!simple && (
        <group ref={torso} position={[0, 0.46, 0]}>
          <mesh geometry={TORSO} castShadow>
            <meshStandardMaterial color={CLOTH} roughness={0.7} />
          </mesh>
          <mesh geometry={MANTLE} position={[0, 0.03, 0]} castShadow>
            <meshStandardMaterial color={CLOTH} roughness={0.75} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={CLASP} position={[0, 0.075, 0.07]}>
            <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.25} />
          </mesh>
          <mesh geometry={BELT} position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Left arm hangs by the side */}
          <group position={[-0.1, 0.07, 0]} rotation={[0.1, 0, 0.18]}>
            <mesh geometry={ARM} castShadow>
              <meshStandardMaterial color={CLOTH} roughness={0.7} />
            </mesh>
            <mesh geometry={HAND} position={[0, -0.22, 0]}>
              <meshStandardMaterial color={SKIN} roughness={0.6} />
            </mesh>
          </group>
          {/* Right arm holds the wand and rises to cast */}
          <group ref={wandArm} position={[0.1, 0.07, 0]} rotation={[-0.35, 0, -0.12]}>
            <mesh geometry={ARM} castShadow>
              <meshStandardMaterial color={CLOTH} roughness={0.7} />
            </mesh>
            <group position={[0, -0.22, 0]}>
              <mesh geometry={HAND}>
                <meshStandardMaterial color={SKIN} roughness={0.6} />
              </mesh>
              <group rotation={[Math.PI / 2 + 0.3, 0, 0]}>
                <mesh geometry={WAND}>
                  <meshStandardMaterial color="#4a2f1d" roughness={0.5} />
                </mesh>
                <mesh geometry={WAND_TIP} position={[0, 0.24, 0]}>
                  <meshBasicMaterial ref={tip} color={glow} toneMapped={false} transparent />
                </mesh>
              </group>
            </group>
          </group>
          {/* House scarf with a hanging tail */}
          <mesh geometry={SCARF} position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh geometry={SCARF_TAIL} position={[0.035, 0.02, 0.062]} rotation={[0.15, 0, 0.1]}>
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
        </group>
      )}
      <group ref={head} position={[0, 0.66, 0]}>
        <mesh geometry={HEAD} castShadow>
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        {!simple && (
          <>
            <mesh geometry={EYE} position={[-0.026, 0.012, 0.064]}>
              <meshBasicMaterial color="#111" />
            </mesh>
            <mesh geometry={EYE} position={[0.026, 0.012, 0.064]}>
              <meshBasicMaterial color="#111" />
            </mesh>
            <mesh geometry={NOSE} position={[0, -0.006, 0.074]}>
              <meshStandardMaterial color={SKIN} roughness={0.6} />
            </mesh>
            {[-1, 1].map((sx) => (
              <mesh key={sx} geometry={BROW} position={[sx * 0.026, 0.03, 0.066]} rotation={[0, 0, sx * -0.15]}>
                <meshBasicMaterial color="#2a1d14" />
              </mesh>
            ))}
          </>
        )}
        {headwear}
      </group>
    </group>
  );
}
