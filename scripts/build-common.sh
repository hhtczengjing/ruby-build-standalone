#!/bin/bash
# Shared configuration for all build scripts
# Source this file first: source "$(dirname "$0")/build-common.sh"

RUBY_VERSION="${RUBY_VERSION:-3.2.3}"
FASTLANE_VERSION="${FASTLANE_VERSION:-2.233.1}"
OPENSSL_VERSION="${OPENSSL_VERSION:-3.2.3}"
LIBYAML_VERSION="${LIBYAML_VERSION:-0.2.5}"
BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${BUILD_DIR}/ruby-standalone"

# Detect architecture if not specified
if [ -z "${ARCH:-}" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64)  ARCH="arm64" ;;
    x86_64) ARCH="x86_64" ;;
    *)      echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
fi

RUBY_MAJOR="${RUBY_VERSION%.*}"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() {
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Step: $*"
  echo "═══════════════════════════════════════════════════════"
  echo ""
}
