import type { NormalizedPolymarketMarket } from "@/lib/polymarket/types";
import { MiniSparkline } from "@/components/terminal/MiniSparkline";
import { StatusBadge } from "@/components/terminal/StatusBadge";

function cents(value: number): string {
  return `${Math.round(value * 100)}c`;
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

export function MarketRow({
  market,
  selected,
  watched,
  onOpen,
  onToggleWatch,
}: {
  market: NormalizedPolymarketMarket;
  selected?: boolean;
  watched?: boolean;
  onOpen: (market: NormalizedPolymarketMarket) => void;
  onToggleWatch: (market: NormalizedPolymarketMarket) => void;
}) {
  const changeTone = market.change24h > 0 ? "positive" : market.change24h < 0 ? "negative" : "neutral";

  return (
    <div className={`terminal-market-row ${selected ? "is-selected" : ""}`}>
      <button type="button" className="terminal-market-row-main" onClick={() => onOpen(market)}>
        <span className="terminal-market-id">#{market.id}</span>
        <strong>{market.title}</strong>
        <span>{market.category}</span>
      </button>
      <span className="terminal-market-price">{cents(market.yesPrice)}</span>
      <span className="terminal-market-price is-muted">{cents(market.noPrice)}</span>
      <span className={`terminal-market-change is-${changeTone}`}>
        {market.change24h >= 0 ? "UP" : "DN"} {Math.abs(market.change24h * 100).toFixed(1)}
      </span>
      <span className="terminal-market-volume">{money(market.volume24h)}</span>
      <MiniSparkline values={market.sparkline} label={`${market.title} sparkline`} />
      <StatusBadge tone={changeTone}>{market.status}</StatusBadge>
      <button type="button" className="terminal-icon-button" onClick={() => onToggleWatch(market)}>
        {watched ? "UNWATCH" : "WATCH"}
      </button>
    </div>
  );
}
