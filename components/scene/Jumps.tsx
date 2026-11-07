"use client";
/**
 * Glowing emerald serpents (drop you down) and silver metallic ladders (lift you up).
 *
 * Serpents: procedural snakeskin (colour + bump), a vertex-shader slither wave,
 * open-jawed heads with slit-pupil eyes, fangs and a flicking forked tongue.
 *
 * Performance: static parts are merged across all jumps — every ladder rail and
 * rung is one mesh; serpent heads / eyes / pupils / fangs are one mesh each.
 * Bodies stay separate so each keeps its own slither and venom-pulse phase.
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

/** Shared clock for the slither shader (one uniform object, updated once per frame). */
const SLITHER_TIME = { value: 0 };

/** Procedural snakeskin: overlapping diamond scales with dark dorsal blotches. Also used as bump map. */
function snakeskin() {
  const W = 256, H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0d3a22";
  ctx.fillRect(0, 0, W, H);
  const sw = 16, sh = 12;
  for (let row = -1; row <= H / sh + 1; row++) {
    for (let col = -1; col <= W / sw + 1; col++) {
      const x = col * sw + (row % 2 ? sw / 2 : 0);
      const y = row * sh;
      const g = ctx.createRadialGradient(x, y - 2, 1, x, y, sw * 0.7);
      g.addColorStop(0, "#3fae6c");
      g.addColorStop(0.6, "#17643a");
      g.addColorStop(1, "#06200f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - sh * 0.75);
      ctx.lineTo(x + sw * 0.55, y);
      ctx.lineTo(x, y + sh * 0.75);
      ctx.lineTo(x - sw * 0.55, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Dorsal blotches give the body a readable pattern from far away.
  ctx.fillStyle = "rgba(2,14,7,0.55)";
  for (let x = 8; x < W; x += 32) {
    ctx.beginPath();
    ctx.ellipse(x, H * 0.25, 10, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 16, H * 0.75, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Tube whose radius tapers from head to tail. Adds per-vertex `aT` (0 head → 1 tail)
 * and `aSide` (horizontal sideways direction) for the slither shader.
 */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number, radial: number) {
  const geo = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const ring = radial + 1;
  const tArr = new Float32Array(pos.count);
  const sideArr = new Float32Array(pos.count * 3);
  const bellyArr = new Float32Array(pos.count);
  const off = new THREE.Vector3();
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const side = curve.getTangentAt(t).cross(up).normalize();
    // Thick neck → thin tail, with a slight bulge behind the head.
    const scale = (1.05 - 0.78 * Math.pow(t, 1.3)) * (1 + 0.12 * Math.exp(-((t - 0.12) ** 2) / 0.004));
    for (let j = 0; j < ring; j++) {
      const idx = i * ring + j;
      off.fromBufferAttribute(pos, idx).sub(center);
      // Underside of the body (offset pointing down) gets the pale belly scutes.
      bellyArr[idx] = THREE.MathUtils.smoothstep(-off.normalize().y, 0.25, 0.7);
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(scale).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
      tArr[idx] = t;
      sideArr.set([side.x, side.y, side.z], idx * 3);
    }
  }
  geo.setAttribute("aT", new THREE.BufferAttribute(tArr, 1));
  geo.setAttribute("aSide", new THREE.BufferAttribute(sideArr, 3));
  geo.setAttribute("aBelly", new THREE.BufferAttribute(bellyArr, 1));
  geo.computeVertexNormals();
  return geo;
}

/** Bends the body in a travelling S-wave (ends stay pinned) and paints pale banded belly scutes underneath. */
function addSlither(material: THREE.MeshStandardMaterial, phase: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SLITHER_TIME;
    shader.uniforms.uPhase = { value: phase };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aT;\nattribute vec3 aSide;\nattribute float aBelly;\nvarying float vBelly;\nvarying float vT;\nuniform float uTime;\nuniform float uPhase;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBelly = aBelly;\nvT = aT;\nfloat env = sin(3.14159 * aT) * smoothstep(0.0, 0.2, aT);\ntransformed += aSide * sin(aT * 16.0 - uTime * 3.0 + uPhase) * 0.07 * env;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBelly;\nvarying float vT;")
      .replace(
        "#include <map_fragment>",
        // Transverse belly plates: pale olive bands with darker seams between them.
        "#include <map_fragment>\nfloat seam = smoothstep(0.0, 0.18, abs(fract(vT * 90.0) - 0.5));\nvec3 belly = vec3(0.55, 0.6, 0.33) * (0.7 + 0.3 * seam);\ndiffuseColor.rgb = mix(diffuseColor.rgb, belly, vBelly * 0.9);",
      );
  };
}

/** World matrix of a serpent head: at the curve start, facing away from the body. */
function headMatrix(curve: THREE.Curve<THREE.Vector3>) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(0).negate());
  return new THREE.Matrix4().compose(curve.getPointAt(0), q, new THREE.Vector3(1, 1, 1));
}

/** Copy of `geo` placed at `local` within the head, then into the world. */
const place = (geo: THREE.BufferGeometry, head: THREE.Matrix4, local: THREE.Matrix4) =>
  geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(head, local));

const m4 = (x: number, y: number, z: number, rx = 0, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));

/** Forked tongue, built pointing +z from its root. */
const TONGUE = (() => {
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0, 0.06);
  const fork = (s: number) => new THREE.ConeGeometry(0.007, 0.07, 5).rotateX(Math.PI / 2).rotateY(s * 0.4).translate(s * 0.014, 0, 0.15);
  return mergeGeometries([stem, fork(-1), fork(1)]);
})();

function SerpentBody({ geometry, material }: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }) {
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

function Serpents({ sparkle }: { sparkle: number }) {
  const { bodies, heads, eyes, pupils, fangs, tongues, mids, headMaterial } = useMemo(() => {
    const skin = snakeskin();
    const headGeo = new THREE.SphereGeometry(0.2, 28, 20);
    const eyeGeo = new THREE.SphereGeometry(0.036, 14, 12);
    const pupilGeo = new THREE.BoxGeometry(0.008, 0.05, 0.01);
    const fangGeo = new THREE.ConeGeometry(0.014, 0.08, 6);

    const bodies: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; phase: number }[] = [];
    const heads: THREE.BufferGeometry[] = [];
    const eyes: THREE.BufferGeometry[] = [];
    const pupils: THREE.BufferGeometry[] = [];
    const fangs: THREE.BufferGeometry[] = [];
    const tongues: THREE.Matrix4[] = [];
    const mids: THREE.Vector3[] = [];
    for (const jump of SNAKES) {
      const curve = snakeCurve(jump);
      const map = skin.clone();
      map.needsUpdate = true;
      // One texture tile ≈ two body circumferences long, so scales stay roughly square.
      map.repeat.set(Math.max(2, Math.round(curve.getLength() * 0.55)), 1);
      const material = new THREE.MeshStandardMaterial({
        map,
        bumpMap: map,
        bumpScale: 3,
        color: "#ffffff",
        metalness: 0.25,
        roughness: 0.38,
        emissive: "#15803d",
        emissiveMap: map,
        emissiveIntensity: 0.25,
      });
      const phase = Math.random() * 10;
      addSlither(material, phase);
      bodies.push({ geometry: taperedTube(curve, 140, 0.15, 16), material, phase });

      const head = headMatrix(curve);
      // Skull + snout (upper jaw) and an open lower jaw.
      heads.push(place(headGeo, head, m4(0, 0.02, 0, 0, 1.05, 0.5, 1.35)));
      heads.push(place(headGeo, head, m4(0, 0.03, 0.17, 0, 0.72, 0.36, 0.9)));
      heads.push(place(headGeo, head, m4(0, -0.06, 0.14, 0.32, 0.68, 0.22, 0.9)));
      for (const s of [-1, 1]) {
        heads.push(place(headGeo, head, m4(s * 0.11, 0.11, 0.08, 0, 0.3, 0.14, 0.42))); // brow ridge
        heads.push(place(headGeo, head, m4(s * 0.03, 0.06, 0.32, 0, 0.06, 0.05, 0.06))); // nostril bump
        eyes.push(place(eyeGeo, head, m4(s * 0.12, 0.09, 0.1)));
        pupils.push(place(pupilGeo, head, m4(s * 0.142, 0.09, 0.125, 0, 1, 1, 1, s * 0.6)));
        fangs.push(place(fangGeo, head, m4(s * 0.06, -0.035, 0.27, Math.PI + 0.25)));
      }
      tongues.push(new THREE.Matrix4().multiplyMatrices(head, m4(0, -0.03, 0.22)));
      mids.push(curve.getPointAt(0.5));
    }
    const headMap = skin.clone();
    headMap.needsUpdate = true;
    headMap.repeat.set(3, 2);
    const headMaterial = new THREE.MeshStandardMaterial({
      map: headMap,
      bumpMap: headMap,
      bumpScale: 2,
      metalness: 0.25,
      roughness: 0.35,
      emissive: "#15803d",
      emissiveMap: headMap,
      emissiveIntensity: 0.2,
    });
    return {
      bodies,
      heads: mergeGeometries(heads),
      eyes: mergeGeometries(eyes),
      pupils: mergeGeometries(pupils),
      fangs: mergeGeometries(fangs),
      tongues,
      mids,
      headMaterial,
    };
  }, []);

  const tongueRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    SLITHER_TIME.value = t;
    bodies.forEach((b, i) => {
      // Gentle venom pulse, kept low so the serpents never glare.
      b.material.emissiveIntensity = 0.2 + Math.sin(t * 2.2 + b.phase) * 0.08;
      // Tongue flicks out briefly every ~2.5 s.
      const g = tongueRefs.current[i];
      if (g) {
        const k = ((t + b.phase) % 2.5) / 2.5;
        const out = k < 0.16 ? Math.sin((k / 0.16) * Math.PI) : 0;
        g.scale.set(1, 1, 0.05 + out);
      }
    });
  });

  return (
    <group>
      {bodies.map((b, i) => (
        <SerpentBody key={i} geometry={b.geometry} material={b.material} />
      ))}
      <mesh geometry={heads} material={headMaterial} castShadow />
      <mesh geometry={eyes}>
        <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={0.6} roughness={0.15} />
      </mesh>
      <mesh geometry={pupils}>
        <meshBasicMaterial color="#050505" />
      </mesh>
      <mesh geometry={fangs}>
        <meshStandardMaterial color="#f1f5f9" metalness={0.6} roughness={0.25} />
      </mesh>
      {tongues.map((m, i) => (
        <group key={i} matrix={m} matrixAutoUpdate={false}>
          <group ref={(el) => void (tongueRefs.current[i] = el)}>
            <mesh geometry={TONGUE}>
              <meshStandardMaterial color="#b91c1c" roughness={0.4} />
            </mesh>
          </group>
        </group>
      ))}
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
