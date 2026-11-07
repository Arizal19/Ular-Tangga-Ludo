"use client";
/**
 * Turn state machine. Sequences pure rules (lib/rules.ts) with dice timing,
 * token animations, AI think-time and SFX. No rendering here.
 *
 *   setup → await-roll → rolling → (choosing) → moving → await-roll … → over
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FINISH, type Vec3, baseSlot, summitSlot, tileAt, tilePosition } from "@/lib/board";
import { ladderPoints, samplePoints, snakeCurve } from "@/lib/geometry";
import {
  type GameState,
  type LogEntry,
  type Move,
  type MoveOutcome,
  type PlayerConfig,
  chooseAIMove,
  createGame,
  currentPlayer,
  describeOutcome,
  isThirdSix,
  legalMoves,
  nextTurn,
  resolveMove,
} from "@/lib/rules";
import type { SfxName } from "./useSfx";

export type Phase = "setup" | "await-roll" | "rolling" | "choosing" | "moving" | "over";

export interface Waypoint {
  pos: Vec3;
  /** Seconds to reach this point from the previous one. */
  duration: number;
  /** "hop" arcs between tiles; "glide" follows a snake/ladder curve. */
  mode: "hop" | "glide";
  /** SFX fired when the token reaches this waypoint. */
  sfx?: SfxName;
}

export interface TokenAnimation {
  /** Unique per move, so a re-sent snapshot never restarts the same animation. */
  id: number;
  tokenId: string;
  waypoints: Waypoint[];
  /** Kind of magic trail to show while moving. */
  trail: "walk" | "ladder" | "snake";
}

export interface DiceState {
  value: number | null;
  rolling: boolean;
}

const ROLL_TIME = 950;
const AI_THINK = 700;
const AI_ROLL_DELAY = 850;
const PASS_DELAY = 1100;
const LOG_LIMIT = 60;

/** Convert a resolved move into the waypoint list the Token component plays. */
function buildWaypoints(o: MoveOutcome, seat: PlayerConfig["seat"], tokenIndex: number): Waypoint[] {
  const wps: Waypoint[] = [];
  if (o.move.from === 0) {
    // SFX TRIGGER: token leaves base.
    wps.push({ pos: tilePosition(o.steps[0]), duration: 0.55, mode: "hop", sfx: "enter" });
  } else {
    // SFX TRIGGER: a soft tap per tile.
    o.steps.forEach((tile) => wps.push({ pos: tilePosition(tile), duration: 0.24, mode: "hop", sfx: "step" }));
  }
  if (o.jump?.kind === "ladder") {
    const pts = ladderPoints(o.jump, 14);
    // SFX TRIGGER: silver chime as the climb begins.
    pts.forEach((pos, i) => wps.push({ pos, duration: 0.06, mode: "glide", sfx: i === 0 ? "ladder" : undefined }));
    wps.push({ pos: tilePosition(o.jump.to), duration: 0.25, mode: "hop" });
  }
  if (o.jump?.kind === "snake") {
    const pts = samplePoints(snakeCurve(o.jump), 28);
    // SFX TRIGGER: Parseltongue hiss when the bite lands.
    pts.forEach((pos, i) => wps.push({ pos, duration: 0.045, mode: "glide", sfx: i === 0 ? "snake" : undefined }));
  }
  // SFX TRIGGER: Protego charm absorbs a snake bite — the token hops in place.
  if (o.blocked) wps.push({ pos: tilePosition(o.blocked.from), duration: 0.35, mode: "hop", sfx: "fizzle" });
  if (o.spell) {
    const to = tilePosition(tileAt(seat, o.spell.to));
    // SFX TRIGGER: rune spells. Portkey/Confundo move the token; Felix/Protego are a celebratory hop.
    if (o.spell.kind === "portkey") wps.push({ pos: to, duration: 0.75, mode: "hop", sfx: "ladder" });
    else if (o.spell.kind === "confundo") wps.push({ pos: to, duration: 0.55, mode: "hop", sfx: "fizzle" });
    else wps.push({ pos: to, duration: 0.35, mode: "hop", sfx: o.spell.kind === "felix" ? "six" : "enter" });
  }
  if (o.finalProgress === FINISH) {
    // SFX TRIGGER: ascension bell as the token floats up to the crest.
    wps.push({ pos: summitSlot(seat, tokenIndex), duration: 0.9, mode: "hop", sfx: "finish" });
  }
  return wps;
}

export function useGameEngine(play: (s: SfxName) => void) {
  const [game, setGame] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [dice, setDice] = useState<DiceState>({ value: null, rolling: false });
  const [moves, setMoves] = useState<Move[]>([]);
  const [animation, setAnimation] = useState<TokenAnimation | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Refs mirror state so timer callbacks never read stale closures.
  const gameRef = useRef<GameState | null>(null);
  const phaseRef = useRef<Phase>("setup");
  const rollRef = useRef(0);
  const movesRef = useRef<Move[]>([]);
  const pendingRef = useRef<MoveOutcome | null>(null);
  const animIdRef = useRef(0);
  const doneRef = useRef<(id: number) => void>(() => {});
  const logId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const commitGame = (g: GameState | null) => {
    gameRef.current = g;
    setGame(g);
  };
  const commitPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };
  const pushLog = useCallback((entries: Omit<LogEntry, "id">[]) => {
    setLog((prev) => [...entries.map((e) => ({ ...e, id: ++logId.current })).reverse(), ...prev].slice(0, LOG_LIMIT));
  }, []);

  useEffect(() => clearTimers, []);

  /** Hand the turn on (or keep it on an extra turn) and wait for the next roll. */
  const advance = useCallback((g: GameState) => {
    commitGame(g);
    setMoves([]);
    movesRef.current = [];
    commitPhase("await-roll");
  }, []);

  const executeMove = useCallback(
    (move: Move) => {
      const g = gameRef.current;
      if (!g) return;
      const outcome = resolveMove(g, move, rollRef.current);
      const token = g.tokens.find((t) => t.id === move.tokenId)!;
      pendingRef.current = outcome;
      setMoves([]);
      movesRef.current = [];
      commitPhase("moving");
      const id = ++animIdRef.current;
      const waypoints = buildWaypoints(outcome, token.seat, token.index);
      setAnimation({ id, tokenId: move.tokenId, waypoints, trail: outcome.jump?.kind ?? "walk" });
      // Fallback: if the tab is hidden (phone locked, app switched) requestAnimationFrame
      // stops and the token never reports back — commit anyway so the room keeps going.
      const totalMs = waypoints.reduce((acc, w) => acc + w.duration, 0) * 1000;
      later(() => doneRef.current(id), totalMs + 2500);
    },
    [],
  );

  /** Called by the Token component (or the fallback timer) when animation `id` ends. */
  const onAnimationDone = useCallback((id: number) => {
    const g = gameRef.current;
    const o = pendingRef.current;
    if (!g || !o || id !== animIdRef.current) return; // stale or already committed
    pendingRef.current = null;
    pushLog(describeOutcome(g, o));
    // SFX TRIGGER: takeover boom / victory fanfare after the token settles.
    if (o.captured.length) play("capture");
    setAnimation(null);
    if (o.next.winner !== null) {
      play("win");
      commitGame(o.next);
      commitPhase("over");
      return;
    }
    advance(nextTurn(o.next, o.extraTurn, rollRef.current === 6));
  }, [advance, play, pushLog]);
  useEffect(() => {
    doneRef.current = onAnimationDone;
  }, [onAnimationDone]);

  const afterRoll = useCallback(
    (roll: number) => {
      const g = gameRef.current;
      if (!g) return;
      const player = currentPlayer(g);
      pushLog([{ tone: roll === 6 ? "six" : "info", text: `${player.name} rolls a ${roll}.` }]);
      if (roll === 6) play("six");

      if (isThirdSix(g, roll)) {
        // SFX TRIGGER: fizzled spell.
        play("fizzle");
        pushLog([{ tone: "warn", text: `Three sixes! The Ministry confiscates ${player.name}'s wand — turn lost.` }]);
        later(() => advance(nextTurn(g, false, false)), PASS_DELAY);
        return;
      }

      const legal = legalMoves(g, player.seat, roll);
      if (legal.length === 0) {
        play("fizzle");
        pushLog([{ tone: "warn", text: `No serpent of ${player.name} can move.` }]);
        later(() => advance(nextTurn(g, roll === 6, roll === 6)), PASS_DELAY);
        return;
      }
      if (player.isAI) {
        later(() => executeMove(chooseAIMove(g, legal, roll)), AI_THINK);
      } else if (legal.length === 1) {
        later(() => executeMove(legal[0]), 350);
      } else {
        movesRef.current = legal;
        setMoves(legal);
        commitPhase("choosing");
      }
    },
    [advance, executeMove, play, pushLog],
  );

  const roll = useCallback(() => {
    if (phaseRef.current !== "await-roll" || !gameRef.current) return;
    commitPhase("rolling");
    const value = 1 + Math.floor(Math.random() * 6);
    rollRef.current = value;
    setDice({ value: null, rolling: true });
    // SFX TRIGGER: crystal die rattle.
    play("dice");
    later(() => {
      setDice({ value, rolling: false });
      afterRoll(value);
    }, ROLL_TIME);
  }, [afterRoll, play]);

  /** Human picks which serpent to move. */
  const selectToken = useCallback(
    (tokenId: string) => {
      if (phaseRef.current !== "choosing") return;
      const move = movesRef.current.find((m) => m.tokenId === tokenId);
      if (move) executeMove(move);
    },
    [executeMove],
  );

  const start = useCallback(
    (players: PlayerConfig[]) => {
      clearTimers();
      pendingRef.current = null;
      setAnimation(null);
      setDice({ value: null, rolling: false });
      setLog([]);
      const g = createGame(players);
      pushLog([
        { tone: "info", text: "The Slytherin Ascent begins. Roll a 6 to release a serpent from the dungeon." },
      ]);
      advance(g);
    },
    [advance, pushLog],
  );

  const reset = useCallback(() => {
    clearTimers();
    pendingRef.current = null;
    setAnimation(null);
    setMoves([]);
    movesRef.current = [];
    commitGame(null);
    commitPhase("setup");
  }, []);

  // AI players roll on their own.
  useEffect(() => {
    if (phase !== "await-roll" || !game || !currentPlayer(game).isAI) return;
    const id = setTimeout(roll, AI_ROLL_DELAY);
    return () => clearTimeout(id);
  }, [phase, game, roll]);

  return { game, phase, dice, moves, animation, log, roll, selectToken, start, reset, onAnimationDone };
}

/** Where a token rests when idle (base slot, tile, or summit). Stack offsets added by the scene. */
export function restPosition(seat: PlayerConfig["seat"], index: number, progress: number, tile: number | null): Vec3 {
  if (progress === 0) return baseSlot(seat, index);
  if (progress >= FINISH) return summitSlot(seat, index);
  return tilePosition(tile!);
}
