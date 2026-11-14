# The web studio

The public studio is at https://dojo.veryshyjelly.in. The API runs on the existing
Termux phone behind https://dojoapi.veryshyjelly.in. Static assets contain no
server functions, credentials, or account database. Public listening tools and the
five-sound demo work without sign-in. Guided training requires an account.

## Develop

Use Rust 1.94+, Node 22.23+ and the committed lockfiles. Install the Rust WASM
target and the matching `wasm-bindgen-cli` version from `crates/dojo-wasm/Cargo.toml`.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
cd web
npm ci
./scripts/build-wasm.sh
cp .env.example .env.local
npm run dev
```

Run the API separately with the variables in `.env.example` exported into its
environment, then `npm run dev:api`. The API reads environment variables; it does
not automatically load Vite's `.env.local`. Keep all secrets out of `VITE_*` values.
OAuth provider credentials are optional locally; unavailable providers are disabled.

```sh
npm run build
npm test
npx playwright install chromium firefox webkit
npm run test:browser
node --import tsx scripts/measure-workload.ts
```

Browser checks expect the studio on `127.0.0.1:5173` and local API on port 8787.
Account browser fixtures are confined to tests and run real Rust checkpoint and
packet evaluation. Production has no test-session or authentication bypass.
The workload uses disposable SQLite data, synthetic users and records, real muted
browser audio, 10 typing events/second, and concurrent scoring/storage. Set
`DOJO_MEASURE_SECONDS` (10–1800), `DOJO_MEASURE_ORIGIN`, and `DOJO_MEASURE_REPORT`
to customize it. Its software measurements do not certify physical timing.

## Build and publish

```sh
./scripts/build-wasm.sh
VITE_API_ORIGIN=https://dojoapi.veryshyjelly.in npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

`wrangler.jsonc` declares only static assets, SPA fallback and the frontend custom
domain. No paid bindings or server functions are provisioned. `public/_headers`
restricts browser connections to the API and permits local WASM compilation.

See [operations](../docs/web-operations.md), [OAuth setup](../docs/web-oauth.md),
and [verification](../docs/web-verification.md).
