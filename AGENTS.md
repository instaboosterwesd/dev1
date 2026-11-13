<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Ported Aviator game
- The app is a single-page Aviator-style flight game ported from github.com/instaboosterwesd/workspace (artifacts/main-app). All game logic, styles, and assets live in src/routes/index.tsx, src/styles.css, and src/assets/aviator/ — keep them together; the game is self-contained with no backend.
- The game owns one session-only available balance shared by both bet panels; synchronously reserve stakes through `src/lib/bet-balance.ts` and credit refunds/payouts once, so panels cannot overspend together.
- Keep crash-config scope exports and optional explicit-token arguments backward compatible: external API callers rely on token-specific paths while unscoped game calls retain legacy paths.
- Preserve `/api`, `/api/token`, `/api/balance`, and `/api/config` contracts; token/user game links must load and persist their scoped balance, while a game without account parameters retains its session balance.
- Serialize account balance writes and retain synchronous shared-panel stake reservations so queued writes cannot reverse settlements or allow local overspending.
- The game publishes each round's crash value to `current.json` in its token scope the moment the round starts, so API responses can report the in-flight round as `now`; keep that write ordered after the previous one and optional-token scoped like every other crash path.
- Keep cashout notifications as uniquely identified entries with independent dismissal timers in the game route so simultaneous panel settlements never overwrite each other.
- The game takes the next round (announceCrash) the moment the live multiplier passes 3x — or at crash time for rounds crashing below 3x — so `now` updates before the crash without webhook calls; the round start reuses that value via consumeNextCrash so announced and flown values always match.
- Import visible game images with Vite's `?inline` asset query so slow or failed image requests cannot leave round-transition artwork blank.
- Game and API consumers get crash updates from Firebase streams (EventSource on `live.json`, `crashConfig.json`, `upcoming.json`), never interval polling, and each round publishes current/upcoming/live in one multi-path PATCH — this keeps monthly CDN/request quotas low..
