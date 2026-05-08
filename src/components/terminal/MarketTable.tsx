import type { Market } from "@/lib/terminal/types";

function usd(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function cents(value: number): string {
  return `${Math.round(value * 100)}c`;
}

export function MarketTable({
  markets,
  selectedId,
  onSelect,
}: {
  markets: Market[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="terminal-screener-table" role="table" aria-label="Market table">
      <div className="terminal-screener-row is-head" role="row">
        <span>Market</span>
        <span>YES</span>
        <span>24h volume</span>
        <span>Liquidity</span>
        <span>Status</span>
      </div>
      {markets.map((market) => (
        <button
          key={market.id}
          type="button"
          className={`terminal-screener-row ${market.id === selectedId ? "is-selected" : ""}`}
          onClick={() => onSelect?.(market.id)}
          role="row"
        >
          <strong>{market.title}</strong>
          <span className="tnum">{cents(market.probability)}</span>
          <span className="tnum">{usd(market.volume24h)}</span>
          <span className="tnum">{usd(market.liquidity)}</span>
          <span>{market.status}</span>
        </button>
      ))}
    </div>
  );
}
