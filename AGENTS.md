# Solvol Agent Notes

- Keep Solvol Terminal read-only. Do not add trade execution, order placement, custody, deposits, or withdrawals.
- Prefer live public Polymarket Gamma/CLOB/Data reads, but preserve deterministic mock fallback so `/terminal` remains demoable without credentials.
- Treat LLM output as optional narration only. Source truth must come from normalized data, source documents, scores, and timestamps.
- Use `src/lib/terminal/types.ts` for shared terminal domain contracts and keep new source adapters behind `MarketSource`.
- Run `npm run lint`, `npx tsc --noEmit`, `node --test --experimental-strip-types test/*.test.ts`, and `npm run build` before claiming the product foundation is ready.
- Update `SOLVOL_PLAN.md` whenever a milestone changes, verification is run, or a blocker appears.
