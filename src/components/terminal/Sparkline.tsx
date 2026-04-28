"use client";

/** Minimal SVG sparkline from probability samples (0–1). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="flex h-12 w-full items-center justify-center font-mono text-[10px] text-[var(--terminal-muted)]">
        No series
      </div>
    );
  }

  const w = 200;
  const h = 48;
  const pad = 2;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) {
    min -= 0.01;
    max += 0.01;
  }

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={w} height={h} className="text-[var(--terminal-cyan)]" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        points={pts.join(" ")}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
