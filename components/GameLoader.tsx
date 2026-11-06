"use client";
/** WebGL + canvas textures need the browser, so the game is client-only. */
import dynamic from "next/dynamic";

const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-[#020403] font-display tracking-[0.3em] text-emerald-300/80">
      Summoning the board…
    </div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
