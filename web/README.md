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

## Frontend CI and releases

The [Frontend workflow](../.github/workflows/frontend.yml) builds WebAssembly,
runs the web tests and validates the static bundle on pull requests targeting
`main`. Pushes to `main` run the same checks, then deploy the tested `web/dist/`
bundle to the existing `dih-dah-dojo` Worker and check the production homepage
and `/words`. Use **Actions → Frontend → Run workflow** on `main` to retry a
release from the current branch head.

GitHub's `production` environment is restricted to `main`. It uses the
`CLOUDFLARE_ACCOUNT_ID` environment variable and the `CLOUDFLARE_API_TOKEN`
environment secret. Create the token with Cloudflare's **Edit Cloudflare Workers**
template, scoped to the Dojo account and the `veryshyjelly.in` zone.
See [Cloudflare's GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

The API has a [separate release process](../docs/web-operations.md#releases-and-rollback)
for the Termux host.

### Manual frontend release

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

The header theme toggle follows the device initially and remembers a browser-local
choice. See [appearance and source publication](../docs/web-appearance.md).

Words contains individual-word practice and **Phrases & Messages**. The latter
uses original controlled material for connected copying, after-listening detail
recall, and unscored listening reflection, with distinct progress for each task.
Guest activity stays in browser storage; signed-in activity uses `/api/language`
and never updates guided training targets. See
[message contracts](../docs/message-training.md) and
[verification](../docs/connected-listening-verification.md).

Earlier stories remain at `/stories` with their original text and saved places;
`/progress?mode=stories` opens archived activity. The existing CC0 assets
`assets/words.tsv` and `assets/stories.tsv`, legacy packets and backup frames stay
compatible. [Earlier implementation evidence](../docs/word-story-verification.md)
describes the original persistence format and hardware limitations.
