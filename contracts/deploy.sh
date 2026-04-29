#!/usr/bin/env bash
# ─── Talos Protocol — CosmWasm Contract Deploy (Initia testnet) ───────────────
# Usage: ./deploy.sh [--key <key-name>] [--node <rpc-url>] [--chain <chain-id>]
#
# Prerequisites:
#   1. Rust + wasm32 target: rustup target add wasm32-unknown-unknown
#   2. cargo-run-script or binaryen for wasm-opt (optional, reduces size):
#        cargo install wasm-opt  OR  apt install binaryen
#   3. initiad CLI with a funded key on initiation-2:
#        initiad keys add deployer
#        # fund via: https://faucet.testnet.initia.xyz/
#
# The script prints the two contract addresses to add to .env.local:
#   NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT=init1...
#   NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT=init1...

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────────────────
KEY_NAME="deployer"
NODE="https://rpc.testnet.initia.xyz:443"
CHAIN_ID="initiation-2"
GAS_PRICES="0.015uinit"
GAS_ADJUSTMENT="1.4"

# ─── Parse flags ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --key)   KEY_NAME="$2";  shift 2 ;;
    --node)  NODE="$2";      shift 2 ;;
    --chain) CHAIN_ID="$2";  shift 2 ;;
    *) shift ;;
  esac
done

INITIAD_FLAGS="--node $NODE --chain-id $CHAIN_ID --gas auto --gas-prices $GAS_PRICES --gas-adjustment $GAS_ADJUSTMENT -y"
FROM_FLAG="--from $KEY_NAME"

# ─── Build ────────────────────────────────────────────────────────────────────
echo "▶  Building CosmWasm contracts (release)..."
cargo build --target wasm32-unknown-unknown --release 2>&1 | tail -5

REGISTRY_WASM="target/wasm32-unknown-unknown/release/talos_registry.wasm"
NAME_SERVICE_WASM="target/wasm32-unknown-unknown/release/talos_name_service.wasm"

for f in "$REGISTRY_WASM" "$NAME_SERVICE_WASM"; do
  if [[ ! -f "$f" ]]; then
    echo "✗  Build failed — $f not found"
    exit 1
  fi
done

# Optionally optimise with wasm-opt if available
if command -v wasm-opt &>/dev/null; then
  echo "▶  Optimising wasm with wasm-opt..."
  wasm-opt -Oz "$REGISTRY_WASM"   -o "$REGISTRY_WASM"
  wasm-opt -Oz "$NAME_SERVICE_WASM" -o "$NAME_SERVICE_WASM"
fi

# ─── Helpers ──────────────────────────────────────────────────────────────────
store_contract() {
  local wasm="$1"
  local label="$2"
  echo ""
  echo "▶  Storing $label..."
  local out
  out=$(initiad tx wasm store "$wasm" $FROM_FLAG $INITIAD_FLAGS --output json 2>&1)
  local code_id
  code_id=$(echo "$out" | grep -oP '"code_id",\s*"\K[0-9]+' | head -1)
  if [[ -z "$code_id" ]]; then
    # try events path
    code_id=$(echo "$out" | python3 -c "
import sys, json
d=json.load(sys.stdin)
for ev in d.get('events',[]):
  for attr in ev.get('attributes',[]):
    if attr.get('key')=='code_id':
      print(attr['value'])
      break
" 2>/dev/null || true)
  fi
  if [[ -z "$code_id" ]]; then
    echo "✗  Could not extract code_id from store output:"
    echo "$out"
    exit 1
  fi
  echo "   Code ID: $code_id"
  echo "$code_id"
}

instantiate_contract() {
  local code_id="$1"
  local init_msg="$2"
  local label="$3"
  echo ""
  echo "▶  Instantiating $label (code $code_id)..."
  local out
  out=$(initiad tx wasm instantiate "$code_id" "$init_msg" \
    --label "$label" --no-admin \
    $FROM_FLAG $INITIAD_FLAGS --output json 2>&1)
  local addr
  addr=$(echo "$out" | python3 -c "
import sys, json
d=json.load(sys.stdin)
for ev in d.get('events',[]):
  if ev.get('type')=='instantiate':
    for attr in ev.get('attributes',[]):
      if attr.get('key')=='_contract_address':
        print(attr['value'])
        break
" 2>/dev/null || true)
  if [[ -z "$addr" ]]; then
    echo "✗  Could not extract contract address. Raw output:"
    echo "$out"
    exit 1
  fi
  echo "   Address: $addr"
  echo "$addr"
}

# ─── Get deployer address for protocol wallet ─────────────────────────────────
DEPLOYER_ADDR=$(initiad keys show "$KEY_NAME" -a 2>/dev/null || echo "")
if [[ -z "$DEPLOYER_ADDR" ]]; then
  echo "✗  Key '$KEY_NAME' not found. Run: initiad keys add $KEY_NAME"
  exit 1
fi
echo "   Deployer: $DEPLOYER_ADDR"

# ─── TalosRegistry ────────────────────────────────────────────────────────────
REGISTRY_CODE=$(store_contract "$REGISTRY_WASM" "TalosRegistry")
REGISTRY_INIT="{\"protocol_wallet\":\"$DEPLOYER_ADDR\",\"protocol_fee_bps\":300}"
REGISTRY_ADDR=$(instantiate_contract "$REGISTRY_CODE" "$REGISTRY_INIT" "TalosRegistry")

# ─── TalosNameService ─────────────────────────────────────────────────────────
NAME_CODE=$(store_contract "$NAME_SERVICE_WASM" "TalosNameService")
NAME_ADDR=$(instantiate_contract "$NAME_CODE" "{}" "TalosNameService")

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Add these to web/.env.local:"
echo ""
echo "  NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT=$REGISTRY_ADDR"
echo "  NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT=$NAME_ADDR"
echo "═══════════════════════════════════════════════════════"
