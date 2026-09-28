# UI polish — Opus 5.5

Hamza: resurrect the UI agent. Model: **Opus 5.5**. Goal: a real **mobile app**, not an AI landing page.

Worktree: `/Users/hamzadiaz/Projects/arisan-wt-opus`
Branch: `feat/clockin-ui-polish`
Repo: `hamzadiaz/arisan`. GitHub user `hamzadiaz`. One PR. Do not merge unless CI green and Hamza already authorized delivery merges — this polish PR can stay open if the delivery agent is mid-loop; prefer open PR, merge if CI green and no conflict with `feat/clockin-delivery`.

## The actual brief

**Do not look AI-made.** Kill AI slop.

- Too much chrome (labels, helper paragraphs, disclaimers, “Your keys, your wallet”, three-step sermons)
- Too much text. Cut copy hard. Titles short. One line max under a control
- No exaggerated marketing: “Save together. Take turns.” essays, icon+title+body triplets
- No emoji decoration, no gradient sermons, no “seamless/unlock/empower”
- Compact: app bar + tab bar, content is the product
- Phone 390×844. Fixed bottom tabs (Home / Create / Join). Sticky independent app bar (brand, connect/wallet, theme)
- Quiet type, real spacing, one accent. Looks like a savings app someone would keep, not a GPT mock

## Do

1. Strip Home/Join/Create/pool pages to the minimum words
2. App bar always useful; tabs always obvious
3. Screenshots in `docs/ui-proof/` after (mobile)
4. Keep Playwright E2E passing — update assertions if copy changes
5. Do not rewrite Solana programs
6. Do not touch Binance/trading panes or `arisan-e2e` delivery worktree except rebase onto `origin/main` if needed

Start now. Push and `gh pr create`.
