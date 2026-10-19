export interface UiPalette {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  accent: string;
  accentHover: string;
  text: string;
  muted: string;
  eye: string;
  body: string;
  /** Text drawn on a filled accent button. */
  ink: string;
}

const PHOSPHOR: UiPalette = {
  bg: "#05090b",
  surface: "#0b1317",
  elevated: "#101b20",
  border: "#164249",
  accent: "#56dddd",
  accentHover: "#2ce6e6",
  text: "#e2f5f5",
  muted: "#83999f",
  eye: "#56dddd",
  body: "#070b0d",
  ink: "#041416",
};

const PALETTES: Record<string, UiPalette> = {
  phosphor: PHOSPHOR,
  "phosphor-violet": { ...PHOSPHOR, eye: "#c4b5fd" },
  "obsidian-violet": {
    bg: "#0b0b0d",
    surface: "#151518",
    elevated: "#1c1c21",
    border: "#2a2a30",
    accent: "#a78bfa",
    accentHover: "#c4b5fd",
    text: "#e2f5f5",
    muted: "#83999f",
    eye: "#f8fafc",
    body: "#111114",
    ink: "#120c1c",
  },
  "midnight-cyan": {
    bg: "#070b0f",
    surface: "#0f1419",
    elevated: "#161c22",
    border: "#24303a",
    accent: "#22d3ee",
    accentHover: "#67e8f9",
    text: "#e2f5f5",
    muted: "#83999f",
    eye: "#ecfeff",
    body: "#0b1016",
    ink: "#041416",
  },
  "carbon-mint": {
    bg: "#080b0a",
    surface: "#111614",
    elevated: "#171d1a",
    border: "#27332d",
    accent: "#34d399",
    accentHover: "#6ee7b7",
    text: "#e2f5f5",
    muted: "#83999f",
    eye: "#ecfdf5",
    body: "#0c1210",
    ink: "#041416",
  },
  "graphite-amber": {
    bg: "#0c0b09",
    surface: "#161410",
    elevated: "#1d1a15",
    border: "#322c22",
    accent: "#fbbf24",
    accentHover: "#fcd34d",
    text: "#e2f5f5",
    muted: "#83999f",
    eye: "#fffbeb",
    body: "#12100c",
    ink: "#1c1404",
  },
};

/** Same mapping the sidebar uses for Shade's theme setting. */
export function resolveUiTheme(mascotTheme?: string): string {
  switch (mascotTheme) {
    case "phosphor-violet":
      return "phosphor-violet";
    case "neon-blue":
    case "midnight-cyan":
      return "midnight-cyan";
    case "forest-green":
    case "carbon-mint":
      return "carbon-mint";
    case "sunset-orange":
    case "rose-pink":
    case "monochrome":
    case "graphite-amber":
      return "graphite-amber";
    case "obsidian-violet":
      return "obsidian-violet";
    case "phosphor":
    case "default-purple":
    default:
      return "phosphor";
  }
}

export function uiPalette(mascotTheme?: string): UiPalette {
  return PALETTES[resolveUiTheme(mascotTheme)] ?? PHOSPHOR;
}
