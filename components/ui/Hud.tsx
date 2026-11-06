"use client";
/** In-game overlay: player roster, action bar, spell log, rules, victory banner. */
import { useState } from "react";
import { FINISH, LAP_LENGTH, runeNumber, tileAt } from "@/lib/board";
import type { GameState, LogEntry, LogTone, Move } from "@/lib/rules";
import { SEAT_THEME } from "@/lib/theme";
import type { DiceState, Phase } from "@/hooks/useGameEngine";

const TONE_CLASS: Record<LogTone, string> = {
  info: "text-silver/75",
  six: "text-emerald-300",
  ladder: "text-slate-100 font-semibold",
  snake: "text-lime-300 font-semibold",
  capture: "text-rose-300 font-semibold",
  finish: "text-emerald-200 font-semibold",
  win: "text-yellow-200 font-bold",
  warn: "text-amber-300/90",
};
const TONE_ICON: Record<LogTone, string> = {
  info: "✦",
  six: "⚄",
  ladder: "⇡",
  snake: "∿",
  capture: "✸",
  finish: "♛",
  win: "🏆",
  warn: "!",
};

function progressLabel(p: number) {
  if (p === 0) return "Dungeon";
  if (p >= FINISH) return "Summit";
  return p <= LAP_LENGTH ? `Lap ${p}/${LAP_LENGTH}` : `Ascent ${p}/${FINISH}`;
}

function Portrait({ character, color, size = 44 }: { character: string; color: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/characters/${character}.jpg`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border-2 object-cover"
      style={{ borderColor: color, width: size, height: size }}
    />
  );
}

export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <section aria-label="Spell log" className="flex min-h-0 flex-1 flex-col rounded-xl border border-silver/15 bg-black/55 backdrop-blur-md">
      <h2 className="border-b border-silver/10 px-3 py-2 font-display text-xs uppercase tracking-[0.3em] text-emerald-glow/80">Spell Log</h2>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[13px] leading-snug" aria-live="polite">
        {log.map((e) => (
          <li key={e.id} className={`flex gap-2 ${TONE_CLASS[e.tone]}`}>
            <span aria-hidden className="w-3 shrink-0 text-center opacity-70">{TONE_ICON[e.tone]}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface HudProps {
  game: GameState;
  phase: Phase;
  dice: DiceState;
  moves: Move[];
  log: LogEntry[];
  muted: boolean;
  onRoll: () => void;
  onSelectToken: (id: string) => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onNewSetup: () => void;
  /** This device controls the current turn. */
  canAct: boolean;
  /** Online partner device: the host owns restart/lobby. */
  isGuest: boolean;
  /** Online room status pill. */
  netBadge?: React.ReactNode;
}

export function Hud(props: HudProps) {
  const { game, phase, dice, moves, log, muted, onRoll, onSelectToken, onToggleMute, onRestart, onNewSetup, canAct, isGuest, netBadge } = props;
  const [showRules, setShowRules] = useState(false);
  const current = game.players[game.turn];
  const theme = SEAT_THEME[current.seat];
  const winner = game.winner !== null ? game.players.find((p) => p.seat === game.winner)! : null;

  let action: React.ReactNode;
  if (phase === "await-roll" && canAct) {
    action = (
      <button
        onClick={onRoll}
        className="rounded-xl border border-emerald-glow/80 bg-gradient-to-b from-emerald-500 to-emerald-900 px-8 py-3 font-display text-lg font-bold tracking-wider text-white shadow-[0_0_28px_rgba(16,185,129,0.55)] transition hover:brightness-110 active:scale-95"
      >
        Cast the Die <span className="ml-1 text-xs font-normal opacity-70 max-md:hidden">(Space)</span>
      </button>
    );
  } else if (phase === "choosing" && canAct) {
    action = (
      <div className="flex flex-col items-center gap-2">
        <p className="font-display text-sm text-silver">Choose a serpent to move {dice.value}:</p>
        <div className="flex gap-2">
          {moves.map((m) => {
            const t = game.tokens.find((x) => x.id === m.tokenId)!;
            return (
              <button
                key={m.tokenId}
                onClick={() => onSelectToken(m.tokenId)}
                className="rounded-lg border bg-black/60 px-4 py-2 text-sm text-silver transition hover:bg-emerald-900/70"
                style={{ borderColor: theme.color }}
              >
                <span className="font-display">Serpent {t.index + 1}</span>{" "}
                <span className="text-xs opacity-75">
                  {m.from === 0 ? "leave dungeon" : `→ rune ${runeNumber(tileAt(t.seat, m.to))}`}
                </span>
                <kbd className="ml-2 rounded border border-silver/30 px-1 text-[10px] opacity-60">{t.index + 1}</kbd>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else {
    const text =
      phase === "rolling"
        ? "The crystal tumbles…"
        : phase === "moving"
          ? "The serpent slithers…"
          : phase === "choosing"
            ? `${current.name} is choosing a serpent…`
            : current.isAI
              ? `${current.name} is plotting…`
              : `Waiting for ${current.name} to cast the die…`;
    action = <p className="font-display text-base italic text-silver/80">{text}</p>;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      {/* Title + controls */}
      <header className="pointer-events-auto flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-silver drop-shadow-[0_0_10px_rgba(52,211,153,0.7)] sm:text-2xl">Slytherin Ascent</h1>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-glow/70 max-sm:hidden">Ludo × Snakes &amp; Ladders</p>
          {netBadge}
        </div>
        <nav className="flex flex-wrap justify-end gap-1.5 text-xs" aria-label="Game controls">
          {[
            { label: muted ? "Unmute" : "Mute", onClick: onToggleMute },
            { label: "Rules", onClick: () => setShowRules((v) => !v) },
            ...(isGuest ? [] : [{ label: "Restart", onClick: onRestart }]),
            { label: isGuest ? "Leave" : "Lobby", onClick: onNewSetup },
          ].map((b) => (
            <button key={b.label} onClick={b.onClick} className="min-h-9 rounded-md border border-silver/25 bg-black/50 px-2.5 py-1.5 font-display text-silver/80 backdrop-blur hover:border-emerald-glow hover:text-silver">
              {b.label}
            </button>
          ))}
        </nav>
      </header>

      {showRules && (
        <aside className="pointer-events-auto mt-3 max-w-sm rounded-xl border border-silver/20 bg-black/75 p-4 text-[13px] leading-relaxed text-silver/85 backdrop-blur-md">
          <h2 className="mb-1 font-display text-sm text-emerald-glow">Rules of the Ascent</h2>
          <ul className="list-disc space-y-1 pl-4">
            <li>Roll a 6 to release a serpent from your corner dungeon.</li>
            <li>Runes 1–{LAP_LENGTH}: the outer Ludo lap. Each step inward raises a level of the ziggurat.</li>
            <li>Silver staircases lift you; Basilisk &amp; Serpensortia bite you back down.</li>
            <li>Land on a rival (not on a ringed Protego tile) to blast them home.</li>
            <li>A 6, a capture or reaching the summit grants another roll. Three 6s in a row forfeits the turn.</li>
            <li>Exact roll needed for the summit. Both serpents up = victory.</li>
          </ul>
        </aside>
      )}

      {/* Compact roster for phones */}
      <ul className="pointer-events-auto mt-2 flex justify-center gap-2 md:hidden" aria-label="Players">
        {game.players.map((p) => {
          const th = SEAT_THEME[p.seat];
          const active = p.seat === current.seat && !winner;
          return (
            <li
              key={p.seat}
              className={`flex items-center gap-1.5 rounded-full border bg-black/60 py-0.5 pl-0.5 pr-2 backdrop-blur ${active ? "" : "opacity-70"}`}
              style={{ borderColor: active ? th.color : "rgba(217,222,230,0.15)", boxShadow: active ? `0 0 14px ${th.color}88` : undefined }}
            >
              <Portrait character={p.character} color={th.color} size={26} />
              <span className="text-[10px] leading-tight text-silver/80">
                {game.tokens
                  .filter((t) => t.seat === p.seat)
                  .map((t) => (t.progress === 0 ? "—" : t.progress >= FINISH ? "★" : t.progress))
                  .join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-0 flex-1 justify-end gap-3 pt-3">
        {/* Roster + log */}
        <div className="pointer-events-auto flex max-h-full w-full max-w-[19rem] flex-col gap-2 max-md:hidden">
          {game.players.map((p) => {
            const th = SEAT_THEME[p.seat];
            const active = p.seat === current.seat && !winner;
            return (
              <div
                key={p.seat}
                className={`flex items-center gap-3 rounded-xl border bg-black/55 p-2.5 backdrop-blur-md transition ${active ? "scale-[1.02]" : "opacity-80"}`}
                style={{ borderColor: active ? th.color : "rgba(217,222,230,0.15)", boxShadow: active ? `0 0 22px ${th.color}66` : undefined }}
              >
                <Portrait character={p.character} color={th.color} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-display text-sm text-silver">
                    <span className="truncate">{p.name}</span>
                    <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase tracking-wider text-silver/60">{p.isAI ? "AI" : p.owner === "guest" ? "Partner" : "Human"}</span>
                  </p>
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: th.color }}>{th.house}</p>
                  <div className="mt-1 flex gap-1.5">
                    {game.tokens
                      .filter((t) => t.seat === p.seat)
                      .map((t) => (
                        <span key={t.id} className="flex-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-silver/75">
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: th.color }} />
                          {progressLabel(t.progress)}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
          <LogPanel log={log} />
        </div>
      </div>

      {/* Action bar */}
      <footer className="pointer-events-auto mx-auto mt-2 flex flex-col items-center gap-2 rounded-2xl border border-silver/15 bg-black/55 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Portrait character={current.character} color={theme.color} size={34} />
          <p className="font-display text-sm" style={{ color: theme.color }}>
            {current.name}&apos;s turn
            {dice.value && !dice.rolling && <span className="ml-2 text-silver">· rolled {dice.value}</span>}
          </p>
        </div>
        {!winner && action}
        <p className="max-w-xs truncate text-center text-xs text-silver/60 md:hidden">{log[0]?.text}</p>
      </footer>

      {winner && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 rounded-2xl border border-emerald-glow/60 bg-gradient-to-b from-[#0b1a13] to-obsidian p-6 text-center sm:p-8 shadow-[0_0_80px_rgba(52,211,153,0.4)]">
            <div className="flex justify-center">
              <Portrait character={winner.character} color={SEAT_THEME[winner.seat].color} size={96} />
            </div>
            <p className="mt-4 font-display text-xs uppercase tracking-[0.4em] text-emerald-glow">Victory</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-silver sm:text-3xl">{winner.name} conquers the Ascent</h2>
            <div className="mt-6 flex justify-center gap-3">
              {isGuest ? (
                <p className="text-sm text-silver/70">The host can start a new game.</p>
              ) : (
              <button onClick={onRestart} className="rounded-lg border border-emerald-glow bg-emerald-800 px-5 py-2 font-display text-white hover:brightness-110">
                Play again
              </button>
              )}
              <button onClick={onNewSetup} className="rounded-lg border border-silver/30 px-5 py-2 font-display text-silver hover:border-silver">
                {isGuest ? "Leave" : "Lobby"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
