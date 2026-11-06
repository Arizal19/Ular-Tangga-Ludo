/**
 * Board geometry for "Slytherin Ascent" — pure data, no React, no Three.js.
 *
 * Layout (the "4D height factor"):
 *   A 10×10 grid of 100 tiles split into 5 concentric rings. Each inner ring is
 *   raised one layer higher, so the board is an emerald ziggurat:
 *
 *     ring 0  outer 10×10 perimeter  36 tiles  progress   1–36   (Ludo lap)
 *     ring 1  8×8 perimeter          28 tiles  progress  37–64   ┐
 *     ring 2  6×6 perimeter          20 tiles  progress  65–84   │ Snakes &
 *     ring 3  4×4 perimeter          12 tiles  progress  85–96   │ Ladders
 *     ring 4  2×2 summit              4 tiles  progress  97–100  ┘ ascent
 *
 * Paths:
 *   Seat 0 starts at the top-left corner (row 0, col 0), walks the outer lap
 *   clockwise, steps inward to (1,1), spirals ring by ring and ends on the summit.
 *   Seat q's path is seat 0's path rotated q × 90° clockwise, so every corner is a
 *   Ludo start zone and every seat faces the exact same course.
 *
 * Snakes & ladders:
 *   Defined once in seat-0 coordinates and replicated 4× by rotation. Every jump
 *   crosses rings (ladders go inward/up, snakes outward/down), and progress is
 *   monotonic in ring, so a ladder is a boost and a snake is a drop for EVERY seat.
 */

export const GRID = 10;
export const TILE_COUNT = GRID * GRID;
export const FINISH = 100;
export const LAP_LENGTH = 36;
export const TILE_SIZE = 1;
/** World-space rise per ring — the vertical "4th dimension" of the board. */
export const LAYER_HEIGHT = 0.42;
/** Thickness of the outer (ring 0) tile slab. */
export const BASE_THICKNESS = 0.22;

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];
/** Tile id = row * 10 + col. */
export type TileId = number;
export type Vec3 = [number, number, number];

export const tileId = (row: number, col: number): TileId => row * GRID + col;
export const rowCol = (id: TileId): [number, number] => [Math.floor(id / GRID), id % GRID];

/** Ring index 0 (outer) … 4 (summit). */
export function ringOf(id: TileId): number {
  const [r, c] = rowCol(id);
  return Math.min(r, c, GRID - 1 - r, GRID - 1 - c);
}

/** Clockwise walk around ring k, starting at its top-left corner (k, k). */
function ringWalk(k: number): TileId[] {
  const lo = k;
  const hi = GRID - 1 - k;
  const out: TileId[] = [];
  for (let c = lo; c <= hi; c++) out.push(tileId(lo, c)); // top edge →
  for (let r = lo + 1; r <= hi; r++) out.push(tileId(r, hi)); // right edge ↓
  for (let c = hi - 1; c >= lo; c--) out.push(tileId(hi, c)); // bottom edge ←
  for (let r = hi - 1; r > lo; r--) out.push(tileId(r, lo)); // left edge ↑
  return out;
}

/** Rotate a tile 90° clockwise around the board centre: (r, c) → (c, 9 − r). */
export function rotateTile(id: TileId, quarterTurns = 1): TileId {
  let [r, c] = rowCol(id);
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) [r, c] = [c, GRID - 1 - r];
  return tileId(r, c);
}

const SEAT0_PATH: TileId[] = [0, 1, 2, 3, 4].flatMap(ringWalk);

/** PATHS[seat][progress − 1] → tile. */
export const PATHS: TileId[][] = SEATS.map((s) => SEAT0_PATH.map((t) => rotateTile(t, s)));

/** PROGRESS_OF[seat][tile] → progress 1…100. */
export const PROGRESS_OF: number[][] = PATHS.map((path) => {
  const inv = new Array<number>(TILE_COUNT).fill(0);
  path.forEach((t, i) => (inv[t] = i + 1));
  return inv;
});

export const tileAt = (seat: Seat, progress: number): TileId => PATHS[seat][progress - 1];
export const progressAt = (seat: Seat, tile: TileId): number => PROGRESS_OF[seat][tile];

/** Seat-0 tile number shown on the board (the "rune number" of the spiral). */
export const runeNumber = (tile: TileId): number => PROGRESS_OF[0][tile];

// ─── Protego (safe) tiles: each seat's entry tile + the star 8 steps further ───
export const START_TILES: TileId[] = SEATS.map((s) => tileAt(s, 1));
export const STAR_TILES: TileId[] = SEATS.map((s) => tileAt(s, 9));
export const SAFE_TILES = new Set<TileId>([...START_TILES, ...STAR_TILES]);

// ─── Snakes & ladders ──────────────────────────────────────────────────────────
export type JumpKind = "ladder" | "snake";
export interface Jump {
  id: string;
  kind: JumpKind;
  /** Lore name used in the log, e.g. "Serpensortia". */
  name: string;
  from: TileId;
  to: TileId;
}

/** Seat-0 quadrant set; replicated ×4 by rotation. [row, col] pairs. */
const QUADRANT_JUMPS: { kind: JumpKind; name: string; from: [number, number]; to: [number, number] }[] = [
  { kind: "ladder", name: "Silver Staircase", from: [1, 3], to: [2, 5] },
  { kind: "ladder", name: "Moving Staircase", from: [2, 6], to: [3, 4] },
  { kind: "snake", name: "Basilisk", from: [3, 5], to: [0, 6] },
  { kind: "snake", name: "Serpensortia", from: [2, 3], to: [1, 1] },
];

export const JUMPS: Jump[] = SEATS.flatMap((q) =>
  QUADRANT_JUMPS.map((j, i) => ({
    id: `${j.kind}-${q}-${i}`,
    kind: j.kind,
    name: j.name,
    from: rotateTile(tileId(...j.from), q),
    to: rotateTile(tileId(...j.to), q),
  })),
);

export const JUMP_FROM = new Map<TileId, Jump>(JUMPS.map((j) => [j.from, j]));

// ─── World-space positions (Three.js uses y-up; board lies on the xz plane) ───

/** Height of the top face of a tile. */
export const tileTopY = (id: TileId): number => BASE_THICKNESS + ringOf(id) * LAYER_HEIGHT;

/** Centre of a tile's top face. */
export function tilePosition(id: TileId): Vec3 {
  const [r, c] = rowCol(id);
  const half = (GRID - 1) / 2;
  return [(c - half) * TILE_SIZE, tileTopY(id), (r - half) * TILE_SIZE];
}

/** Rotate a world xz point by the same 90° clockwise turn as rotateTile. */
const rotateXZ = ([x, y, z]: Vec3, q: number): Vec3 => {
  let p: Vec3 = [x, y, z];
  for (let i = 0; i < q; i++) p = [-p[2], p[1], p[0]];
  return p;
};

/** Centre of each corner "Hogwarts base" (Ludo starting zone). */
export const BASE_CENTER: Vec3[] = SEATS.map((s) => rotateXZ([-6.6, 0.12, -6.6], s));

/** Rest slot for token `index` while it waits in its base. */
export function baseSlot(seat: Seat, index: number): Vec3 {
  const [x, y, z] = BASE_CENTER[seat];
  const off = index === 0 ? -0.55 : 0.55;
  return [x + off, y + 0.1, z + off * (seat % 2 === 0 ? -1 : 1)];
}

/** Summit where finished tokens float around the Slytherin crest. */
export const SUMMIT_Y = BASE_THICKNESS + 4 * LAYER_HEIGHT;
export function summitSlot(seat: Seat, index: number): Vec3 {
  const angle = (seat * 2 + index) * (Math.PI / 4) + Math.PI / 8;
  return [Math.cos(angle) * 1.25, SUMMIT_Y + 1.15, Math.sin(angle) * 1.25];
}

/** Small offset so several tokens on one tile don't overlap. */
export function stackOffset(slot: number, count: number): [number, number] {
  if (count <= 1) return [0, 0];
  const a = (slot / count) * Math.PI * 2 + Math.PI / 4;
  return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
}
