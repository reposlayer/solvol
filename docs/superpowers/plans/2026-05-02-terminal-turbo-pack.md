# Terminal Turbo Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ten substantial trader cockpit features into `/terminal` as real computed modules, not decorative cards.

**Architecture:** Add a focused pure helper module for the new decision intelligence, cover it with node tests first, then wire the computed outputs into `SignalFlowWorkspace`. Keep routing, focused market selection, existing catalyst APIs, and live refresh hooks intact.

**Tech Stack:** Next.js App Router, React 19, TypeScript, TanStack Query, existing Polymarket/source data hooks, CSS in `src/app/globals.css`, Node test runner with `--experimental-strip-types`.

---

### Task 1: Decision Intelligence Helpers

**Files:**
- Create: `src/components/terminal/terminal-turbo.ts`
- Test: `test/terminal-turbo.test.ts`

- [ ] Write failing tests for Autopilot, Confidence Engine, Trade Tape Intelligence, Opportunity Heatmap, Replay frames, Smart Alert defaults, Related Graph, Journal defaults, Command Console suggestions, and War Room checklist.
- [ ] Run `node --test --experimental-strip-types test/terminal-turbo.test.ts` and verify it fails because helpers do not exist.
- [ ] Implement pure helpers in `terminal-turbo.ts` using plain data structures so UI remains easy to reason about.
- [ ] Re-run the focused test until all turbo helper tests pass.

### Task 2: Live Desk UI Integration

**Files:**
- Modify: `src/components/terminal/SignalFlowWorkspace.tsx`
- Modify: `src/app/globals.css`

- [ ] Import helper functions and compute the ten feature outputs from current market, discovery rows, snapshot, intel, catalyst result, and watchlist state.
- [ ] Add UI sections: Signal Autopilot, Catalyst War Room, Market Replay, Smart Alert Builder, Evidence Confidence Engine, Related Market Graph, Trade Tape Intelligence, Decision Journal, Opportunity Heatmap, and Power Console.
- [ ] Keep external side effects user-driven: no real alert sending, trading, or third-party posting.
- [ ] Style sections inside the current four-zone desk so the screen remains inbox -> brief -> evidence -> action.

### Task 3: Verification

**Files:**
- Test: `test/terminal-surface.test.ts`
- Existing scripts: `npm run lint`, `node --test --experimental-strip-types test/*.test.ts`, `npm run build`

- [ ] Add surface assertions that the ten turbo feature class names are present.
- [ ] Run lint, full tests, and build.
- [ ] Verify `/terminal?lane=research_worthy&marketId=2078312` in the app browser: live desk zones exist, no old cockpit shell appears, no console warn/error logs appear.
