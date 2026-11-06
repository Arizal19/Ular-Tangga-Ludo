"use client";
/** Client root: wires the engine + SFX hooks to the 3D scene and the HUD. */
import { useEffect, useRef } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useSfx } from "@/hooks/useSfx";
import type { PlayerConfig } from "@/lib/rules";
import { Scene } from "./scene/Scene";
import { Hud } from "./ui/Hud";
import { SetupScreen } from "./ui/SetupScreen";

export default function Game() {
  const sfx = useSfx();
  const engine = useGameEngine(sfx.play);
  const lastPlayers = useRef<PlayerConfig[]>([]);
  const { game, phase, moves, roll, selectToken, start, reset } = engine;

  const begin = (players: PlayerConfig[]) => {
    lastPlayers.current = players;
    start(players);
  };

  // Keyboard: Space/Enter rolls, 1/2 picks a serpent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game || (e.target as HTMLElement)?.closest("input, select, textarea")) return;
      const human = !game.players[game.turn].isAI;
      if ((e.code === "Space" || e.code === "Enter") && phase === "await-roll" && human) {
        e.preventDefault();
        roll();
      }
      if (phase === "choosing" && (e.key === "1" || e.key === "2")) {
        const m = moves.find((mv) => mv.tokenId.endsWith(`-${Number(e.key) - 1}`));
        if (m) selectToken(m.tokenId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, phase, moves, roll, selectToken]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#020403] font-body">
      <div className="absolute inset-0">
        <Scene
          game={game}
          phase={phase}
          dice={engine.dice}
          moves={moves}
          animation={engine.animation}
          onRoll={roll}
          onSelectToken={selectToken}
          onAnimationDone={engine.onAnimationDone}
          onSfx={sfx.play}
        />
      </div>
      {/* Vignette: candle-lit dungeon edges */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.75)_100%)]" />
      {game ? (
        <Hud
          game={game}
          phase={phase}
          dice={engine.dice}
          moves={moves}
          log={engine.log}
          muted={sfx.muted}
          onRoll={roll}
          onSelectToken={selectToken}
          onToggleMute={sfx.toggleMute}
          onRestart={() => start(lastPlayers.current)}
          onNewSetup={reset}
        />
      ) : (
        <SetupScreen onStart={begin} />
      )}
    </main>
  );
}
