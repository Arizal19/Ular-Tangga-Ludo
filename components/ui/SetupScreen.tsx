"use client";
/** Pre-game lobby: player count, character portraits, human/AI per seat. */
import { useState } from "react";
import type { Seat } from "@/lib/board";
import { type PlayerConfig, seatsFor } from "@/lib/rules";
import { CHARACTERS, SEAT_THEME, characterName } from "@/lib/theme";

type SeatChoice = { character: string; isAI: boolean };
const DEFAULTS: Record<Seat, SeatChoice> = {
  0: { character: "draco", isAI: false },
  1: { character: "snape", isAI: true },
  2: { character: "bellatrix", isAI: true },
  3: { character: "voldemort", isAI: true },
};

export function SetupScreen({ onStart }: { onStart: (players: PlayerConfig[]) => void }) {
  const [count, setCount] = useState(4);
  const [choices, setChoices] = useState(DEFAULTS);
  const seats = seatsFor(count);
  const update = (seat: Seat, patch: Partial<SeatChoice>) => setChoices((c) => ({ ...c, [seat]: { ...c[seat], ...patch } }));

  const start = () =>
    onStart(
      seats.map((seat) => ({
        seat,
        character: choices[seat].character,
        name: characterName(choices[seat].character),
        isAI: choices[seat].isAI,
      })),
    );

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-obsidian/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-2xl border border-silver/30 bg-gradient-to-b from-[#0b1a13]/95 to-obsidian/95 p-6 shadow-[0_0_60px_rgba(16,185,129,0.25)] sm:p-8">
        <p className="text-center font-display text-xs uppercase tracking-[0.4em] text-emerald-glow/80">Ludo × Snakes &amp; Ladders</p>
        <h1 className="mt-1 text-center font-display text-4xl font-bold text-silver drop-shadow-[0_0_12px_rgba(52,211,153,0.6)] sm:text-5xl">
          Slytherin Ascent
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-relaxed text-silver/70">
          Free your two serpents from the dungeon with a 6, complete the outer lap, then climb the emerald ziggurat to the
          crest. Silver staircases lift you; serpents bite you back down. Land on a rival to blast them home.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2" role="radiogroup" aria-label="Number of players">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={`rounded-lg border px-5 py-2 font-display text-sm transition ${
                count === n
                  ? "border-emerald-glow bg-emerald-900/60 text-silver shadow-[0_0_16px_rgba(52,211,153,0.5)]"
                  : "border-silver/20 text-silver/60 hover:border-silver/50"
              }`}
            >
              {n} Players
            </button>
          ))}
        </div>

        <ul className="mt-6 space-y-3">
          {seats.map((seat, i) => {
            const theme = SEAT_THEME[seat];
            const choice = choices[seat];
            return (
              <li key={seat} className="flex items-center gap-3 rounded-xl border border-silver/15 bg-black/30 p-3" style={{ boxShadow: `inset 3px 0 0 ${theme.color}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/characters/${choice.character}.jpg`}
                  alt={characterName(choice.character)}
                  className="h-14 w-14 rounded-full border-2 object-cover"
                  style={{ borderColor: theme.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[11px] uppercase tracking-widest" style={{ color: theme.color }}>
                    Player {i + 1} · {theme.house}
                  </p>
                  <select
                    aria-label={`Player ${i + 1} character`}
                    value={choice.character}
                    onChange={(e) => update(seat, { character: e.target.value })}
                    className="mt-1 w-full rounded-md border border-silver/20 bg-obsidian-800 px-2 py-1.5 text-sm text-silver focus:border-emerald-glow focus:outline-none"
                  >
                    {CHARACTERS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex overflow-hidden rounded-md border border-silver/20 text-xs font-display" role="radiogroup" aria-label={`Player ${i + 1} control`}>
                  {(["Human", "AI"] as const).map((mode) => {
                    const on = (mode === "AI") === choice.isAI;
                    return (
                      <button
                        key={mode}
                        role="radio"
                        aria-checked={on}
                        onClick={() => update(seat, { isAI: mode === "AI" })}
                        className={`px-3 py-2 transition ${on ? "bg-emerald-800 text-silver" : "text-silver/50 hover:text-silver"}`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          onClick={start}
          className="mt-7 w-full rounded-xl border border-emerald-glow/70 bg-gradient-to-b from-emerald-600 to-emerald-900 py-3 font-display text-lg font-bold tracking-wider text-white shadow-[0_0_30px_rgba(16,185,129,0.45)] transition hover:brightness-110 active:scale-[0.99]"
        >
          Begin the Ascent
        </button>
      </div>
    </div>
  );
}
