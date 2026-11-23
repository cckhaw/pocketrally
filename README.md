# Pocket Rally

A 3D arcade racer for the browser. You drive a tiny toy RC car through giant-scale real-world places: a vegetable garden, a living room and a pub cellar. The car accelerates by itself; you steer, ride boost pads, jump ramps, cross planks, dodge giant hazards and collect tokens. Every level is a time trial with a global leaderboard.

- Vite + TypeScript + Three.js. No physics engine, no external assets: everything (geometry, textures, sound) is generated procedurally.
- One responsive codebase for phones, tablets and desktops (portrait and landscape).
- Hosted as its own Vercel project, embeddable in the Arcade portal at `games.khaw.cc`.

## Quick start

```bash
npm install
npm run dev          # game at http://localhost:5173
npm run dev:api      # (second terminal) local leaderboard API on :3101, in-memory store
```

The Vite dev server proxies `/api/*` to the local API. Without the API the game is fully playable ("Leaderboard offline").

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run lint`      | ESLint + Prettier check                                          |
| `npm run typecheck` | `tsc --noEmit`                                                   |
| `npm test`          | Vitest unit tests (sim, levels, API, anti-cheat, deploy scripts) |
| `npm run build`     | Typecheck + production build into `dist/`                        |
| `npm run test:e2e`  | Playwright end-to-end tests (starts Vite and the dev API)        |
| `npm run thumbnail` | Regenerates `public/thumbnail.png` from a real screenshot        |

URL parameters: `?debug=1` (FPS, draw calls, triangles), `?autopilot=1` (the car drives the racing line), `?embed=1` (hides "Back to Arcade"), `?quality=low|med|high`, `?level=garden&autostart=1`, `?turbo=N` (simulate N times faster, for tests; scores from turbo runs are rejected by the real server), `?startS=300` (start 300 units into the level).

## Controls

| Input    | Steer                                | Brake / drift       | Pause      |
| -------- | ------------------------------------ | ------------------- | ---------- |
| Touch    | Drag anywhere (or left/right zones)  | Second finger       | HUD button |
| Tilt     | Tilt the device (opt-in in Settings) | -                   | HUD button |
| Mouse    | Hold and drag                        | -                   | Esc        |
| Keyboard | A / D or arrow keys                  | Space (or S / Down) | Esc / P    |
| Gamepad  | Left stick or d-pad                  | A / triggers        | Start      |

Settings: input mode, touch style, sensitivity, volume, quality (Auto/Low/Medium/High), haptics, reduced motion (disables camera shake and radial blur), nickname. "Auto" quality starts high (medium on touch devices) and steps down whenever the average frame time exceeds 20 ms.

Gameplay: boost pads give a 1.5 s boost; ramps launch you over gaps; planks and gaps respawn you at the last checkpoint if you fall; a hazard hit spins you out and slows you for 1 s; a stomp or a fall costs a checkpoint respawn while the timer keeps running. Stars: finish (1), 70% of tokens (2), beat par time (3).

## Architecture

```
src/core      loop/game, input, camera, audio, save, quality scaler, run simulation, autopilot, track
src/car       car controller (pure maths) and the car model
src/entities  level builder: batched static geometry, props, hazards, textures, title diorama
src/fx        particles, tyre-track ribbons, post-processing
src/levels    pure level data: builder DSL + garden / house / cellar / test configs
src/net       leaderboard client, offline queue, nickname rules (shared with the API)
src/ui        DOM UI (title, select, HUD, pause, results, leaderboard, settings)
api/          Vercel serverless functions; api/_lib holds the framework-agnostic core
scripts/      dev API server, thumbnail generator, deploy helpers (wait/cleanup) + tests
```

Key design decisions (also see `DECISIONS.md`):

- **Car on rails.** The car's state is a distance along a spline plus a lateral offset. World position is derived from the track, so there is no rigid-body engine, nothing can tunnel through anything, and the autopilot is a simple planner. Ground height, gaps, planks, ramps and walls are queries on the `Track`.
- **Pure, deterministic simulation.** `Run` steps at a fixed 60 Hz with no three.js dependency. Hazards are pure functions of time, which is what lets the autopilot predict them and what lets the unit tests complete every level headlessly.
- **Batched rendering.** Static props are baked per spatial chunk into vertex-coloured merged meshes (a handful of draw calls); tokens and particles are instanced/pooled. Typical load: ~110 draw calls, ~90k triangles (budget 150 / 300k).

## Adding a level

1. Create `src/levels/<id>/config.ts` exporting a `LevelConfig`. Use `PathBuilder` for the path, anchoring segments, tokens and hazards on `b.s` (distance travelled so far):

   ```ts
   const b = new PathBuilder(16) // track width
   b.straight(80)
   boosts.push({ s: 50, d: 0 })
   const rampS = b.s
   b.straight(40)
   seg.push(
     { type: 'ramp', s0: rampS, s1: rampS + 6, height: 1.8 },
     { type: 'gap', s0: rampS + 6, s1: rampS + 18 },
   )
   hz.push({ kind: 'stomp', model: 'foot', s: b.s + 10, d: 0, period: 4.5, r: 2.4 })
   b.turn(40, 90) // degrees (right is positive), radius
   ```

2. Segment types: `ramp`, `gap`, `plank`, `trench`, `tunnel`, `surface` (`spill`, `water`). Hazard kinds: `stomp`, `paw`, `toddler`, `roller`, `vacuum`, `door`, `fan`, `block`. Props are `{ kind, s, d }` (use `scatter(...)` for random scenery) and are drawn by `src/entities/props*.ts`.
3. Set `minPossibleTimeMs` (anti-cheat floor, keep it comfortably below the autopilot time) and `parTimeMs`.
4. Register it in `src/levels/index.ts`.
5. `npm test` runs the autopilot over every registered level: it must finish, collect tokens and stay above `minPossibleTimeMs`. Run `npm run test:e2e` to check it renders on all viewports.

Keep drop sections (`plank`, `gap`) on straight stretches and keep other parts of the track at least ~90 units away, because the floor ribbon around a track is 180 units wide.

## Leaderboard

Serverless functions in `api/` (Node runtime, TypeScript) with Neon (serverless Postgres) as the store, behind a `ScoreStore` interface with `NeonStore` and `MemoryStore` adapters. Without `DATABASE_URL` the API uses `MemoryStore` automatically when running locally; on Vercel it answers `503 not_configured` (an in-memory store does not survive across serverless instances) and the game simply shows "Leaderboard offline".

Data model: one ranked set per level and scope, keyed `lb:{levelId}:all` and `lb:{levelId}:week:{ISO-week}` (rows in table `lb_scores`; score = best time in ms; an upsert that only lowers the score keeps each player's best; weekly rows expire after 14 days), and `player:{id}` rows in `lb_hashes` with the nickname. Tables are created automatically on first use. Identity is an anonymous random UUID in `localStorage` plus a nickname (3-16 chars, trimmed, blocklist, no URLs). No accounts, no personal data. The API never returns player ids.

Endpoints (JSON, CORS limited to the game's own origin and `https://games.khaw.cc`):

- `POST /api/run/start` `{levelId, playerId}` -> `{runToken}`: HMAC-signed token with level, player, server start time and a nonce.
- `POST /api/score` `{runToken, timeMs, tokens, nickname, inputLogHash}` -> `{ok, rank, weekRank, bestTimeMs, improved, total}`.
- `GET /api/leaderboard?level=&scope=all|week&limit=50&playerId=` -> `{top, you, around, total}`.

### Anti-cheat and its limits

Server-side checks: valid signature, token not expired (6 h) and used once (insert-if-absent row), level matches, `serverElapsed >= timeMs - 1500 ms`, `timeMs >= level.minPossibleTimeMs`, tokens capped at the level total, strict type/range checks, per-IP and per-player rate limits (10 submissions per minute; run starts 30/20 per minute) using expiring counter rows in Postgres, and IPs are only stored as salted, truncated hashes in keys that expire after 60 s.

Known limits: the simulation runs in the browser, so a determined cheater can still produce a plausible-looking run (for example by scripting a perfect input stream or replaying the sim in real time with tooling) and the server cannot replay it. `inputLogHash` is only format-checked today; it exists so a future server-side replay verifier can be added without changing the client. The anti-cheat raises the bar (no instant or impossible times, no replays, no flooding); it does not make the board tamper-proof.

### Setup checklist (Vercel project)

1. Create the Vercel project (framework preset Vite, root of this repo). Leave Git integration alone: `vercel.json` already disables it.
2. Add the Neon integration from the Vercel Marketplace (it injects `DATABASE_URL` / `POSTGRES_URL`), or create a database at neon.tech and set `DATABASE_URL` by hand. No manual migration is needed.
3. Add `LEADERBOARD_SECRET` (a long random string, e.g. `openssl rand -hex 32`) for Production.
4. Redeploy (push to `main`, or run the Deploy workflow manually).

### Environment variables (Vercel project, not GitHub)

| Variable                     | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `DATABASE_URL`               | Neon Postgres connection string                   |
| `POSTGRES_URL`               | Same, as injected by some integrations (fallback) |
| `LEADERBOARD_SECRET`         | HMAC secret for run tokens, also salts IP hashes  |
| `ALLOWED_ORIGINS` (optional) | Extra comma-separated CORS origins                |

If anything is missing the app degrades gracefully: the game stays fully playable, scores stay in `localStorage`, and queued scores are retried when the API comes back.

## Deployment (GitHub Actions -> Vercel, production only)

There are **no preview deployments**: `vercel.json` sets `"git": { "deploymentEnabled": false }` so Vercel's Git integration never builds anything, `ci.yml` never calls Vercel, and `deploy.yml` runs only on pushes to `main` (and manual runs on `main`).

- `.github/workflows/ci.yml`: pull requests and pushes to non-main branches. Install, lint, typecheck, unit tests, build.
- `.github/workflows/deploy.yml`: lint/typecheck/test/build, `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, then `scripts/wait-for-production.mjs` (polls every 5 s for up to 5 min until the deployment is `READY` _and_ is the project's production target), then `scripts/cleanup-deployments.mjs`, then a job summary. It uses `concurrency: production-deploy` with `cancel-in-progress: false`.

### GitHub secrets / variables

Add these in GitHub: Settings -> Secrets and variables -> Actions (as secrets or variables; the workflow reads `secrets.NAME || vars.NAME`):

| Name                | Used for                                                     |
| ------------------- | ------------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel CLI and REST API (use a secret)                       |
| `VERCEL_ORG_ID`     | Vercel CLI (`vercel pull/build/deploy`)                      |
| `VERCEL_PROJECT_ID` | Vercel CLI and REST API                                      |
| `VERCEL_TEAM_ID`    | `teamId` query parameter for REST calls (omitted when empty) |

Values are never printed. The cleanup script prints only deployment ids and counts.

### Cleanup and the rollback caveat

After a new deployment is confirmed live as the production target, `cleanup-deployments.mjs` deletes every other deployment in the project (production and preview), following pagination (`GET /v6/deployments`, then `DELETE /v13/deployments/:id`, with retry and backoff on 429/5xx, continuing past individual failures and exiting non-zero if any delete failed). Hard safety rules: it refuses to run unless the new deployment is the current production target, never deletes the new deployment or the current production target, and aborts if the selection would. `--dry-run` lists what would be deleted. It is unit-tested with mocked API responses.

**Important: deleting old deployments removes Vercel's instant rollback targets.** After a bad release the only way back is to revert the commit and redeploy (a few minutes). If you want to keep one previous version, change `selectDeletions` in `scripts/cleanup-deployments.mjs` to also keep the most recent READY production deployment before the new one, or remove the cleanup step from `deploy.yml`.

## Adding to the Arcade portal

The game runs standalone at its own URL and is iframe-embeddable: `vercel.json` sends `Content-Security-Policy: frame-ancestors 'self' https://games.khaw.cc https://*.khaw.cc` (and no `X-Frame-Options`). Metadata for the portal is in `public/arcade.json` and a 1200x630 `public/thumbnail.png` (a real screenshot, regenerate with `npm run thumbnail`).

**Option 1: link.** Add a card that opens the game URL in the same or a new tab:

```html
<a href="https://YOUR-POCKET-RALLY-URL/">Play Pocket Rally</a>
```

**Option 2: iframe.** Use `?embed=1` to hide the "Back to Arcade" button:

```html
<iframe
  src="https://YOUR-POCKET-RALLY-URL/?embed=1"
  title="Pocket Rally"
  style="width:100%;height:100%;border:0;aspect-ratio:16/9"
  allow="fullscreen; accelerometer; gyroscope; autoplay"
  allowfullscreen
  loading="lazy"
></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://YOUR-POCKET-RALLY-URL') return
    if (e.data?.type === 'pocket-rally:ready') console.log('Pocket Rally ready')
    if (e.data?.type === 'pocket-rally:score')
      console.log('Finished', e.data.levelId, e.data.timeMs)
  })
  // Pause / resume the game from the portal (the game only accepts messages from https://games.khaw.cc):
  // iframe.contentWindow.postMessage({ type: 'pocket-rally:pause' }, 'https://YOUR-POCKET-RALLY-URL')
</script>
```

Messages from the game to the parent: `{type:'pocket-rally:ready'}` and `{type:'pocket-rally:score', levelId, timeMs}` (posted to `https://games.khaw.cc`). Messages to the game: `{type:'pocket-rally:pause'}` and `{type:'pocket-rally:resume'}`, accepted only from `https://games.khaw.cc`. The game also pauses by itself when the tab is hidden.

## Testing

- Unit tests (Vitest): controller maths, track queries, hazards, autopilot completing every level, save, quality scaler, nickname rules, token signing, anti-cheat rules, rate limiting, API handlers against `MemoryStore`, `NeonStore` protocol, and the deploy scripts with mocked Vercel responses.
- End-to-end (Playwright, Chromium): every level is completed by the autopilot on 390x844, 844x390, 820x1180, 1180x820, 1280x720 and 1920x1080 with no console errors and a non-blank canvas; screenshots go to `screenshots/`. Another test runs the autopilot in real time against the local API and checks that the rank appears on the results screen and in the leaderboard. Others cover the offline path and keyboard/mouse input. If your Chromium does not match the installed Playwright, set `PW_CHROMIUM_PATH`.
