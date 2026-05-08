import { SearchInput } from "@/components/terminal/SearchInput";
import { StatusBadge } from "@/components/terminal/StatusBadge";

export function TopBar({
  search,
  onSearchChange,
  portfolioValue,
  pnl,
  buyingPower,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  portfolioValue: string;
  pnl: string;
  buyingPower: string;
}) {
  return (
    <header className="terminal-topbar">
      <SearchInput value={search} onChange={onSearchChange} placeholder="Search title, category, ticker" />
      <div className="terminal-account-strip">
        <span>
          Portfolio <strong>{portfolioValue}</strong>
        </span>
        <span>
          PnL <strong>{pnl}</strong>
        </span>
        <span>
          Buying power <strong>{buyingPower}</strong>
        </span>
        <button type="button" disabled>
          Account read only
        </button>
        <StatusBadge tone="outline">NOTIFY 03</StatusBadge>
      </div>
    </header>
  );
}
