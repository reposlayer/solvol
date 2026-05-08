import type { ReactNode } from "react";

export function Panel({
  title,
  meta,
  action,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`terminal-panel ${className}`}>
      <header className="terminal-panel-header">
        <div>
          <span className="terminal-panel-kicker">SOLVOL</span>
          <h2>{title}</h2>
          {meta ? <p>{meta}</p> : null}
        </div>
        {action ? <div className="terminal-panel-action">{action}</div> : null}
      </header>
      <div className="terminal-panel-body">{children}</div>
    </section>
  );
}
