#!/bin/bash
# Download, configure, build, and install Ruby from source
# Usage: bash scripts/build-ruby.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

# Download Ruby source
cd "${WORKSPACE_DIR}"
curl -fsSL "https://cache.ruby-lang.org/pub/ruby/${RUBY_MAJOR}/ruby-${RUBY_VERSION}.tar.gz" -o ruby.tar.gz
rm -rf "ruby-${RUBY_VERSION}"
tar xzf ruby.tar.gz
echo "  Downloaded and extracted ruby-${RUBY_VERSION}.tar.gz"

# Configure Ruby
cd "${WORKSPACE_DIR}/ruby-${RUBY_VERSION}"
./configure \
  --prefix="$PREFIX" \
  --with-openssl-dir="${WORKSPACE_DIR}/openssl/${ARCH}" \
  --with-libyaml-dir="${WORKSPACE_DIR}/libyaml/${ARCH}" \
  --with-static-linked-ext \
  --with-ext=openssl,psych,+ \
  --enable-load-relative \
  --enable-rpath \
  --enable-shared \
  --disable-install-doc

# Build and install
make -j"$(sysctl -n hw.ncpu)"
make install

# Verify
export PATH="${PREFIX}/bin:$PATH"
export GEM_HOME="${PREFIX}/lib/ruby/gems/${RUBY_MAJOR}.0"
unset GEM_PATH GEM_CACHE
ruby --version
gem --version
