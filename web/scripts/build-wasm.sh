#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
cargo build --release --locked -p dojo-wasm --target wasm32-unknown-unknown
WASM_BINDGEN_BIN="${WASM_BINDGEN_BIN:-wasm-bindgen}"
"$WASM_BINDGEN_BIN" target/wasm32-unknown-unknown/release/dojo_wasm.wasm --target web --out-dir web/public/engine --out-name dojo
mkdir -p web/src/generated
cp web/public/engine/* web/src/generated/
