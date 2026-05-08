export const EDITORIAL_CATEGORIES = [
  "Politics",
  "Macro",
  "Crypto",
  "Tech",
  "Sports",
  "Culture",
  "Elections",
  "Global",
] as const;

export type EditorialCategory = (typeof EDITORIAL_CATEGORIES)[number];

export const EDITORIAL_TOKENS = {
  color: {
    paper: "#f4f4f4",
    paperRaised: "#ffffff",
    ink: "#050505",
    muted: "#5a5a5a",
    divider: "#2b2b2b",
    ruleSoft: "#b8b8b8",
    marketGreen: "#ffffff",
    marketRed: "#9a9a9a",
    terminalBlue: "#d0d0d0",
    signalAmber: "#cfcfcf",
  },
  typography: {
    serif: 'Georgia, "Times New Roman", Times, serif',
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  },
  spacing: {
    page: "18px",
    rail: "12px",
    row: "7px",
  },
  radius: {
    editorial: "2px",
    control: "3px",
  },
} as const;

const CATEGORY_KEYWORDS: Record<EditorialCategory, string[]> = {
  Politics: ["trump", "biden", "congress", "senate", "house", "president", "government", "minister", "party"],
  Macro: ["fed", "rate", "inflation", "cpi", "gdp", "recession", "jobs", "treasury", "macro", "economy"],
  Crypto: ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "token", "coin", "sec"],
  Tech: ["ai", "openai", "apple", "google", "microsoft", "nvidia", "tesla", "x ", "technology"],
  Sports: ["nba", "nfl", "mlb", "nhl", "championship", "cup", "match", "game", "team", "player"],
  Culture: ["oscar", "grammy", "movie", "music", "culture", "celebrity", "film", "streaming"],
  Elections: ["election", "primary", "vote", "poll", "candidate", "mayor", "governor"],
  Global: ["war", "china", "israel", "ukraine", "russia", "europe", "global", "un ", "nato"],
};

export function editorialCategoryForText(text: string | null | undefined): EditorialCategory {
  const normalized = ` ${text ?? ""} `.toLowerCase();
  for (const category of EDITORIAL_CATEGORIES) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return "Global";
}
