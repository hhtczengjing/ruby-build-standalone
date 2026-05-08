#!/bin/bash
# Compile OpenSSL 3 from source
# Usage: bash scripts/build-openssl.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

cd "${WORKSPACE_DIR}"
curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" -o openssl.tar.gz
tar xzf openssl.tar.gz
rm -rf openssl-src
mv "openssl-${OPENSSL_VERSION}" openssl-src
cd openssl-src

./Configure "darwin64-${ARCH}-cc" \
  --prefix="${WORKSPACE_DIR}/openssl/${ARCH}" \
  --openssldir="${WORKSPACE_DIR}/openssl/${ARCH}/ssl" \
  -mmacosx-version-min=12.0 shared no-docs no-tests

make -j"$(sysctl -n hw.ncpu)" && make install_sw

cd "${WORKSPACE_DIR}"
echo "  OpenSSL compiled to ${WORKSPACE_DIR}/openssl/${ARCH}/"
