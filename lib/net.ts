/**
 * Online protocol (host-authoritative).
 *
 *   Host  = the device that created the room. It runs the game engine and the AI,
 *           and broadcasts a full snapshot after every change.
 *   Guest = the partner's device. It renders snapshots and only sends intents
 *           (roll / select). The host validates every intent against seat ownership.
 */
import type { DiceState, Phase, TokenAnimation } from "@/hooks/useGameEngine";
import type { SfxName } from "@/hooks/useSfx";
import type { GameState, LogEntry, Move, PlayerConfig } from "./rules";

export type Role = "local" | "host" | "guest";

export interface Snapshot {
  game: GameState | null;
  phase: Phase;
  dice: DiceState;
  moves: Move[];
  animation: TokenAnimation | null;
  log: LogEntry[];
}

export type HostMessage =
  | { t: "state"; s: Snapshot }
  | { t: "lobby"; players: PlayerConfig[] }
  | { t: "sfx"; name: SfxName }
  | { t: "pong"; ts: number };

export type GuestMessage = { t: "roll" } | { t: "select"; tokenId: string } | { t: "ping"; ts: number };

/** Does this device control `player`'s turn? */
export function controls(role: Role, player: PlayerConfig): boolean {
  if (player.isAI) return false;
  if (role === "local") return true;
  return (player.owner ?? "host") === role;
}

/** Room codes avoid look-alike letters (no I/O/0/1). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const newRoomCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);

/** PeerJS ids are global on the public broker, so namespace them. */
export const peerIdFor = (code: string) => `slytherin-ascent-${code}`;
