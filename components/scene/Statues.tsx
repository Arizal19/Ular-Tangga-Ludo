"use client";
/**
 * Carved stone guardians at the middle of the four board edges: two gryphons
 * (eagle head and wings, lion haunches) and two crouching gargoyles (horns, bat
 * wings, tail), plus the stone altar the die floats above. Original designs, built from
 * primitives.
 *
 * Performance: every statue is ONE merged geometry with a shared stone material
 * (plus one tiny mesh for its glowing eyes). Statues ignore raycasts so they never
 * block a tap on the die.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "@/lib/board";

type Part = THREE.BufferGeometry;

/** Place a primitive: position, euler rotation, scale. */
function put(geo: Part, p: Vec3, r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]): Part {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  );
  return geo.applyMatrix4(m);
}

/** Merge parts that may mix indexed and non-indexed geometry, keeping position/normal/uv only. */
function merge(parts: Part[]): Part {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const out = mergeGeometries(clean)!;
  out.computeVertexNormals();
  return out;
}

const sphere = (r = 1, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Thin extruded wing from a 2D outline (x outward, y up). */
function wing(points: [number, number][], depth = 0.035): Part {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
}

/** Bat wing: three finger bones with scalloped membrane between them. */
const BAT_WING: [number, number][] = [
  [0, 0], [0.08, 0.22], [0.2, 0.5], [0.3, 0.68], [0.32, 0.5], [0.42, 0.52], [0.46, 0.34], [0.56, 0.32], [0.52, 0.14], [0.36, 0.12], [0.18, -0.02],
];

/** Feathered wing: rounded leading edge, notched primary feathers along the trailing edge. */
const FEATHER_WING: [number, number][] = [
  [0, 0], [0.06, 0.3], [0.16, 0.6], [0.3, 0.85], [0.42, 0.95], [0.44, 0.8], [0.52, 0.78], [0.5, 0.62], [0.58, 0.58], [0.52, 0.44],
  [0.58, 0.38], [0.48, 0.28], [0.52, 0.2], [0.4, 0.14], [0.4, 0.06], [0.26, 0.04], [0.12, -0.04],
];

function tail(points: Vec3[], radius: number): Part {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 24, radius, 8, false);
}

function pedestal(): Part[] {
  return [
    put(box(0.95, 0.12, 0.95), [0, 0.06, 0]),
    put(box(0.8, 0.42, 0.8), [0, 0.33, 0]),
    put(box(0.95, 0.1, 0.95), [0, 0.59, 0]),
  ];
}
const TOP = 0.64; // statue feet sit on the pedestal cap

function gargoyleGeometry(): { stone: Part; eyes: Part } {
  const y = TOP;
  const parts: Part[] = [
    ...pedestal(),
    // Haunches, feet with claws
    put(sphere(1), [-0.15, y + 0.18, -0.02], [0, 0, 0], [0.17, 0.16, 0.26]),
    put(sphere(1), [0.15, y + 0.18, -0.02], [0, 0, 0], [0.17, 0.16, 0.26]),
    put(sphere(1), [-0.14, y + 0.05, 0.2], [0, 0, 0], [0.08, 0.05, 0.12]),
    put(sphere(1), [0.14, y + 0.05, 0.2], [0, 0, 0], [0.08, 0.05, 0.12]),
    ...[-0.18, -0.14, -0.1, 0.1, 0.14, 0.18].map((x) => put(cone(0.015, 0.06, 5), [x, y + 0.03, 0.32], [Math.PI / 2, 0, 0])),
    // Hunched torso
    put(sphere(1, 16, 12), [0, y + 0.45, 0], [0.35, 0, 0], [0.24, 0.32, 0.21]),
    // Arms resting on the knees, hands as fists
    put(capsule(0.05, 0.22), [-0.2, y + 0.38, 0.12], [-0.5, 0, 0.15]),
    put(capsule(0.05, 0.22), [0.2, y + 0.38, 0.12], [-0.5, 0, -0.15]),
    put(sphere(0.06), [-0.17, y + 0.24, 0.24]),
    put(sphere(0.06), [0.17, y + 0.24, 0.24]),
    // Head: skull, snout, brow, jaw, horns, ears
    put(sphere(1, 16, 12), [0, y + 0.76, 0.12], [0, 0, 0], [0.15, 0.14, 0.15]),
    put(box(0.14, 0.08, 0.12), [0, y + 0.72, 0.25]),
    put(box(0.22, 0.035, 0.06), [0, y + 0.81, 0.22], [0.3, 0, 0]),
    put(box(0.12, 0.04, 0.1), [0, y + 0.66, 0.22], [0.2, 0, 0]),
    put(cone(0.035, 0.22, 7), [-0.1, y + 0.92, 0.04], [-0.6, 0, 0.35]),
    put(cone(0.035, 0.22, 7), [0.1, y + 0.92, 0.04], [-0.6, 0, -0.35]),
    put(cone(0.03, 0.12, 5), [-0.16, y + 0.8, 0.1], [0, 0, 1.2]),
    put(cone(0.03, 0.12, 5), [0.16, y + 0.8, 0.1], [0, 0, -1.2]),
    // Folded bat wings rising behind the shoulders
    put(wing(BAT_WING), [-0.12, y + 0.5, -0.16], [0.25, -2.5, 0.25]),
    put(wing(BAT_WING), [0.12, y + 0.5, -0.16], [0.25, -0.64, -0.25]),
    // Tail curling round the pedestal edge, spade tip
    tail([[0, y + 0.14, -0.22], [0.12, y + 0.06, -0.36], [0.3, y + 0.03, -0.3], [0.38, y + 0.03, -0.1]], 0.03),
    put(cone(0.06, 0.1, 4), [0.4, y + 0.03, -0.04], [Math.PI / 2, 0, 0]),
  ];
  const eyes = merge([put(sphere(0.022, 8, 6), [-0.055, y + 0.78, 0.25]), put(sphere(0.022, 8, 6), [0.055, y + 0.78, 0.25])]);
  return { stone: merge(parts), eyes };
}

function gryphonGeometry(): { stone: Part; eyes: Part } {
  const y = TOP;
  const parts: Part[] = [
    ...pedestal(),
    // Seated lion haunches and hind paws
    put(sphere(1, 16, 12), [0, y + 0.22, -0.1], [0, 0, 0], [0.26, 0.22, 0.32]),
    put(sphere(1), [-0.17, y + 0.06, 0.1], [0, 0, 0], [0.08, 0.06, 0.14]),
    put(sphere(1), [0.17, y + 0.06, 0.1], [0, 0, 0], [0.08, 0.06, 0.14]),
    // Feathered chest
    put(sphere(1, 16, 12), [0, y + 0.52, 0.08], [-0.15, 0, 0], [0.21, 0.3, 0.2]),
    // Straight eagle forelegs with talons
    put(capsule(0.04, 0.32), [-0.1, y + 0.22, 0.22]),
    put(capsule(0.04, 0.32), [0.1, y + 0.22, 0.22]),
    ...[-0.13, -0.1, -0.07, 0.07, 0.1, 0.13].map((x) => put(cone(0.013, 0.07, 5), [x, y + 0.03, 0.3], [1.9, 0, 0])),
    // Neck, head, hooked beak, ear tufts
    put(capsule(0.08, 0.16), [0, y + 0.78, 0.12], [0.25, 0, 0]),
    put(sphere(1, 16, 12), [0, y + 0.95, 0.16], [0, 0, 0], [0.12, 0.12, 0.14]),
    put(cone(0.06, 0.18, 8), [0, y + 0.93, 0.33], [Math.PI / 2 + 0.25, 0, 0]),
    put(cone(0.03, 0.08, 6), [0, y + 0.88, 0.4], [Math.PI - 0.4, 0, 0]),
    put(cone(0.025, 0.11, 5), [-0.07, y + 1.06, 0.1], [-0.7, 0, 0.3]),
    put(cone(0.025, 0.11, 5), [0.07, y + 1.06, 0.1], [-0.7, 0, -0.3]),
    // Raised feathered wings
    put(wing(FEATHER_WING), [-0.14, y + 0.58, -0.08], [0.1, -2.7, 0.2], [1.05, 1.05, 1]),
    put(wing(FEATHER_WING), [0.14, y + 0.58, -0.08], [0.1, -0.44, -0.2], [1.05, 1.05, 1]),
    // Lion tail with tufted tip
    tail([[0, y + 0.12, -0.38], [-0.18, y + 0.04, -0.42], [-0.34, y + 0.04, -0.24], [-0.36, y + 0.08, 0.02]], 0.025),
    put(sphere(0.05, 8, 6), [-0.36, y + 0.1, 0.06], [0, 0, 0], [1, 1, 1.4]),
  ];
  const eyes = merge([put(sphere(0.018, 8, 6), [-0.07, y + 0.98, 0.25]), put(sphere(0.018, 8, 6), [0.07, y + 0.98, 0.25])]);
  return { stone: merge(parts), eyes };
}

/** Weathered stone: grey speckle with darker cracks and faint moss; also the bump map. */
function stoneTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#636b67";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 5000; i++) {
    const v = 90 + Math.random() * 70;
    ctx.fillStyle = `rgba(${v},${v + 4},${v},0.35)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  ctx.strokeStyle = "rgba(30,34,32,0.45)";
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    let x = Math.random() * s, y = Math.random() * s;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) ctx.lineTo((x += (Math.random() - 0.5) * 40), (y += (Math.random() - 0.5) * 40));
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = "rgba(52,92,58,0.18)";
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

const noRaycast = () => null;

export function Statues({ die }: { die: Vec3 }) {
  const { gargoyle, gryphon, stone, altar } = useMemo(() => {
    const map = stoneTexture();
    const stone = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2.5, roughness: 0.92, metalness: 0.02 });
    const altar = merge([
      put(new THREE.CylinderGeometry(0.75, 0.85, 0.12, 24), [0, 0.06, 0]),
      put(new THREE.CylinderGeometry(0.55, 0.62, 0.32, 24), [0, 0.28, 0]),
      put(new THREE.CylinderGeometry(0.72, 0.62, 0.1, 24), [0, 0.49, 0]),
    ]);
    return { gargoyle: gargoyleGeometry(), gryphon: gryphonGeometry(), stone, altar };
  }, []);

  const [x, , z] = die;
  const floor = -0.25;
  // Guardians stand at the middle of each board edge, facing outward. Gryphons take the
  // left/right edges; the shorter gargoyles take front/back so they don't hide the tiles.
  const E = 6.45; // just outside the plinth (half-width 5.35)
  const placements: { kind: "gryphon" | "gargoyle"; pos: Vec3; yaw: number }[] = [
    { kind: "gryphon", pos: [-E, floor, 0], yaw: -Math.PI / 2 },
    { kind: "gryphon", pos: [E, floor, 0], yaw: Math.PI / 2 },
    { kind: "gargoyle", pos: [0, floor, E], yaw: 0 },
    { kind: "gargoyle", pos: [0, floor, -E], yaw: Math.PI },
  ];

  return (
    <group>
      <mesh geometry={altar} material={stone} position={[x, floor, z]} castShadow receiveShadow raycast={noRaycast} />
      {placements.map((p, i) => {
        const g = p.kind === "gryphon" ? gryphon : gargoyle;
        return (
          <group key={i} position={p.pos} rotation={[0, p.yaw, 0]} scale={0.9}>
            <mesh geometry={g.stone} material={stone} castShadow receiveShadow raycast={noRaycast} />
            {/* Faint emerald eyes, kept dim so they don't glare */}
            <mesh geometry={g.eyes} raycast={noRaycast}>
              <meshBasicMaterial color="#34d399" toneMapped={false} transparent opacity={0.75} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Altar top height above the floor, for placing the die's levitation glyph. */
export const ALTAR_TOP = 0.54 - 0.25;
