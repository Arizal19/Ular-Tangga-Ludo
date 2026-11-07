/**
 * Graphics presets. `auto` adapts to the frame rate; `medium` is a balanced fixed
 * preset (sharp, softer lights, no adaptive drops); `high` spends the GPU;
 * `low` saves battery on weak phones.
 */
export type QualityMode = "auto" | "low" | "medium" | "high";

export interface QualityProfile {
  /** Max pixels rendered per frame; dpr is derived from this and the screen size. */
  maxPixels: number;
  shadow: number;
  bloom: boolean;
  /** Multiplier for sparkle particle counts. */
  sparkle: number;
  /** Let PerformanceMonitor lower/raise resolution while playing. */
  adaptive: boolean;
  /** Per-tile texture resolution in the board atlas. */
  atlasCell: number;
  envResolution: number;
  /** Tone-mapping exposure and a multiplier for the scene lights (High is moodier, less glare). */
  exposure: number;
  light: number;
  bloomStrength: number;
}

const phone = () => typeof window !== "undefined" && window.innerWidth < 768;

export function profileFor(mode: QualityMode): QualityProfile {
  if (mode === "low")
    return { maxPixels: 1.0e6, shadow: 1024, bloom: false, sparkle: 0.35, adaptive: false, atlasCell: 128, envResolution: 128, exposure: 1.4, light: 1, bloomStrength: 0 };
  if (mode === "medium")
    return { maxPixels: 3.2e6, shadow: 2048, bloom: true, sparkle: 1.2, adaptive: false, atlasCell: 256, envResolution: 256, exposure: 1.25, light: 0.85, bloomStrength: 0.55 };
  if (mode === "high")
    return { maxPixels: 5.5e6, shadow: phone() ? 2048 : 4096, bloom: true, sparkle: 1.6, adaptive: false, atlasCell: 256, envResolution: 512, exposure: 1.1, light: 0.72, bloomStrength: 0.45 };
  return { maxPixels: 2.2e6, shadow: phone() ? 1024 : 2048, bloom: true, sparkle: 1, adaptive: true, atlasCell: 256, envResolution: 256, exposure: 1.4, light: 1, bloomStrength: 0.7 };
}

const KEY = "slytherin-quality";
export function loadQuality(): QualityMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "auto" || v === "low" || v === "medium" || v === "high") return v;
  } catch {
    /* storage blocked */
  }
  return "auto";
}
export function saveQuality(m: QualityMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}
export const NEXT_QUALITY: Record<QualityMode, QualityMode> = { auto: "low", low: "medium", medium: "high", high: "auto" };
export const QUALITY_LABEL: Record<QualityMode, string> = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };
