#!/bin/bash
# Compile libyaml from source
# Usage: bash scripts/build-libyaml.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

cd "${BUILD_DIR}"
curl -fsSL "https://github.com/yaml/libyaml/releases/download/${LIBYAML_VERSION}/yaml-${LIBYAML_VERSION}.tar.gz" -o libyaml.tar.gz
tar xzf libyaml.tar.gz
rm -rf libyaml-src
mv "yaml-${LIBYAML_VERSION}" libyaml-src
cd libyaml-src

./configure --prefix="${BUILD_DIR}/libyaml/${ARCH}" --disable-static --enable-shared
make -j"$(sysctl -n hw.ncpu)" && make install

cd "${BUILD_DIR}"
echo "  libyaml compiled to ${BUILD_DIR}/libyaml/${ARCH}/"
