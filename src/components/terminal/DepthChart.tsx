import type { PolymarketOrderBook } from "@/lib/polymarket/types";

function maxSize(book: PolymarketOrderBook): number {
  return Math.max(
    1,
    ...book.yesBids.map((level) => level.size),
    ...book.yesAsks.map((level) => level.size),
    ...book.noBids.map((level) => level.size),
    ...book.noAsks.map((level) => level.size),
  );
}

export function DepthChart({ orderBook }: { orderBook: PolymarketOrderBook }) {
  const max = maxSize(orderBook);
  const rows = [
    ...orderBook.yesBids.map((level) => ({ ...level, lane: "YES BID" })),
    ...orderBook.yesAsks.map((level) => ({ ...level, lane: "YES ASK" })),
    ...orderBook.noBids.map((level) => ({ ...level, lane: "NO BID" })),
    ...orderBook.noAsks.map((level) => ({ ...level, lane: "NO ASK" })),
  ];

  return (
    <div className="terminal-depth-chart" aria-label="Order book depth">
      {rows.map((row, index) => (
        <div key={`${row.lane}-${row.price}-${index}`} className="terminal-depth-row">
          <span>{row.lane}</span>
          <span>{Math.round(row.price * 100)}c</span>
          <div>
            <i style={{ inlineSize: `${Math.max(4, (row.size / max) * 100)}%` }} />
          </div>
          <span>{row.size.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
