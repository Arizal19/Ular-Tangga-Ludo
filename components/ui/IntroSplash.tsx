"use client";
/**
 * Cinematic opening: the motion-graphic clip plays full-screen once per browser
 * session, then fades into the lobby. Tap "Lewati / Skip" to leave early.
 *
 * Autoplay rules: browsers only autoplay video that is muted + playsInline, so
 * the clip starts silent; the sound button unmutes it (that tap also counts as
 * the user gesture that unlocks Web Audio on iOS).
 */
import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "slytherin-intro-seen";

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode): just show the intro
  }
}

export function IntroSplash({ onDone }: { onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [muted, setMuted] = useState(true);
  const [stalled, setStalled] = useState(false);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setLeaving(true);
    window.setTimeout(onDone, 600); // matches the fade-out below
  };

  useEffect(() => {
    if (alreadySeen()) {
      onDone();
      return;
    }
    const v = video.current;
    // Some browsers refuse autoplay even when muted (data saver, low power): show the poster + a Play button.
    v?.play().catch(() => setStalled(true));
    // Safety net: never trap the player behind a broken video.
    const guard = window.setTimeout(finish, 20000);
    return () => window.clearTimeout(guard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
      role="dialog"
      aria-label="Intro"
    >
      <video
        ref={video}
        className="h-full w-full object-cover"
        src="/intro/intro.mp4"
        poster="/intro/poster.jpg"
        muted={muted}
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.65)_100%)]" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="font-display text-sm tracking-[0.3em] text-emerald-200/90 drop-shadow">SLYTHERIN ASCENT</p>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-silver/30 bg-black/55 px-3 py-1.5 text-xs text-silver backdrop-blur"
            onClick={() => {
              const v = video.current;
              if (v) v.muted = !muted;
              setMuted(!muted);
            }}
          >
            {muted ? "🔇 Suara" : "🔊 Suara"}
          </button>
          <button className="rounded-full border border-emerald-300/50 bg-black/55 px-3 py-1.5 text-xs text-emerald-200 backdrop-blur" onClick={finish}>
            Lewati ›
          </button>
        </div>
      </div>
      {stalled && (
        <button
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/60 bg-black/60 px-6 py-3 font-display tracking-[0.25em] text-emerald-200 backdrop-blur"
          onClick={() => {
            setStalled(false);
            void video.current?.play();
          }}
        >
          ▶ PLAY
        </button>
      )}
    </div>
  );
}
