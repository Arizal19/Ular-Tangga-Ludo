/** Self-check for board geometry and rules. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINISH,
  JUMPS,
  LAP_LENGTH,
  MAGIC_TILES,
  PATHS,
  SAFE_TILES,
  SEATS,
  TILE_COUNT,
  progressAt,
  ringOf,
  rowCol,
  tileAt,
} from "./board";
import {
  chooseAIMove,
  createGame,
  isThirdSix,
  legalMoves,
  nextTurn,
  resolveMove,
  seatsFor,
  type GameState,
} from "./rules";

test("every seat path covers all 100 tiles with orthogonal single steps", () => {
  for (const path of PATHS) {
    assert.equal(path.length, TILE_COUNT);
    assert.equal(new Set(path).size, TILE_COUNT);
    for (let i = 1; i < path.length; i++) {
      const [r1, c1] = rowCol(path[i - 1]);
      const [r2, c2] = rowCol(path[i]);
      assert.equal(Math.abs(r1 - r2) + Math.abs(c1 - c2), 1, `gap at step ${i}`);
    }
    // Lap is the outer ring; ring index never decreases along the path.
    path.slice(0, LAP_LENGTH).forEach((t) => assert.equal(ringOf(t), 0));
    for (let i = 1; i < path.length; i++) assert.ok(ringOf(path[i]) >= ringOf(path[i - 1]));
  }
});

test("each seat starts on its own corner", () => {
  assert.deepEqual(SEATS.map((s) => rowCol(tileAt(s, 1))), [[0, 0], [0, 9], [9, 9], [9, 0]]);
});

test("ladders always boost and snakes always drop, for every seat", () => {
  const endpoints = JUMPS.flatMap((j) => [j.from, j.to]);
  assert.equal(new Set(endpoints).size, endpoints.length, "jump endpoints overlap");
  for (const j of JUMPS) {
    assert.ok(!SAFE_TILES.has(j.from) && !SAFE_TILES.has(j.to), `${j.id} touches a safe tile`);
    for (const s of SEATS) {
      const from = progressAt(s, j.from);
      const to = progressAt(s, j.to);
      assert.ok(from !== FINISH, `${j.id} sits on seat ${s} summit`);
      if (j.kind === "ladder") assert.ok(to > from, `${j.id} not up for seat ${s}`);
      else assert.ok(to < from, `${j.id} not down for seat ${s}`);
    }
  }
});

test("jump sets are identical for every seat (fair rotation)", () => {
  const signature = (s: (typeof SEATS)[number]) =>
    JUMPS.map((j) => `${progressAt(s, j.from)}>${progressAt(s, j.to)}`).sort().join(",");
  for (const s of SEATS) assert.equal(signature(s), signature(0));
});

const twoPlayers = (): GameState =>
  createGame(
    seatsFor(2).map((seat, i) => ({ seat, name: `P${i + 1}`, character: "draco", isAI: true })),
  );

test("leaving base needs a six; exact roll to finish", () => {
  const g = twoPlayers();
  assert.equal(legalMoves(g, 0, 5).length, 0);
  assert.equal(legalMoves(g, 0, 6).length, 2);
  const near = { ...g, tokens: g.tokens.map((t) => (t.id === "t0-0" ? { ...t, progress: 97 } : t)) };
  assert.deepEqual(legalMoves(near, 0, 4).map((m) => m.tokenId), []);
  const o = resolveMove(near, legalMoves(near, 0, 3)[0], 3);
  assert.ok(o.finished && o.extraTurn);
});

test("landing on an opponent captures it; safe tiles protect", () => {
  const g = twoPlayers();
  // Seat 2's progress-5 tile (row 9, col 5) is on seat 0's lap.
  const tile = tileAt(2, 5);
  const p0 = progressAt(0, tile);
  const g1 = {
    ...g,
    tokens: g.tokens.map((t) =>
      t.id === "t0-0" ? { ...t, progress: p0 - 3 } : t.id === "t2-0" ? { ...t, progress: 5 } : t,
    ),
  };
  // This tile is also a magic rune: switch spells off so only the takeover is tested.
  const o = resolveMove(g1, { tokenId: "t0-0", from: p0 - 3, to: p0 }, 3, Math.random, false);
  assert.deepEqual(o.captured.map((t) => t.id), ["t2-0"]);
  assert.equal(o.next.tokens.find((t) => t.id === "t2-0")!.progress, 0);
  assert.ok(o.extraTurn);

  // Seat 2's start tile is safe.
  const safe = tileAt(2, 1);
  const ps = progressAt(0, safe);
  const g2 = {
    ...g,
    tokens: g.tokens.map((t) =>
      t.id === "t0-0" ? { ...t, progress: ps - 2 } : t.id === "t2-0" ? { ...t, progress: 1 } : t,
    ),
  };
  assert.equal(resolveMove(g2, { tokenId: "t0-0", from: ps - 2, to: ps }, 2).captured.length, 0);
});

test("third consecutive six is detected", () => {
  let g = twoPlayers();
  g = nextTurn(g, true, true);
  g = nextTurn(g, true, true);
  assert.ok(isThirdSix(g, 6));
  assert.ok(!isThirdSix(g, 5));
});

test("full 4-player AI games always terminate with a winner", () => {
  for (let game = 0; game < 200; game++) {
    let g = createGame(
      seatsFor(4).map((seat, i) => ({ seat, name: `P${i + 1}`, character: "snape", isAI: true })),
    );
    let rolls = 0;
    while (g.winner === null) {
      assert.ok(++rolls < 5000, "game did not terminate");
      const seat = g.players[g.turn].seat;
      const roll = 1 + Math.floor(Math.random() * 6);
      if (isThirdSix(g, roll)) {
        g = nextTurn(g, false, false);
        continue;
      }
      const moves = legalMoves(g, seat, roll);
      if (moves.length === 0) {
        g = nextTurn(g, roll === 6, roll === 6);
        continue;
      }
      const o = resolveMove(g, chooseAIMove(g, moves, roll), roll);
      for (const t of o.next.tokens) assert.ok(t.progress >= 0 && t.progress <= FINISH);
      g = nextTurn(o.next, o.extraTurn, roll === 6);
    }
  }
});

test("magic runes: 16 unique tiles, never on a jump end or Protego tile", () => {
  assert.equal(MAGIC_TILES.size, 16);
  for (const j of JUMPS) assert.ok(!MAGIC_TILES.has(j.from) && !MAGIC_TILES.has(j.to));
  for (const t of SAFE_TILES) assert.ok(!MAGIC_TILES.has(t));
});

test("rune spells: Felix rolls again, Portkey +5, Confundo -3, Protego gives a shield", () => {
  const rune = [...Array(FINISH - 1).keys()].map((i) => i + 1).find((p) => p > 2 && MAGIC_TILES.has(tileAt(0, p)))!;
  const at = (g: GameState, p: number): GameState => ({
    ...g,
    tokens: g.tokens.map((t) => (t.id === "t0-0" ? { ...t, progress: p } : t)),
  });
  const g = at(twoPlayers(), rune - 2);
  const move = { tokenId: "t0-0", from: rune - 2, to: rune };
  const cast = (r: number) => resolveMove(g, move, 2, () => r);

  const felix = cast(0);
  assert.equal(felix.spell?.kind, "felix");
  assert.ok(felix.extraTurn);
  assert.equal(felix.finalProgress, rune);
  assert.equal(cast(0.3).finalProgress, rune + 5);
  assert.equal(cast(0.6).finalProgress, Math.max(1, rune - 3));
  const protego = cast(0.9);
  assert.equal(protego.spell?.kind, "protego");
  assert.equal(protego.next.shields[0], 1);
  assert.ok(!cast(0.3).extraTurn);
});

test("a Protego Charm blocks one snake bite, then is used up", () => {
  const snake = JUMPS.find((j) => j.kind === "snake")!;
  const head = progressAt(0, snake.from);
  let g = twoPlayers();
  g = { ...g, shields: [1, 0, 0, 0], tokens: g.tokens.map((t) => (t.id === "t0-0" ? { ...t, progress: head - 1 } : t)) };
  const o = resolveMove(g, { tokenId: "t0-0", from: head - 1, to: head }, 1);
  assert.equal(o.blocked?.id, snake.id);
  assert.equal(o.jump, null);
  assert.equal(o.finalProgress, head);
  assert.equal(o.next.shields[0], 0);
  // Without a shield the same move slides down.
  const bitten = resolveMove({ ...g, shields: [0, 0, 0, 0] }, { tokenId: "t0-0", from: head - 1, to: head }, 1);
  assert.equal(bitten.jump?.id, snake.id);
  assert.ok(bitten.finalProgress < head);
});
