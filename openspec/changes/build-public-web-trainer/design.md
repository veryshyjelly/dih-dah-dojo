## Shared core
Rust timing, synthesis, input history, scoring, estimation, planner, controller and record/progress queries become dojo-core. Native modules re-export these types. Wall clocks are injected for browser use; binary field order and marker discriminants remain unchanged. dojo-wasm exposes typed JSON projections in memory and Postcard records/checkpoints for durable storage.
## Browser execution
A dedicated worker owns the learner/session engine and expensive analysis. A preinitialized Rust AudioWorklet owns sample-clock playback, ramps, pause/stop and bounded catch-up gaps. Input receipt and rendering stay independent of analysis, storage and networking. No transmitted text or revealing pattern is displayed during scored listening. Browser timestamps remain estimated.
## Public product
React/TypeScript/Vite static frontend with self-hosted Monaspace Neon, warm surfaces, dark ink and teal/amber accents. Public listening tools and a bounded recognition demo need no account. Guided training and sync require Google/GitHub sign-in. Keyboard and touch have separate profiles. Manual drills never qualify adaptive gates.
## Persistence and API
Node/Hono and Better Auth run in the confirmed Node 22 ARM64 Debian runtime on Termux. SQLite WAL stores accounts and immutable versioned binary blocks/checkpoints with owner, source, input profile and revision indexes. Stable block IDs and optimistic revisions prevent duplicate or stale state overwrites. The server evaluates records in a bounded worker; stale blocks are extra practice without adaptive updates. IndexedDB retains an owner-scoped binary outbox until acknowledged. Origin/credentialed CORS are restricted to the configured frontend.
## Operations
Static assets deploy to Cloudflare without server functions. The existing remotely managed tunnel gains only dojoapi.veryshyjelly.in to a loopback API on 8787. Dojo has separate persistent data, private secrets, releases, supervision and rotated logs; shared phone services/runtime are not upgraded. Daily consistent SQLite backups and an off-device restore check precede production readiness. Android reboot requires an unlock as documented by existing operations.
## Boundaries
No paid Cloudflare services, subscriptions, sending trainer, leaderboard or native-history import. Native history is preserved. Physical timing gate stays open.
