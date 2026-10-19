/** Map Shade/mascot theme ids → UI data-theme tokens */
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

export const UI_THEMES = [
  { id: "phosphor", label: "Phosphor", ui: "phosphor" },
  { id: "phosphor-violet", label: "Phosphor · violet eyes", ui: "phosphor-violet" },
  { id: "obsidian-violet", label: "Obsidian Violet", ui: "obsidian-violet" },
  { id: "neon-blue", label: "Midnight Cyan", ui: "midnight-cyan" },
  { id: "forest-green", label: "Carbon Mint", ui: "carbon-mint" },
  { id: "sunset-orange", label: "Graphite Amber", ui: "graphite-amber" },
] as const;
