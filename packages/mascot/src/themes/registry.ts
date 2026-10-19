export interface MascotTheme {
  id: string;
  name: string;
  body: string;
  glow: string;
  eye: string;
  accent: string;
}

export const THEMES: MascotTheme[] = [
  {
    id: "default-purple",
    name: "Default Purple",
    body: "#1a1228",
    glow: "#7c3aed",
    eye: "#a78bfa",
    accent: "#c4b5fd",
  },
  {
    id: "neon-blue",
    name: "Neon Blue",
    body: "#0b1220",
    glow: "#2563eb",
    eye: "#60a5fa",
    accent: "#93c5fd",
  },
  {
    id: "sunset-orange",
    name: "Sunset Orange",
    body: "#1c120c",
    glow: "#ea580c",
    eye: "#fdba74",
    accent: "#fb923c",
  },
  {
    id: "forest-green",
    name: "Forest Green",
    body: "#0c1610",
    glow: "#16a34a",
    eye: "#86efac",
    accent: "#4ade80",
  },
  {
    id: "rose-pink",
    name: "Rose Pink",
    body: "#1a1016",
    glow: "#db2777",
    eye: "#f9a8d4",
    accent: "#f472b6",
  },
  {
    id: "monochrome",
    name: "Monochrome",
    body: "#111111",
    glow: "#6b7280",
    eye: "#e5e7eb",
    accent: "#9ca3af",
  },
];

export function getTheme(id: string): MascotTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
