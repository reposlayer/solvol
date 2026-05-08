import type { NormalizedPolymarketMarket } from "@/lib/polymarket/types";

export function BottomTicker({ markets }: { markets: NormalizedPolymarketMarket[] }) {
  const tape = markets
    .map(
      (market) =>
        `${market.slug.toUpperCase()} YES ${Math.round(market.yesPrice * 100)} ${market.change24h >= 0 ? "UP" : "DN"} ${Math.abs(market.change24h * 100).toFixed(1)}`,
    )
    .join("  /  ");

  return (
    <footer className="terminal-bottom-ticker" aria-label="Live market ticker">
      <span>LIVE TICKER</span>
      <div>
        <p>{tape}</p>
        <p aria-hidden="true">{tape}</p>
      </div>
    </footer>
  );
}
