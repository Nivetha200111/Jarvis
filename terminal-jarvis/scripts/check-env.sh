#!/usr/bin/env bash
set -euo pipefail

required_node_major=22
node_major="$(node -p "process.versions.node.split('.')[0]")"

if [[ "$node_major" != "$required_node_major" ]]; then
  echo "Error: Node.js ${required_node_major}.x is required, found $(node -v)"
  echo "Install Node 22 and retry."
  exit 1
fi

required_cmds=(git python3 make g++ cmake pkg-config)
missing=()

for cmd in "${required_cmds[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Error: Missing required tools: ${missing[*]}"
  echo "On CachyOS/Arch run: sudo pacman -S --needed git python make gcc cmake pkgconf"
  exit 1
fi

echo "Environment check passed"
