import type { ReactNode } from "react";

export function StatusStrip({ children }: { children: ReactNode }) {
  return (
    <div className="live-desk-ribbon" aria-label="Live data pulse">
      {children}
    </div>
  );
}
