"use client";

import type { ReactNode } from "react";

type PanelFrameProps = {
  id?: string;
  fkey?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
};

/** Bloomberg-style panel: F-key chip + uppercase title + sub strip + body. */
export function PanelFrame({
  id,
  fkey,
  title,
  subtitle,
  right,
  children,
  className,
  bodyClassName,
  scroll,
}: PanelFrameProps) {
  return (
    <section
      id={id}
      className={`tpanel flex min-h-0 min-w-0 flex-col ${className ?? ""}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2.5 py-1.5">
        {fkey ? <span className="fkey">{fkey}</span> : null}
        <span className="tpanel-label text-[var(--terminal-text-2)]">{title}</span>
        {subtitle ? (
          <span className="font-mono text-[10px] text-[var(--terminal-muted)] truncate">
            · {subtitle}
          </span>
        ) : null}
        {right ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{right}</div> : null}
      </header>
      <div
        className={`min-h-0 min-w-0 flex-1 ${scroll ? "tscroll overflow-auto" : ""} ${bodyClassName ?? ""}`}
      >
        {children}
      </div>
    </section>
  );
}

/** Small section header used inside panel bodies. */
export function SubLabel({ children }: { children: ReactNode }) {
  return (
    <div className="tpanel-label mt-3 mb-1.5 first:mt-0">{children}</div>
  );
}
