/**
 * Three.js curves shared by the snake/ladder meshes AND the token slide/climb
 * animation, so a bitten token follows exactly the serpent body it sees.
 */
import * as THREE from "three";
import { type Jump, type Vec3, tilePosition } from "./board";

/** Serpent body from head (inner, higher ring) to tail (outer, lower ring). */
export function snakeCurve(jump: Jump): THREE.CatmullRomCurve3 {
  const head = new THREE.Vector3(...tilePosition(jump.from));
  const tail = new THREE.Vector3(...tilePosition(jump.to));
  head.y += 0.16;
  tail.y += 0.12;
  const dir = tail.clone().sub(head);
  const drop = Math.max(0, head.y - tail.y);
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const points: THREE.Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = head.clone().lerp(tail, t);
    // S-shaped sway, fading at both ends so head/tail sit on their tiles.
    const sway = Math.sin(t * Math.PI * 2) * 0.32 * Math.sin(t * Math.PI);
    p.addScaledVector(side, sway);
    // Arch over the terrace steps between rings.
    p.y += Math.sin(t * Math.PI) * (0.18 + drop * 0.32);
    points.push(p);
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

/** Ladder foot and top; the top end leans above its tile to clear the terrace edge. */
export function ladderEnds(jump: Jump): [THREE.Vector3, THREE.Vector3] {
  const foot = new THREE.Vector3(...tilePosition(jump.from));
  const top = new THREE.Vector3(...tilePosition(jump.to));
  foot.y += 0.04;
  top.y += 0.5;
  return [foot, top];
}

/** Evenly spaced points for animation. */
export function samplePoints(curve: THREE.Curve<THREE.Vector3>, count: number): Vec3[] {
  return curve.getSpacedPoints(count).map((p) => [p.x, p.y, p.z] as Vec3);
}

export function ladderPoints(jump: Jump, count: number): Vec3[] {
  const [a, b] = ladderEnds(jump);
  return samplePoints(new THREE.LineCurve3(a, b), count);
}
