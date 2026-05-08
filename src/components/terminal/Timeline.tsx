import type { TerminalTimelineEntry } from "@/lib/terminal/timeline";

export function Timeline({ items }: { items: TerminalTimelineEntry[] }) {
  return (
    <div className="redesign-timeline-table" aria-label="Event timeline">
      <div className="redesign-timeline-head" aria-hidden="true">
        <span>Time</span>
        <span>Source</span>
        <span>Impact</span>
        <span>Score</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="redesign-timeline-row">
          <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
          <div className="redesign-timeline-main">
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
          </div>
          <span className={`redesign-impact is-${item.impact}`}>{item.impact}</span>
          <span className="redesign-confidence">{item.correlationScore ?? item.importance}</span>
        </div>
      ))}
    </div>
  );
}
