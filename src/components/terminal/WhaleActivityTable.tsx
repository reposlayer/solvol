import type { WalletActivity } from "@/lib/terminal/types";

export function WhaleActivityTable({ wallets }: { wallets: WalletActivity[] }) {
  return (
    <div className="terminal-whale-stack" aria-label="Whale activity table">
      {wallets.map((wallet) => (
        <article key={wallet.id}>
          <div>
            <strong>{wallet.label ?? `${wallet.walletAddress.slice(0, 6)}...${wallet.walletAddress.slice(-4)}`}</strong>
            <span>{wallet.walletAddress}</span>
          </div>
          <em className={wallet.side === "BUY" ? "is-up" : "is-down"}>
            {wallet.side} {wallet.outcome}
          </em>
          <b>${Math.round(wallet.notionalUsd).toLocaleString()}</b>
        </article>
      ))}
    </div>
  );
}
