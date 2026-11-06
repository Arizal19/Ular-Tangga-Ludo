import type { Seat } from "./board";

/** Per-seat banner. All four keep the Slytherin green/silver family but stay distinguishable. */
export const SEAT_THEME: Record<Seat, { house: string; color: string; glow: string }> = {
  0: { house: "Emerald Serpents", color: "#22c55e", glow: "#4ade80" },
  1: { house: "Silver Fangs", color: "#cbd5e1", glow: "#f1f5f9" },
  2: { house: "Black Lake", color: "#22d3ee", glow: "#67e8f9" },
  3: { house: "Dark Mark", color: "#a78bfa", glow: "#c4b5fd" },
};

/** Portraits live in /public/characters/<key>.jpg */
export const CHARACTERS: { key: string; name: string; short: string }[] = [
  { key: "draco", name: "Draco Malfoy", short: "Draco" },
  { key: "snape", name: "Severus Snape", short: "Snape" },
  { key: "bellatrix", name: "Bellatrix Lestrange", short: "Bellatrix" },
  { key: "voldemort", name: "Lord Voldemort", short: "Voldemort" },
  { key: "deya", name: "Deya Louvre", short: "Deya" },
  { key: "dolores", name: "Dolores Umbridge", short: "Umbridge" },
  { key: "albus", name: "Albus Dumbledore", short: "Albus" },
  { key: "minerva", name: "Minerva McGonagall", short: "Minerva" },
  { key: "remus", name: "Remus Lupin", short: "Remus" },
  { key: "sirius", name: "Sirius Black", short: "Sirius" },
  { key: "tonks", name: "Nymphadora Tonks", short: "Tonks" },
  { key: "ron", name: "Ron Weasley", short: "Ron" },
  { key: "gilderoy", name: "Gilderoy Lockhart", short: "Lockhart" },
];

export const characterName = (key: string) => CHARACTERS.find((c) => c.key === key)?.short ?? key;
