/**
 * Pure game rules — no React, no DOM, no Three.js. Every function returns new
 * state; nothing mutates. The React hook (hooks/useGameEngine.ts) only sequences
 * these calls with timers and animations.
 *
 * Turn logic, step by step:
 *  1. Roll 1–6. A third consecutive 6 forfeits the turn ("wand confiscated").
 *  2. Legal moves:
 *       • token in base (progress 0) may enter on its start tile only with a 6;
 *       • token on the path moves `roll` steps; it must land EXACTLY on 100.
 *  3. Resolve: walk the steps → if the landing tile holds a snake head or ladder
 *     foot, jump → if an opponent token sits on the final tile and it is not a
 *     Protego tile, it is blasted back to its base (Ludo takeover).
 *  4. Extra turn on a 6, a capture or a token reaching the summit.
 *  5. First player with both tokens on the summit wins.
 */
import {
  FINISH,
  JUMP_FROM,
  type Jump,
  type Seat,
  type TileId,
  SAFE_TILES,
  progressAt,
  runeNumber,
  tileAt,
} from "./board";

export const TOKENS_PER_PLAYER = 2;

export interface PlayerConfig {
  seat: Seat;
  name: string;
  /** Portrait key in /public/characters/<character>.jpg */
  character: string;
  isAI: boolean;
}

export interface TokenState {
  id: string;
  seat: Seat;
  index: number;
  /** 0 = waiting in base, 1–99 = on the board, 100 = ascended to the summit. */
  progress: number;
}

export interface GameState {
  /** Players in turn order. */
  players: PlayerConfig[];
  tokens: TokenState[];
  /** Index into `players`. */
  turn: number;
  /** Consecutive sixes rolled by the current player. */
  sixStreak: number;
  winner: Seat | null;
}

export interface Move {
  tokenId: string;
  from: number;
  to: number;
}

export interface MoveOutcome {
  move: Move;
  /** Tiles walked one by one (for the hop animation). */
  steps: TileId[];
  /** Snake or ladder triggered on landing, if any. */
  jump: Jump | null;
  finalProgress: number;
  /** Opponent tokens sent back to base (state before reset). */
  captured: TokenState[];
  finished: boolean;
  extraTurn: boolean;
  /** Game state after the move; turn NOT yet advanced. */
  next: GameState;
}

export type LogTone = "info" | "six" | "ladder" | "snake" | "capture" | "finish" | "win" | "warn";
export interface LogEntry {
  id: number;
  tone: LogTone;
  text: string;
}

/** Seats used for a given player count (Ludo convention: 2 players sit opposite). */
export function seatsFor(count: number): Seat[] {
  if (count <= 2) return [0, 2];
  if (count === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export function createGame(players: PlayerConfig[]): GameState {
  if (players.length < 2 || players.length > 4) throw new Error("Slytherin Ascent needs 2–4 players");
  const tokens: TokenState[] = players.flatMap((p) =>
    Array.from({ length: TOKENS_PER_PLAYER }, (_, index) => ({
      id: `t${p.seat}-${index}`,
      seat: p.seat,
      index,
      progress: 0,
    })),
  );
  return { players, tokens, turn: 0, sixStreak: 0, winner: null };
}

export const currentPlayer = (s: GameState): PlayerConfig => s.players[s.turn];
export const playerBySeat = (s: GameState, seat: Seat): PlayerConfig =>
  s.players.find((p) => p.seat === seat)!;

/** Tile a token currently occupies, or null when in base / on the summit. */
export function tokenTile(t: TokenState): TileId | null {
  return t.progress > 0 && t.progress < FINISH ? tileAt(t.seat, t.progress) : null;
}

export function legalMoves(state: GameState, seat: Seat, roll: number): Move[] {
  return state.tokens
    .filter((t) => t.seat === seat && t.progress < FINISH)
    .flatMap((t): Move[] => {
      if (t.progress === 0) return roll === 6 ? [{ tokenId: t.id, from: 0, to: 1 }] : [];
      const to = t.progress + roll;
      return to <= FINISH ? [{ tokenId: t.id, from: t.progress, to }] : [];
    });
}

/** Third six in a row forfeits the turn. */
export const isThirdSix = (state: GameState, roll: number): boolean => roll === 6 && state.sixStreak >= 2;

export function resolveMove(state: GameState, move: Move, roll: number): MoveOutcome {
  const token = state.tokens.find((t) => t.id === move.tokenId);
  if (!token) throw new Error(`Unknown token ${move.tokenId}`);
  const seat = token.seat;

  // 1. Walk tile by tile (entering from base is a single step onto the start tile).
  const steps: TileId[] = [];
  for (let p = move.from + 1; p <= move.to; p++) steps.push(tileAt(seat, p));

  // 2. Snake head / ladder foot on the landing tile (never on the summit tile).
  let finalProgress = move.to;
  const jump = move.to < FINISH ? JUMP_FROM.get(tileAt(seat, move.to)) ?? null : null;
  if (jump) finalProgress = progressAt(seat, jump.to);
  const finished = finalProgress === FINISH;

  // 3. Ludo takeover on the final tile (Protego tiles and the summit are safe).
  const finalTile = tileAt(seat, finalProgress);
  const captured = finished || SAFE_TILES.has(finalTile)
    ? []
    : state.tokens.filter((t) => t.seat !== seat && tokenTile(t) === finalTile);
  const capturedIds = new Set(captured.map((t) => t.id));

  const tokens = state.tokens.map((t) =>
    t.id === token.id ? { ...t, progress: finalProgress } : capturedIds.has(t.id) ? { ...t, progress: 0 } : t,
  );
  const won = tokens.filter((t) => t.seat === seat).every((t) => t.progress === FINISH);

  return {
    move,
    steps,
    jump,
    finalProgress,
    captured,
    finished,
    extraTurn: !won && (roll === 6 || captured.length > 0 || finished),
    next: { ...state, tokens, winner: won ? seat : state.winner },
  };
}

/** Advance to the next player unless an extra turn was earned. */
export function nextTurn(state: GameState, extraTurn: boolean, rolledSix: boolean): GameState {
  if (state.winner !== null) return state;
  if (extraTurn) return { ...state, sixStreak: rolledSix ? state.sixStreak + 1 : 0 };
  return { ...state, turn: (state.turn + 1) % state.players.length, sixStreak: 0 };
}

/** Could any opponent land on `tile` with a single roll next turn? */
function threatened(state: GameState, seat: Seat, tile: TileId): boolean {
  if (SAFE_TILES.has(tile)) return false;
  return state.tokens.some((t) => {
    if (t.seat === seat || t.progress >= FINISH) return false;
    const target = progressAt(t.seat, tile);
    if (t.progress === 0) return target === 1; // could enter on a 6
    const gap = target - t.progress;
    return gap >= 1 && gap <= 6;
  });
}

/** Greedy Slytherin AI: ambition first, then cunning self-preservation. */
export function chooseAIMove(state: GameState, moves: Move[], roll: number): Move {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const o = resolveMove(state, move, roll);
    const token = state.tokens.find((t) => t.id === move.tokenId)!;
    let score = o.finalProgress;
    if (o.finished) score += 1000;
    score += o.captured.reduce((acc, v) => acc + 400 + v.progress * 4, 0);
    if (o.jump?.kind === "ladder") score += 250;
    if (o.jump?.kind === "snake") score -= 300;
    if (move.from === 0) score += 220;
    const fromTile = tokenTile(token);
    if (fromTile !== null && threatened(state, token.seat, fromTile)) score += 90; // flee danger
    if (!o.finished && threatened(o.next, token.seat, tileAt(token.seat, o.finalProgress))) score -= 120;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

/** Narrate an outcome for the log panel. */
export function describeOutcome(state: GameState, o: MoveOutcome): Omit<LogEntry, "id">[] {
  const token = state.tokens.find((t) => t.id === o.move.tokenId)!;
  const who = playerBySeat(state, token.seat).name;
  const label = `${who}'s serpent ${token.index + 1}`;
  const lines: Omit<LogEntry, "id">[] = [];

  if (o.move.from === 0) lines.push({ tone: "info", text: `${label} slithers out of the dungeon base.` });
  else lines.push({ tone: "info", text: `${label} glides to rune ${runeNumber(tileAt(token.seat, o.move.to))}.` });

  if (o.jump?.kind === "ladder")
    lines.push({ tone: "ladder", text: `${who} ascends the ${o.jump.name}! Up to rune ${runeNumber(o.jump.to)}.` });
  if (o.jump?.kind === "snake")
    lines.push({
      tone: "snake",
      text: `${who} got bitten by ${o.jump.name}! Slid down to rune ${runeNumber(o.jump.to)}.`,
    });
  for (const v of o.captured)
    lines.push({
      tone: "capture",
      text: `Expulso! ${who} blasts ${playerBySeat(state, v.seat).name}'s serpent ${v.index + 1} back to base.`,
    });
  if (o.finished) lines.push({ tone: "finish", text: `${label} reaches the Slytherin summit!` });
  if (o.next.winner !== null) lines.push({ tone: "win", text: `${who} claims the House Cup of the Ascent!` });
  else if (o.extraTurn) lines.push({ tone: "six", text: `${who} earns another roll.` });
  return lines;
}
