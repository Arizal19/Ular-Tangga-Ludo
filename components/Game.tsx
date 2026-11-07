"use client";
/**
 * Client root. Wires the engine, SFX and the online room to the 3D scene + HUD.
 *
 *   local / host → the engine on this device is the source of truth.
 *   guest        → renders the host's latest snapshot; clicks become intents.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useOnline } from "@/hooks/useOnline";
import { type SfxName, useSfx } from "@/hooks/useSfx";
import { NEXT_QUALITY, type QualityMode, loadQuality, saveQuality } from "@/lib/quality";
import { type GuestMessage, type HostMessage, type Snapshot, controls } from "@/lib/net";
import type { PlayerConfig } from "@/lib/rules";
import { Scene } from "./scene/Scene";
import { Hud } from "./ui/Hud";
import { IntroSplash } from "./ui/IntroSplash";
import { SetupScreen } from "./ui/SetupScreen";

const SFX_NAMES = new Set<SfxName>(["dice", "step", "enter", "ladder", "snake", "capture", "finish", "win", "six", "fizzle"]);
const noop = () => {};

export default function Game() {
  const sfx = useSfx();
  const lastPlayers = useRef<PlayerConfig[]>([]);
  const [remote, setRemote] = useState<Snapshot | null>(null);
  const [remoteLobby, setRemoteLobby] = useState<PlayerConfig[] | null>(null);
  const [initialRoom] = useState(() => new URLSearchParams(window.location.search).get("room") ?? "");
  // Opening motion graphic (once per session). A partner opening an invite link skips it to join fast.
  const [noGpu, setNoGpu] = useState(false);
  const [quality, setQuality] = useState<QualityMode>("auto");
  useEffect(() => setQuality(loadQuality()), []);
  const cycleQuality = () =>
    setQuality((q) => {
      const next = NEXT_QUALITY[q];
      saveQuality(next);
      return next;
    });
  const [rtt, setRtt] = useState<number | null>(null);
  const lastPong = useRef(0);
  const [introDone, setIntroDone] = useState(() => !!new URLSearchParams(window.location.search).get("room"));

  // Refs let network callbacks see the latest engine/role without re-subscribing.
  const engineRef = useRef<ReturnType<typeof useGameEngine> | null>(null);
  const roleRef = useRef<"local" | "host" | "guest">("local");
  const snapshotRef = useRef<Snapshot | null>(null);
  const lobbyRef = useRef<PlayerConfig[] | null>(null);
  const sendRef = useRef<(m: HostMessage | GuestMessage) => void>(noop);

  const onMessage = useCallback(
    (msg: HostMessage | GuestMessage) => {
      if (roleRef.current === "guest") {
        if (msg.t === "pong" && typeof msg.ts === "number") {
          lastPong.current = Date.now();
          setRtt(Date.now() - msg.ts);
        } else if (msg.t === "state") setRemote(msg.s);
        else if (msg.t === "lobby") setRemoteLobby(msg.players);
        else if (msg.t === "sfx" && SFX_NAMES.has(msg.name)) sfx.play(msg.name);
        return;
      }
      // Host: answer heartbeats first, then accept intents only for seats the partner owns.
      if (msg.t === "ping" && typeof msg.ts === "number") {
        sendRef.current({ t: "pong", ts: msg.ts });
        return;
      }
      const engine = engineRef.current;
      const current = engine?.game?.players[engine.game.turn];
      if (!engine || !current || !controls("guest", current)) return;
      if (msg.t === "roll") engine.roll();
      else if (msg.t === "select" && typeof msg.tokenId === "string") engine.selectToken(msg.tokenId);
    },
    [sfx],
  );

  const onGuestJoined = useCallback(() => {
    if (lobbyRef.current) sendRef.current({ t: "lobby", players: lobbyRef.current });
    if (snapshotRef.current) sendRef.current({ t: "state", s: snapshotRef.current });
  }, []);

  const net = useOnline({ onMessage, onGuestJoined });
  const role = net.role;

  // Guest heartbeat: measures latency and revives a silently dead link (common when a phone sleeps).
  useEffect(() => {
    if (role !== "guest" || net.status !== "connected") return;
    lastPong.current = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - lastPong.current > 12000) void net.join(net.code);
      else net.send({ t: "ping", ts: Date.now() });
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, net.status, net.code, net.send]);

  // SFX TRIGGER: engine sounds play here and are mirrored to the partner's device.
  const playAndMirror = useCallback(
    (name: SfxName) => {
      sfx.play(name);
      if (roleRef.current === "host") sendRef.current({ t: "sfx", name });
    },
    [sfx],
  );
  const engine = useGameEngine(playAndMirror);

  useEffect(() => {
    engineRef.current = engine;
    roleRef.current = role;
    sendRef.current = net.send;
  });

  // Host: broadcast a full snapshot whenever anything visible changes.
  const { game, phase, dice, moves, animation, log } = engine;
  useEffect(() => {
    const s: Snapshot = { game, phase, dice, moves, animation, log };
    snapshotRef.current = s;
    if (role === "host") net.send({ t: "state", s });
  }, [role, game, phase, dice, moves, animation, log, net.send]);

  // Leaving a room clears whatever the partner's view held.
  useEffect(() => {
    if (role !== "guest") {
      setRemote(null);
      setRemoteLobby(null);
    }
  }, [role]);

  const onLobbyChange = useCallback(
    (players: PlayerConfig[]) => {
      lobbyRef.current = players;
      net.send({ t: "lobby", players });
    },
    [net.send],
  );

  const isGuest = role === "guest";
  const view: Snapshot = isGuest
    ? remote ?? { game: null, phase: "setup", dice: { value: null, rolling: false }, moves: [], animation: null, log: [] }
    : { game, phase, dice, moves, animation, log };
  const current = view.game?.players[view.game.turn];
  const canAct = !!current && controls(role, current);

  const roll = useCallback(() => (isGuest ? net.send({ t: "roll" }) : engine.roll()), [isGuest, net, engine]);
  const selectToken = useCallback(
    (tokenId: string) => (isGuest ? net.send({ t: "select", tokenId }) : engine.selectToken(tokenId)),
    [isGuest, net, engine],
  );
  const begin = (players: PlayerConfig[]) => {
    lastPlayers.current = players;
    engine.start(players);
  };
  const toLobby = () => (isGuest ? net.leave() : engine.reset());

  // Keyboard: Space/Enter rolls, 1/2 picks a serpent — only on your own turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!view.game || !canAct || (e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if ((e.code === "Space" || e.code === "Enter") && view.phase === "await-roll") {
        e.preventDefault();
        roll();
      }
      if (view.phase === "choosing" && (e.key === "1" || e.key === "2")) {
        const m = view.moves.find((mv) => mv.tokenId.endsWith(`-${Number(e.key) - 1}`));
        if (m) selectToken(m.tokenId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.game, view.phase, view.moves, canAct, roll, selectToken]);

  const netBadge =
    role === "local" ? null : (
      <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-silver/20 bg-black/60 px-2 py-0.5 text-[11px] text-silver/80">
        <span className={`h-2 w-2 rounded-full ${net.status === "connected" ? "bg-emerald-400" : "bg-amber-400"}`} />
        Room {net.code} · {net.status === "connected" ? "partner online" : isGuest ? "reconnecting…" : "partner offline"}
        {isGuest && net.status === "connected" && rtt !== null && ` · ${rtt} ms`}
        {isGuest && net.status !== "connected" && (
          <button className="ml-1 underline" onClick={() => void net.join(net.code)}>
            retry
          </button>
        )}
      </p>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#020403] font-body">
      <div className="absolute inset-0 touch-none">
        <Scene
          game={view.game}
          phase={view.phase}
          dice={view.dice}
          moves={view.moves}
          animation={view.animation}
          onRoll={roll}
          onSelectToken={selectToken}
          onAnimationDone={isGuest ? noop : engine.onAnimationDone}
          onSfx={sfx.play}
          canAct={canAct}
          onSoftwareRenderer={() => setNoGpu(true)}
          quality={quality}
        />
      </div>
      {noGpu && (
        <div className="absolute inset-x-3 top-[max(4.5rem,env(safe-area-inset-top))] z-40 mx-auto max-w-md rounded-xl border border-amber-300/40 bg-black/85 p-3 text-xs text-amber-100 backdrop-blur">
          <p className="font-semibold">Browser ini tidak memakai GPU, jadi game akan patah-patah.</p>
          <p className="mt-1 text-amber-100/80">
            Chrome: Settings → System → aktifkan &quot;Use graphics acceleration when available&quot;, lalu Relaunch. Laptop: colokkan charger dan pilih mode
            High performance.
          </p>
          <button className="mt-2 underline" onClick={() => setNoGpu(false)}>
            Tutup
          </button>
        </div>
      )}
      {/* Vignette: candle-lit dungeon edges */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.75)_100%)]" />
      {view.game ? (
        <Hud
          game={view.game}
          phase={view.phase}
          dice={view.dice}
          moves={view.moves}
          log={view.log}
          muted={sfx.muted}
          onRoll={roll}
          onSelectToken={selectToken}
          onToggleMute={sfx.toggleMute}
          onRestart={() => engine.start(lastPlayers.current)}
          onNewSetup={toLobby}
          canAct={canAct}
          quality={quality}
          onCycleQuality={cycleQuality}
          isGuest={isGuest}
          netBadge={netBadge}
        />
      ) : (
        <SetupScreen
          net={net}
          onStart={begin}
          onLobbyChange={onLobbyChange}
          remoteLobby={remoteLobby}
          initialRoom={initialRoom}
          initialPlayers={lastPlayers.current}
        />
      )}
      {!introDone && <IntroSplash onDone={() => setIntroDone(true)} />}
    </main>
  );
}
