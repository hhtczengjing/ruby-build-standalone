#!/bin/bash
#
# Local build script for ruby-build-standalone
# Compiles OpenSSL and libyaml from source for true portability
#
# Usage: ./build.sh [arm64|x86_64]
#   Default: current machine architecture
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
# Clear RVM environment variables BEFORE sourcing (RVM's RUBY_VERSION=ruby-3.0.0 would override)
unset MY_RUBY_HOME RUBY_VERSION GEM_ROOT GEM_HOME GEM_PATH

source "${SCRIPTS_DIR}/build-common.sh"

# Re-set ARCH after clearing
ARCH="${1:-$(uname -m)}"
case "$ARCH" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="x86_64" ;;
  *)      echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac
export ARCH

run_step() {
  local n="$1"; shift
  local desc="$1"; shift
  step "$n. $desc"
  "$@"
}

run_step 1 "Install build tools" brew install autoconf automake libtool pkg-config
run_step 2 "Compile OpenSSL from source" bash "${SCRIPTS_DIR}/build-openssl.sh" "$ARCH"
run_step 3 "Compile libyaml from source" bash "${SCRIPTS_DIR}/build-libyaml.sh" "$ARCH"
run_step 4 "Download, configure, and build Ruby" bash "${SCRIPTS_DIR}/build-ruby.sh" "$ARCH"
run_step 5 "Update RubyGems and install gems" bash "${SCRIPTS_DIR}/install-gems.sh" "$ARCH"
run_step 6 "Copy dylibs and fix paths" bash "${SCRIPTS_DIR}/fix-dylibs.sh" "$ARCH"
run_step 7 "Verify and package" bash "${SCRIPTS_DIR}/package.sh" "$ARCH"
