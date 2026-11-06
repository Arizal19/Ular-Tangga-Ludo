"use client";
/**
 * Pre-game lobby.
 *   Same device: 2–4 seats, each Human or AI, pass the device around.
 *   Online:      the host creates a 4-letter room, shares a link, and marks which
 *                seats the partner plays from their own phone/tablet.
 */
import { useEffect, useMemo, useState } from "react";
import type { Seat } from "@/lib/board";
import { type PlayerConfig, seatsFor } from "@/lib/rules";
import { normalizeCode } from "@/lib/net";
import { CHARACTERS, SEAT_THEME, characterName } from "@/lib/theme";
import type { Online } from "@/hooks/useOnline";

type Control = "human" | "partner" | "ai";
type SeatChoice = { character: string; control: Control };

const DEFAULTS: Record<Seat, SeatChoice> = {
  0: { character: "draco", control: "human" },
  1: { character: "snape", control: "ai" },
  2: { character: "bellatrix", control: "ai" },
  3: { character: "voldemort", control: "ai" },
};

const CONTROL_LABEL: Record<Control, string> = { human: "Me", partner: "Partner", ai: "AI" };

interface Props {
  net: Online;
  onStart: (players: PlayerConfig[]) => void;
  /** Host: lobby changed, mirror it to the partner. */
  onLobbyChange: (players: PlayerConfig[]) => void;
  /** Guest: lobby as configured by the host. */
  remoteLobby: PlayerConfig[] | null;
  /** Room code from a shared ?room= link. */
  initialRoom: string;
  /** Last game's seats, so returning to the lobby keeps the setup. */
  initialPlayers: PlayerConfig[];
}

function choicesFrom(players: PlayerConfig[]): Record<Seat, SeatChoice> {
  const out = { ...DEFAULTS };
  for (const p of players) out[p.seat] = { character: p.character, control: p.isAI ? "ai" : p.owner === "guest" ? "partner" : "human" };
  return out;
}

const card = "rounded-2xl border border-silver/30 bg-gradient-to-b from-[#0b1a13]/95 to-obsidian/95 shadow-[0_0_60px_rgba(16,185,129,0.25)]";
const primaryBtn =
  "w-full rounded-xl border border-emerald-glow/70 bg-gradient-to-b from-emerald-600 to-emerald-900 py-3 font-display text-lg font-bold tracking-wider text-white shadow-[0_0_30px_rgba(16,185,129,0.45)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40";
const ghostBtn = "rounded-lg border border-silver/25 px-4 py-2 font-display text-sm text-silver/80 transition hover:border-emerald-glow hover:text-silver";

function Avatar({ character, color, size = 56 }: { character: string; color: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/characters/${character}.jpg`} alt={characterName(character)} className="shrink-0 rounded-full border-2 object-cover" style={{ borderColor: color, width: size, height: size }} />
  );
}

export function SetupScreen({ net, onStart, onLobbyChange, remoteLobby, initialRoom, initialPlayers }: Props) {
  const [mode, setMode] = useState<"local" | "online">(initialRoom || net.role !== "local" ? "online" : "local");
  const [count, setCount] = useState(initialPlayers.length || 4);
  const [choices, setChoices] = useState(() => choicesFrom(initialPlayers));
  const [joinCode, setJoinCode] = useState(normalizeCode(initialRoom));
  const [copied, setCopied] = useState(false);
  const seats = useMemo(() => seatsFor(count), [count]);
  const update = (seat: Seat, patch: Partial<SeatChoice>) => setChoices((c) => ({ ...c, [seat]: { ...c[seat], ...patch } }));

  const players: PlayerConfig[] = useMemo(
    () =>
      seats.map((seat) => {
        const c = choices[seat];
        const control = mode === "local" && c.control === "partner" ? "human" : c.control;
        return {
          seat,
          character: c.character,
          name: characterName(c.character),
          isAI: control === "ai",
          ...(mode === "online" && control !== "ai" ? { owner: control === "partner" ? ("guest" as const) : ("host" as const) } : {}),
        };
      }),
    [seats, choices, mode],
  );

  // Mirror the host's lobby to the partner's screen.
  useEffect(() => {
    if (net.role === "host") onLobbyChange(players);
  }, [net.role, net.status, players, onLobbyChange]);

  // A shared link joins automatically once.
  useEffect(() => {
    if (!initialRoom || net.role !== "local") return;
    window.history.replaceState(null, "", window.location.pathname); // don't auto-rejoin on reload after leaving
    void net.join(normalizeCode(initialRoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = () => {
    // Sensible online default: me vs partner, opposite corners.
    setCount(2);
    setChoices((c) => ({ ...c, 0: { ...c[0], control: "human" }, 2: { ...c[2], control: "partner" } }));
    void net.host();
  };

  const shareUrl = typeof window !== "undefined" && net.code ? `${window.location.origin}/?room=${net.code}` : "";
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Slytherin Ascent", text: `Join my room ${net.code}`, url: shareUrl });
      else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  const partnerSeats = players.filter((p) => p.owner === "guest").length;
  const partnerReady = net.status === "connected";

  // ── Partner's device: waiting room ────────────────────────────────────────
  if (net.role === "guest") {
    return (
      <Overlay>
        <div className={`${card} w-full max-w-md p-6 text-center`}>
          <Title />
          <p className="mt-5 font-display text-xs uppercase tracking-[0.35em] text-emerald-glow/80">Room</p>
          <p className="font-display text-4xl font-bold tracking-[0.3em] text-silver">{net.code}</p>
          <StatusLine status={net.status} error={net.error} role="guest" />
          {remoteLobby && net.status === "connected" && (
            <ul className="mt-5 space-y-2 text-left">
              {remoteLobby.map((p) => (
                <li key={p.seat} className="flex items-center gap-3 rounded-xl border border-silver/15 bg-black/30 p-2.5">
                  <Avatar character={p.character} color={SEAT_THEME[p.seat].color} size={40} />
                  <span className="flex-1 font-display text-sm text-silver">{p.name}</span>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wider text-silver/70">
                    {p.isAI ? "AI" : p.owner === "guest" ? "You" : "Host"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex justify-center gap-2">
            {(net.status === "disconnected" || net.status === "error") && (
              <button className={ghostBtn} onClick={() => void net.join(net.code)}>
                Reconnect
              </button>
            )}
            <button className={ghostBtn} onClick={net.leave}>
              Leave room
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className={`${card} w-full max-w-2xl p-5 sm:p-8`}>
        <Title />
        <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-relaxed text-silver/70">
          Free your two serpents from the dungeon with a 6, complete the outer lap, then climb the emerald ziggurat to the crest. Silver
          staircases lift you; serpents bite you back down. Land on a rival to blast them home.
        </p>

        {/* Mode tabs */}
        <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 rounded-xl border border-silver/20 p-1" role="tablist">
          {(["local", "online"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                if (m === "local" && net.role === "host") net.leave();
                setMode(m);
              }}
              className={`rounded-lg py-2 font-display text-sm transition ${mode === m ? "bg-emerald-800 text-white shadow-[0_0_14px_rgba(52,211,153,0.4)]" : "text-silver/60"}`}
            >
              {m === "local" ? "Same Device" : "Online"}
            </button>
          ))}
        </div>

        {mode === "online" && net.role === "local" && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-silver/15 bg-black/30 p-4">
              <h2 className="font-display text-sm text-emerald-glow">Create a room</h2>
              <p className="mt-1 text-sm text-silver/65">You host the game. Your partner joins with the code or link.</p>
              <button className={`${primaryBtn} mt-4 !text-base`} onClick={createRoom}>
                Create room
              </button>
            </div>
            <form
              className="rounded-xl border border-silver/15 bg-black/30 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (joinCode.length === 4) void net.join(joinCode);
              }}
            >
              <h2 className="font-display text-sm text-emerald-glow">Join a room</h2>
              <label htmlFor="room-code" className="mt-1 block text-sm text-silver/65">
                Enter the 4-letter code
              </label>
              <input
                id="room-code"
                value={joinCode}
                onChange={(e) => setJoinCode(normalizeCode(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABCD"
                className="mt-2 w-full rounded-lg border border-silver/25 bg-obsidian-800 px-3 py-2 text-center font-display text-2xl tracking-[0.4em] text-silver placeholder:text-silver/20 focus:border-emerald-glow focus:outline-none"
              />
              <button type="submit" disabled={joinCode.length !== 4} className={`${primaryBtn} mt-3 !text-base`}>
                Join
              </button>
            </form>
            {net.error && <p className="text-sm text-amber-300 sm:col-span-2">{net.error}</p>}
          </div>
        )}

        {mode === "online" && net.role === "host" && (
          <div className="mt-6 rounded-xl border border-emerald-glow/30 bg-black/30 p-4 text-center">
            <p className="font-display text-xs uppercase tracking-[0.35em] text-emerald-glow/80">Your room</p>
            <p className="font-display text-4xl font-bold tracking-[0.3em] text-silver">{net.code || "····"}</p>
            <StatusLine status={net.status} error={net.error} role="host" />
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button className={ghostBtn} onClick={share} disabled={!net.code}>
                {copied ? "Link copied" : "Share link"}
              </button>
              <button className={ghostBtn} onClick={net.leave}>
                Close room
              </button>
            </div>
          </div>
        )}

        {(mode === "local" || net.role === "host") && (
          <>
            <div className="mt-6 flex items-center justify-center gap-2" role="radiogroup" aria-label="Number of players">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={count === n}
                  onClick={() => setCount(n)}
                  className={`rounded-lg border px-4 py-2 font-display text-sm transition sm:px-5 ${
                    count === n
                      ? "border-emerald-glow bg-emerald-900/60 text-silver shadow-[0_0_16px_rgba(52,211,153,0.5)]"
                      : "border-silver/20 text-silver/60 hover:border-silver/50"
                  }`}
                >
                  {n} Players
                </button>
              ))}
            </div>

            <ul className="mt-5 space-y-3">
              {seats.map((seat, i) => {
                const theme = SEAT_THEME[seat];
                const choice = choices[seat];
                const options: Control[] = mode === "online" ? ["human", "partner", "ai"] : ["human", "ai"];
                const control = mode === "local" && choice.control === "partner" ? "human" : choice.control;
                return (
                  <li key={seat} className="flex flex-wrap items-center gap-3 rounded-xl border border-silver/15 bg-black/30 p-3" style={{ boxShadow: `inset 3px 0 0 ${theme.color}` }}>
                    <Avatar character={choice.character} color={theme.color} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[11px] uppercase tracking-widest" style={{ color: theme.color }}>
                        Player {i + 1} · {theme.house}
                      </p>
                      <select
                        aria-label={`Player ${i + 1} character`}
                        value={choice.character}
                        onChange={(e) => update(seat, { character: e.target.value })}
                        className="mt-1 w-full rounded-md border border-silver/20 bg-obsidian-800 px-2 py-2 text-base text-silver focus:border-emerald-glow focus:outline-none sm:text-sm"
                      >
                        {CHARACTERS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex overflow-hidden rounded-md border border-silver/20 font-display text-xs max-sm:w-full" role="radiogroup" aria-label={`Player ${i + 1} control`}>
                      {options.map((o) => (
                        <button
                          key={o}
                          role="radio"
                          aria-checked={control === o}
                          onClick={() => update(seat, { control: o })}
                          className={`flex-1 px-3 py-2.5 transition ${control === o ? "bg-emerald-800 text-silver" : "text-silver/50 hover:text-silver"}`}
                        >
                          {mode === "local" && o === "human" ? "Human" : CONTROL_LABEL[o]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>

            {mode === "online" && partnerSeats === 0 && (
              <p className="mt-3 text-center text-sm text-amber-300/90">Mark at least one seat as “Partner” for your partner to play.</p>
            )}
            <button
              onClick={() => onStart(players)}
              disabled={mode === "online" && (!net.code || (partnerSeats > 0 && !partnerReady))}
              className={`${primaryBtn} mt-6`}
            >
              {mode === "online" && partnerSeats > 0 && !partnerReady ? "Waiting for partner…" : "Begin the Ascent"}
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-obsidian/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[2px] sm:items-center">
      {children}
    </div>
  );
}

function Title() {
  return (
    <>
      <p className="text-center font-display text-xs uppercase tracking-[0.4em] text-emerald-glow/80">Ludo × Snakes &amp; Ladders</p>
      <h1 className="mt-1 text-center font-display text-4xl font-bold text-silver drop-shadow-[0_0_12px_rgba(52,211,153,0.6)] sm:text-5xl">Slytherin Ascent</h1>
    </>
  );
}

function StatusLine({ status, error, role }: { status: Online["status"]; error: string; role: "host" | "guest" }) {
  const text: Record<Online["status"], string> = {
    idle: "",
    opening: "Opening the room…",
    waiting: role === "host" ? "Waiting for your partner to join…" : "Connecting…",
    joining: "Joining…",
    connected: role === "host" ? "Partner connected ✓" : "Connected ✓ Waiting for the host to start…",
    disconnected: "Connection lost.",
    error,
  };
  const ok = status === "connected";
  return (
    <p className={`mt-2 text-sm ${status === "error" || status === "disconnected" ? "text-amber-300" : ok ? "text-emerald-300" : "text-silver/70"}`} aria-live="polite">
      {text[status]}
    </p>
  );
}
