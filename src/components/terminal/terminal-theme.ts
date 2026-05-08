export type TerminalThemeMode = "dark" | "light";

export function isTerminalThemeMode(value: unknown): value is TerminalThemeMode {
  return value === "dark" || value === "light";
}

export function nextTerminalTheme(mode: TerminalThemeMode): TerminalThemeMode {
  return mode === "dark" ? "light" : "dark";
}
