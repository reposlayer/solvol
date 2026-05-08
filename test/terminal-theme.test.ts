import test from "node:test";
import assert from "node:assert/strict";
import { isTerminalThemeMode, nextTerminalTheme } from "../src/components/terminal/terminal-theme.ts";

test("terminal theme supports dark and light modes only", () => {
  assert.equal(isTerminalThemeMode("dark"), true);
  assert.equal(isTerminalThemeMode("light"), true);
  assert.equal(isTerminalThemeMode("system"), false);
  assert.equal(isTerminalThemeMode(null), false);
});

test("terminal theme toggle alternates between dark and light", () => {
  assert.equal(nextTerminalTheme("dark"), "light");
  assert.equal(nextTerminalTheme("light"), "dark");
});
