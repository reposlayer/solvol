"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CommandSuggestion } from "@/components/terminal/terminal-turbo";

type TopCommandBarProps = {
  onCommand: (command: string) => void;
  suggestions?: CommandSuggestion[];
  placeholder?: string;
};

export function TopCommandBar({
  onCommand,
  suggestions = [],
  placeholder = "Search markets, ids, sources, or run WHY 540816",
}: TopCommandBarProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleSuggestions = suggestions
    .filter((suggestion) => {
      const q = value.trim().toLowerCase();
      if (!q) return true;
      return `${suggestion.command} ${suggestion.label} ${suggestion.description}`.toLowerCase().includes(q);
    })
    .slice(0, 6);

  function dispatch(command: string) {
    const clean = command.trim();
    if (!clean) return;
    onCommand(clean);
    setValue("");
    setOpen(false);
  }

  function submit(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    dispatch(value);
  }

  return (
    <div className="live-desk-search terminal-command-palette">
      <span>⌕</span>
      <input
        ref={inputRef}
        aria-label="Terminal command"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={submit}
        placeholder={placeholder}
      />
      <kbd>⌘K</kbd>
      {open && visibleSuggestions.length ? (
        <div className="terminal-command-palette-menu" role="listbox" aria-label="Command palette suggestions">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion.command}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => dispatch(suggestion.command)}
            >
              <code>{suggestion.command}</code>
              <span>{suggestion.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
