"use client";
/**
 * Procedural spell SFX via the Web Audio API — no audio files to host.
 * To swap in recorded sounds later, replace the body of a recipe with
 * `new Audio('/sfx/<name>.mp3').play()`.
 */
import { useCallback, useRef, useState } from "react";

export type SfxName = "dice" | "step" | "enter" | "ladder" | "snake" | "capture" | "finish" | "win" | "six" | "fizzle";

type Ctx = AudioContext;

function tone(ctx: Ctx, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.2, endFreq?: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(ctx: Ctx, out: AudioNode, start: number, dur: number, freq: number, q: number, gain: number, endFreq?: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, start);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(start);
}

const RECIPES: Record<SfxName, (ctx: Ctx, out: AudioNode, t: number) => void> = {
  // Crystal die rattling in its levitation field.
  dice: (ctx, out, t) => {
    for (let i = 0; i < 7; i++) noise(ctx, out, t + i * 0.11 + Math.random() * 0.04, 0.06, 2500 + Math.random() * 2500, 6, 0.35);
    tone(ctx, out, 1400, t, 0.9, "sine", 0.04, 2100);
  },
  step: (ctx, out, t) => tone(ctx, out, 620, t, 0.09, "triangle", 0.12, 420),
  enter: (ctx, out, t) => {
    tone(ctx, out, 300, t, 0.45, "triangle", 0.18, 900);
    noise(ctx, out, t, 0.4, 6000, 2, 0.08);
  },
  // Silver chime arpeggio climbing the staircase.
  ladder: (ctx, out, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, f, t + i * 0.08, 0.5, "sine", 0.16)),
  // Parseltongue hiss + descending slither.
  snake: (ctx, out, t) => {
    noise(ctx, out, t, 1.1, 5200, 3, 0.4, 3200);
    tone(ctx, out, 330, t + 0.05, 1.0, "sawtooth", 0.05, 70);
  },
  // Expulso: low boom and crackle.
  capture: (ctx, out, t) => {
    tone(ctx, out, 140, t, 0.6, "sine", 0.5, 38);
    noise(ctx, out, t, 0.35, 900, 0.8, 0.35, 200);
  },
  finish: (ctx, out, t) => [659, 784, 988].forEach((f) => tone(ctx, out, f, t, 1.4, "sine", 0.12)),
  win: (ctx, out, t) =>
    [392, 523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(ctx, out, f, t + i * 0.14, 0.6, "triangle", 0.16)),
  six: (ctx, out, t) => [1568, 2093, 2637].forEach((f, i) => tone(ctx, out, f, t + i * 0.05, 0.3, "sine", 0.07)),
  fizzle: (ctx, out, t) => tone(ctx, out, 300, t, 0.35, "square", 0.05, 120),
};

export function useSfx() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  const play = useCallback((name: SfxName) => {
    if (mutedRef.current || typeof window === "undefined") return;
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
        masterRef.current = ctxRef.current.createGain();
        masterRef.current.gain.value = 0.6;
        masterRef.current.connect(ctxRef.current.destination);
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      RECIPES[name](ctx, masterRef.current!, ctx.currentTime + 0.01);
    } catch {
      // Audio is decorative; never let it break a turn.
    }
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  return { play, muted, toggleMute };
}
