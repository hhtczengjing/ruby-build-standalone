#!/bin/bash
# Fix shebangs, run verification, and package tar.gz
# Usage: bash scripts/package.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

# Fix shebangs for portability
RUBY_BIN="${PREFIX}/bin"
for f in "$RUBY_BIN"/*; do
  if [ -f "$f" ] && [ -x "$f" ] && head -1 "$f" | grep -q '#!'; then
    sed -i '' $'1s|^#!.*/ruby.*|#!/usr/bin/env ruby|' "$f" 2>/dev/null || true
  fi
done
echo "  Shebangs fixed"

# Run verification
cd "${BUILD_DIR}"
chmod +x verify.sh
./verify.sh

# Package standalone
OUTPUT="${BUILD_DIR}/ruby_${RUBY_VERSION}_${ARCH}.tar.gz"
rm -f "$OUTPUT"
tar czf "$OUTPUT" -C "$BUILD_DIR" ruby-standalone/

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Build complete!"
echo "  Output: ${OUTPUT}"
echo "  Size:   $(du -h "$OUTPUT" | cut -f1)"
echo "═══════════════════════════════════════════════════════"
