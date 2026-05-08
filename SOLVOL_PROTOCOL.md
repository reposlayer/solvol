# Solvol Terminal Protocol

Solvol Terminal is a read-only intelligence terminal for Polymarket markets only. It is not a broker, wallet, exchange UI, order router, custody surface, deposit flow, withdrawal flow, or portfolio manager.

## Scope

- Product scope: Polymarket only.
- No trade execution.
- Data scope: public market discovery, market metadata, CLOB market data, price history, public trade/activity data, source documents, deterministic scores, local watchlists, and local alert rules.
- Out of scope: trade execution, order placement, order cancellation, private-key handling, wallet connection, custody, deposits, withdrawals, bridges, balance management, and settlement operations.
- LLM scope: optional narration only. LLM output must never become source truth for probabilities, trades, prices, scores, timestamps, wallet flow, or alert triggers.

## Source Rules

The terminal can read these Polymarket surfaces:

- Gamma API: `https://gamma-api.polymarket.com` for markets, events, tags, search, and public browsing metadata.
- CLOB API public market-data endpoints: `https://clob.polymarket.com` for book, midpoint, spread, and price history.
- CLOB market WebSocket: `wss://ws-subscriptions-clob.polymarket.com/ws/market` for unauthenticated public market data updates only.
- Data API: `https://data-api.polymarket.com` for public trades/activity/analytics where available.

Official Polymarket docs identify Gamma and Data as public APIs and CLOB as a mix of public market data and authenticated trading endpoints:

- https://docs.polymarket.com/api-reference
- https://docs.polymarket.com/developers/gamma-markets-api/overview
- https://docs.polymarket.com/api-reference/markets/get-prices-history
- https://docs.polymarket.com/trading/orderbook

Solvol must not call authenticated CLOB trading endpoints, the authenticated user WebSocket channel, bridge endpoints, deposit endpoints, withdrawal endpoints, or any endpoint that requires order signing.

## Deterministic Truth

Every visible intelligence claim must trace back to one of:

- normalized market contracts in `src/lib/terminal/types.ts`
- Polymarket Gamma/CLOB/Data responses normalized by adapters
- source documents and timestamps
- deterministic scoring utilities in `src/lib/terminal/scoring.ts`
- deterministic state transitions in `src/lib/terminal/state-machines.ts`
- alert evaluation in `src/lib/terminal/alerts.ts`
- merged timeline records in `src/lib/terminal/timeline.ts`

Mock data is allowed only as a deterministic fallback when live reads or credentials are unavailable. Mock responses must include `dataMode: "mock"` and a `fallbackReason`, and mock copy must be visibly labeled as demo/mock.

## Adapter Boundary

Terminal market adapters must satisfy `MarketSource` from `src/lib/terminal/types.ts`. External source adapters must satisfy `SourceAdapter` from `src/lib/terminal/types.ts` and stay behind the ingestion bridge boundary.

- `createPolymarketMarketSource()` is the production adapter boundary for public Polymarket reads.
- `createMockMarketSource()` is the deterministic demo fallback.
- New market adapters must stay behind `MarketSource`, new document/event adapters must stay behind `SourceAdapter`, and neither boundary may introduce trading or custody verbs.

## State Machines

`src/lib/terminal/state-machines.ts` owns first-class terminal state transitions:

- Market status transitions are idempotent and allow `open -> paused|closed|resolved`, `paused -> open|closed|resolved`, and `closed -> resolved`. `resolved` is terminal.
- Event lifecycle transitions are idempotent and allow events to progress from `new` to `developing`, `corroborated`, `contested`, or `refuted`. `refuted` is terminal.
- Rejected transitions return a deterministic transition record with `accepted: false` and an `invalid` rule ID instead of mutating state.

## Completion Gates

Before claiming the product foundation is ready, run:

```bash
npm run lint
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
npm run build
```

Record verification results and blockers in `SOLVOL_PLAN.md`.
