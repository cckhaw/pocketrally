# Decisions

- Car moves "on rails" in track space (distance `s`, lateral offset `d`); world position is derived from the spline. Simpler and more robust than free 2D steering, and makes the autopilot a pure planner.
- Simulation is pure TypeScript (no three) and runs at a fixed 60 Hz step, so it is unit-testable and deterministic; rendering only reads state.
- Static props are merged per material with vertex colours (one draw call per material) instead of many meshes; only dynamic things are separate meshes.
- Level configs are executable TS (a small path-builder DSL emits explicit waypoints), so segment positions are written in builder distance and stay in sync.
- The API core (`api/_lib`) is framework-agnostic; `api/*.ts` are thin Vercel wrappers; `scripts/dev-api.ts` serves the same core locally.
- `package.json` is not `"type": "module"` so Vercel compiles `api/` as CJS and extensionless relative imports work.
- All three levels are selectable from the start (no unlock gating); stars and bests still show on the cards.
- Static scenery is merged into vertex-coloured chunks (90 units of track each) instead of using InstancedMesh for every repeated prop; coins and particles are instanced/pooled. This keeps draw calls around 130 with post-processing and shadows (budget 150), and frustum culling still works per chunk.
- Levels stretch straights by a per-level factor (`PathBuilder.stretch`) so a clean autopilot run lands at about 66-70 s; par times sit above that so humans can reach 3 stars.
- The leaderboard API returns 503 `not_configured` on Vercel when `DATABASE_URL`/secret are missing (an in-memory store would silently drop data across serverless instances); locally it falls back to `MemoryStore`.
- Run tokens live for 6 h so a score earned while the API was unreachable can still be retried from the offline queue. A run that never obtained a token (API down at the start) stays a local personal best only.
- Score rule failures (too fast, elapsed mismatch, too many tokens) consume the run token; shape errors (bad types, bad hash) do not, so a client bug cannot burn a legitimate run.
- Playwright: the pre-installed Chromium does not match the installed Playwright version, so `playwright.config.ts` uses `/opt/pw-browsers/chromium` when present (override with `PW_CHROMIUM_PATH`). WebGL runs on SwiftShader, so e2e uses `?quality=low` and `?turbo=30` for full-level runs; only the leaderboard test runs in real time because the server verifies elapsed time.
- Turbo-run scores are rejected by the real anti-cheat (elapsed < claimed time), so turbo e2e tests stub `/api/*`.
- The Playwright suite is not part of `npm test` or CI (it needs a browser and takes minutes); it is run with `npm run test:e2e`.
- Cleanup script keeps only the new live production deployment (no extra rollback target); the README documents how to keep one previous version.
- Storage is Neon Postgres (not Redis). The `ScoreStore` interface is unchanged; `NeonStore` maps sorted sets to `lb_scores` rows, counters/flags to small tables with `expires_at`, and creates its schema on first use. The contract tests run against PGlite (real Postgres in WASM).
