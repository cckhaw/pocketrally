# Decisions

- Car moves "on rails" in track space (distance `s`, lateral offset `d`); world position is derived from the spline. Simpler and more robust than free 2D steering, and makes the autopilot a pure planner.
- Simulation is pure TypeScript (no three) and runs at a fixed 60 Hz step, so it is unit-testable and deterministic; rendering only reads state.
- Static props are merged per material with vertex colours (one draw call per material) instead of many meshes; only dynamic things are separate meshes.
- Level configs are executable TS (a small path-builder DSL emits explicit waypoints), so segment positions are written in builder distance and stay in sync.
- The API core (`api/_lib`) is framework-agnostic; `api/*.ts` are thin Vercel wrappers; `scripts/dev-api.ts` serves the same core locally.
- `package.json` is not `"type": "module"` so Vercel compiles `api/` as CJS and extensionless relative imports work.
- All three levels are selectable from the start (no unlock gating); stars and bests still show on the cards.
