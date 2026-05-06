# Claude Code Task: QA Fix Pass — 4 Visual/UX Issues

Fix the following 4 issues found during a full QA sweep of clearchain.vercel.app. All are visual/UX — no API or data logic changes.

---

## Issue 1 — Auth input field inconsistency [MEDIUM]

**Problem:** Login page uses bordered/boxed inputs (with background), signup page uses underline-only inputs. They don't match.

**Fix:** Standardize both pages to use the same input style. Use the signup page's underline style as the target (it's cleaner and more on-brand). Update `/app/auth/login/page.tsx` inputs to match the underline style used in `/app/auth/signup/page.tsx`.

---

## Issue 2 — PATTERNS tab: misleading red severity bars on CLEAN wallets [MEDIUM]

**Problem:** When a wallet scores 0/CLEAN (like vitalik.eth), the Patterns tab still shows typologies like "RAPID FUND MOVEMENT / HOP LAYERING" with a 90% filled red bar and red dot indicator. This is visually alarming for what is a clean wallet and can mislead users even though a disclaimer exists.

**Fix:** In the Patterns tab rendering (look in `app/page.tsx` for the typology/patterns display section), when the overall risk level is LOW or CLEAN (score 0–24):
- Change the severity bar color from red/orange to a muted gray-cyan (`rgba(6, 182, 212, 0.4)`)
- Change the leading dot indicator from red/orange to `var(--text-dim)` or `#1e4d5c`
- Make the disclaimer box more prominent: change border color from current to `rgba(6,182,212,0.2)` and add a slightly stronger background `rgba(6,182,212,0.05)`

Do NOT change the actual pattern names or severity percentages — just the color treatment when risk is LOW.

---

## Issue 3 — Flow tab Sankey: dark ribbons on dark background [LOW]

**Problem:** In the FLOW tab, the Sankey diagram ribbons (the curved paths between source addresses and destination) are very dark gray on a dark background. Contrast is too low to read comfortably.

**Fix:** Find the Sankey/flow chart rendering in `app/page.tsx` (search for "sankey" or "ribbon" or the Flow tab section). Increase ribbon opacity and/or lighten the fill color. Target: ribbons should be visible with at least rgba value of `rgba(6, 182, 212, 0.25)` for default state and `rgba(6, 182, 212, 0.5)` on hover. The exact implementation depends on how the SVG paths are styled — adjust fill/stroke accordingly.

---

## Issue 4 — Activity Timeline: orange bars for clean wallets [LOW]

**Problem:** In `components/TransactionTimeline.tsx`, the activity timeline colors bars orange ("RAPID MOVE" color = `#ff8c00`) when rapid movement is detected. For wallets that score CLEAN (0–24), this orange coloring sends the wrong signal — the bar suggests danger even when the wallet is safe.

**Fix:** In `TransactionTimeline.tsx`, add a prop or use the existing `riskLevel`/`riskScore` prop (check what's passed in). When `riskLevel === 'LOW'` or `riskScore < 25`, override all bar colors to use `NORMAL` color (`#22d3ee` / `var(--low)`) regardless of detected patterns. The rapid movement flag should only drive bar color when the wallet is actually medium/high/critical risk.

---

## After making all changes:
1. Run `npm run dev` and verify visually at localhost:3000
2. Test vitalik.eth — patterns tab bars should now be muted gray-cyan, not red
3. Test Tornado Cash — patterns tab bars should still be red (high risk)
4. Confirm Flow tab ribbons are visible
5. Confirm auth pages now have matching input styles
