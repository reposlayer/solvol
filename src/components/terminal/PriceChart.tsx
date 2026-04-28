"use client";

import { useMemo, useState } from "react";

export type ChartPoint = { t: number; p: number };
export type ChartMarker = {
  t: number;
  label?: string;
  color?: string;
};

type Props = {
  history: ChartPoint[];
  /** Optional NO-side complement series (1 - p). Drawn faded. */
  showNo?: boolean;
  height?: number;
  markers?: ChartMarker[];
  /** Optional volume bars under the chart, same x scale. */
  volumeBars?: { t: number; v: number }[];
  className?: string;
};

const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 6;
const PAD_B = 18;
const VOL_H = 28;

function gridYTicks(min: number, max: number): number[] {
  // pick 4 round ticks within [min,max]
  const span = max - min;
  if (span <= 0) return [min];
  const step = niceStep(span / 4);
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(6)));
  }
  return out.length ? out : [min, max];
}

function niceStep(x: number): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf: number;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

function fmtTick(p: number): string {
  return `${(p * 100).toFixed(0)}¢`;
}

function fmtTimeAxis(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDateAxis(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

export function PriceChart({
  history,
  showNo = true,
  height = 220,
  markers,
  volumeBars,
  className,
}: Props) {
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: height });

  const ready = history.length >= 2;
  const tMin = ready ? history[0].t : 0;
  const tMax = ready ? history[history.length - 1].t : 1;

  const { yMin, yMax } = useMemo(() => {
    if (!ready) return { yMin: 0, yMax: 1 };
    let lo = 1;
    let hi = 0;
    for (const pt of history) {
      if (pt.p < lo) lo = pt.p;
      if (pt.p > hi) hi = pt.p;
    }
    if (showNo) {
      // Account for NO line (1 - p) so it stays visible.
      const lo2 = 1 - hi;
      const hi2 = 1 - lo;
      if (lo2 < lo) lo = lo2;
      if (hi2 > hi) hi = hi2;
    }
    const pad = Math.max(0.02, (hi - lo) * 0.12);
    return {
      yMin: Math.max(0, lo - pad),
      yMax: Math.min(1, hi + pad),
    };
  }, [history, ready, showNo]);

  const W = size.w;
  const H = size.h;
  const volH = volumeBars && volumeBars.length ? VOL_H : 0;
  const plotH = H - PAD_T - PAD_B - volH;
  const plotW = W - PAD_L - PAD_R;

  const xScale = (t: number): number =>
    PAD_L + ((t - tMin) / Math.max(1e-9, tMax - tMin)) * plotW;
  const yScale = (p: number): number =>
    PAD_T + (1 - (p - yMin) / Math.max(1e-9, yMax - yMin)) * plotH;

  const yesPath = ready
    ? history
        .map((pt, i) => `${i === 0 ? "M" : "L"}${xScale(pt.t).toFixed(1)},${yScale(pt.p).toFixed(1)}`)
        .join(" ")
    : "";
  const yesArea = ready
    ? `${yesPath} L${xScale(history[history.length - 1].t).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${xScale(history[0].t).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`
    : "";
  const noPath =
    ready && showNo
      ? history
          .map(
            (pt, i) =>
              `${i === 0 ? "M" : "L"}${xScale(pt.t).toFixed(1)},${yScale(1 - pt.p).toFixed(1)}`,
          )
          .join(" ")
      : "";

  const ticks = ready ? gridYTicks(yMin, yMax).filter((t) => t >= yMin && t <= yMax) : [];
  // x ticks: 4 evenly spaced
  const xTickIdx = ready
    ? [0, Math.floor(history.length / 3), Math.floor((history.length * 2) / 3), history.length - 1]
    : [];

  const baseline50 = 0.5;
  const showBaseline = ready && yMin <= baseline50 && yMax >= baseline50;

  const spanMs = ready ? (tMax - tMin) * (tMax < 1e12 ? 1000 : 1) : 0;
  const useDateAxis = spanMs > 1000 * 60 * 60 * 36; // > 36h → show dates

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!ready) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = rect.width === 0 ? 0 : (e.clientX - rect.left) * (W / rect.width);
    if (sx < PAD_L || sx > PAD_L + plotW) {
      setHover(null);
      return;
    }
    // map sx → time → nearest index
    const t = tMin + ((sx - PAD_L) / plotW) * (tMax - tMin);
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (history[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo;
    setHover({ x: xScale(history[idx].t), idx });
  }

  return (
    <div
      className={`relative w-full ${className ?? ""}`}
      ref={(el) => {
        if (el && el.clientWidth && el.clientWidth !== size.w) {
          setSize((s) => ({ ...s, w: el.clientWidth, h: height }));
        }
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="block select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* plot bg */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={plotW}
          height={plotH}
          fill="var(--terminal-bg-2)"
          stroke="none"
        />

        {/* y grid + labels */}
        {ticks.map((tv) => {
          const y = yScale(tv);
          return (
            <g key={`yt-${tv}`}>
              <line
                x1={PAD_L}
                x2={PAD_L + plotW}
                y1={y}
                y2={y}
                stroke="var(--terminal-border)"
                strokeDasharray="2 3"
                strokeWidth={0.5}
              />
              <text
                x={PAD_L - 4}
                y={y + 3}
                textAnchor="end"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fill="var(--terminal-muted)"
                className="tnum"
              >
                {fmtTick(tv)}
              </text>
            </g>
          );
        })}

        {/* baseline 50¢ */}
        {showBaseline ? (
          <line
            x1={PAD_L}
            x2={PAD_L + plotW}
            y1={yScale(0.5)}
            y2={yScale(0.5)}
            stroke="var(--terminal-amber)"
            strokeOpacity={0.45}
            strokeDasharray="4 3"
            strokeWidth={0.7}
          />
        ) : null}

        {/* x ticks */}
        {xTickIdx.map((i, k) => {
          if (i < 0 || i >= history.length) return null;
          const x = xScale(history[i].t);
          const txt = useDateAxis ? fmtDateAxis(history[i].t) : fmtTimeAxis(history[i].t);
          return (
            <g key={`xt-${k}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD_T + plotH}
                y2={PAD_T + plotH + 3}
                stroke="var(--terminal-border-hi)"
                strokeWidth={0.7}
              />
              <text
                x={x}
                y={PAD_T + plotH + 12}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fill="var(--terminal-muted)"
                className="tnum"
              >
                {txt}
              </text>
            </g>
          );
        })}

        {/* YES area + line */}
        {ready ? (
          <>
            <defs>
              <linearGradient id="yesGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--terminal-cyan)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--terminal-cyan)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={yesArea} fill="url(#yesGrad)" stroke="none" />
            {showNo ? (
              <path
                d={noPath}
                fill="none"
                stroke="var(--terminal-down)"
                strokeWidth={1}
                strokeOpacity={0.55}
                strokeDasharray="3 2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            <path
              d={yesPath}
              fill="none"
              stroke="var(--terminal-cyan)"
              strokeWidth={1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={10}
            fill="var(--terminal-muted)"
          >
            no series
          </text>
        )}

        {/* markers (catalyst events) */}
        {markers && ready
          ? markers.map((mk, i) => {
              if (mk.t < tMin || mk.t > tMax) return null;
              const x = xScale(mk.t);
              const c = mk.color ?? "var(--terminal-amber)";
              return (
                <g key={`mk-${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={PAD_T}
                    y2={PAD_T + plotH}
                    stroke={c}
                    strokeOpacity={0.55}
                    strokeWidth={0.8}
                    strokeDasharray="2 2"
                  />
                  <circle cx={x} cy={PAD_T + 4} r={2.5} fill={c} />
                  {mk.label ? (
                    <text
                      x={x + 3}
                      y={PAD_T + 9}
                      fontFamily="var(--font-mono)"
                      fontSize={8.5}
                      fill={c}
                    >
                      {mk.label}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}

        {/* volume bars */}
        {volumeBars && volumeBars.length ? (() => {
          const vMax = Math.max(...volumeBars.map((b) => b.v), 1);
          const yTop = PAD_T + plotH + 4;
          const barW = Math.max(1, plotW / volumeBars.length - 0.5);
          return (
            <g>
              {volumeBars.map((b, i) => {
                const x = xScale(b.t) - barW / 2;
                const h = (b.v / vMax) * (volH - 6);
                return (
                  <rect
                    key={`vb-${i}`}
                    x={x}
                    y={yTop + (volH - 6 - h)}
                    width={barW}
                    height={h}
                    fill="var(--terminal-violet)"
                    fillOpacity={0.5}
                  />
                );
              })}
            </g>
          );
        })() : null}

        {/* hover crosshair */}
        {hover && ready ? (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="var(--terminal-text-2)"
              strokeOpacity={0.4}
              strokeWidth={0.8}
              strokeDasharray="2 2"
            />
            <circle
              cx={hover.x}
              cy={yScale(history[hover.idx].p)}
              r={2.8}
              fill="var(--terminal-cyan)"
              stroke="var(--terminal-bg)"
              strokeWidth={1}
            />
          </g>
        ) : null}
      </svg>

      {hover && ready ? (
        <div
          className="pointer-events-none absolute top-1 rounded border border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2 py-1 font-mono text-[10px] text-[var(--terminal-text)] shadow-lg tnum"
          style={{
            left: `min(calc(100% - 130px), max(8px, ${(hover.x / W) * 100}% + 8px))`,
          }}
        >
          <div className="text-[var(--terminal-muted)]">
            {useDateAxis ? fmtDateAxis(history[hover.idx].t) : fmtTimeAxis(history[hover.idx].t)}
          </div>
          <div>
            <span className="text-[var(--terminal-cyan)]">YES</span>{" "}
            {fmtTick(history[hover.idx].p)}
          </div>
          {showNo ? (
            <div>
              <span className="text-[var(--terminal-down)]">NO</span>{" "}
              {fmtTick(1 - history[hover.idx].p)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
