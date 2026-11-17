#!/usr/bin/env bash
# npm run lean:setup — make lean/ ready to check proofs.
#
# Installs the Lean toolchain named in lean/lean-toolchain (through elan) and
# downloads Mathlib's prebuilt files instead of compiling them, which would
# take hours. About 7 GB under lean/.lake and 3 GB under ~/.elan, once.
# Safe to run again: it only fetches what is missing.
set -euo pipefail

cd "$(dirname "$0")/../lean"
export PATH="$HOME/.elan/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v lake >/dev/null 2>&1; then
  echo "elan (the Lean version manager) is not installed. Install it, then run this again:" >&2
  echo "  brew install elan-init" >&2
  exit 1
fi

echo "Lean toolchain: $(cat lean-toolchain)"
lake --version
echo "Fetching Mathlib's prebuilt files (the first run downloads several GB)…"
lake exe cache get
echo "Building the app's own Lean library…"
lake build
echo "Checking a proof…"
printf 'import Mathlib\nexample (a b : ℝ) : (a + b)^2 = a^2 + 2*a*b + b^2 := by ring\n' | lake env lean --stdin
echo "Lean is ready."
