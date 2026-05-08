#!/bin/bash
# Copy dylibs to standalone directory and fix dylib paths
# Usage: bash scripts/fix-dylibs.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

# Copy OpenSSL and libyaml dylibs to ruby-standalone/
mkdir -p "${PREFIX}/openssl/${ARCH}/lib" "${PREFIX}/libyaml/${ARCH}/lib"
cp "${WORKSPACE_DIR}/openssl/${ARCH}/lib/libssl.3.dylib" "${PREFIX}/openssl/${ARCH}/lib/"
cp "${WORKSPACE_DIR}/openssl/${ARCH}/lib/libcrypto.3.dylib" "${PREFIX}/openssl/${ARCH}/lib/"
cp "${WORKSPACE_DIR}/libyaml/${ARCH}/lib/libyaml-0.2.dylib" "${PREFIX}/libyaml/${ARCH}/lib/"
echo "  Copied dylibs to standalone directory"

# Set install names for bundled dylibs
install_name_tool -id "@loader_path/libssl.3.dylib" "${PREFIX}/openssl/${ARCH}/lib/libssl.3.dylib"
install_name_tool -id "@loader_path/libcrypto.3.dylib" "${PREFIX}/openssl/${ARCH}/lib/libcrypto.3.dylib"
install_name_tool -id "@loader_path/libyaml-0.2.dylib" "${PREFIX}/libyaml/${ARCH}/lib/libyaml-0.2.dylib"

# Fix libssl -> libcrypto reference
install_name_tool -change "@rpath/libcrypto.3.dylib" "@loader_path/libcrypto.3.dylib" \
  "${PREFIX}/openssl/${ARCH}/lib/libssl.3.dylib" 2>/dev/null || true
install_name_tool -change "${WORKSPACE_DIR}/openssl/${ARCH}/lib/libcrypto.3.dylib" "@loader_path/libcrypto.3.dylib" \
  "${PREFIX}/openssl/${ARCH}/lib/libssl.3.dylib" 2>/dev/null || true

# Fix libruby dylib references to use @loader_path for internal openssl/libyaml
LIBRUBY="${PREFIX}/lib/libruby.3.2.dylib"
for dylib_path in "${WORKSPACE_DIR}/openssl/${ARCH}/lib/libssl.3.dylib" \
                  "${WORKSPACE_DIR}/openssl/${ARCH}/lib/libcrypto.3.dylib"; do
  libname="$(basename "$dylib_path")"
  install_name_tool -change "$dylib_path" "@loader_path/../openssl/${ARCH}/lib/$libname" "$LIBRUBY" 2>/dev/null || true
  install_name_tool -change "@rpath/$libname" "@loader_path/../openssl/${ARCH}/lib/$libname" "$LIBRUBY" 2>/dev/null || true
done
# Fix libyaml separately (different target path)
install_name_tool -change "${WORKSPACE_DIR}/libyaml/${ARCH}/lib/libyaml-0.2.dylib" "@loader_path/../libyaml/${ARCH}/lib/libyaml-0.2.dylib" "$LIBRUBY" 2>/dev/null || true
install_name_tool -change "@rpath/libyaml-0.2.dylib" "@loader_path/../libyaml/${ARCH}/lib/libyaml-0.2.dylib" "$LIBRUBY" 2>/dev/null || true
# Also fix if it was previously incorrectly pointed to openssl path
install_name_tool -change "@loader_path/../openssl/${ARCH}/lib/libyaml-0.2.dylib" "@loader_path/../libyaml/${ARCH}/lib/libyaml-0.2.dylib" "$LIBRUBY" 2>/dev/null || true
echo "  Fixed libruby dylib references"

# Fix ruby binary to use @executable_path for libruby
install_name_tool -change "${PREFIX}/lib/libruby.3.2.dylib" "@executable_path/../lib/libruby.3.2.dylib" "${PREFIX}/bin/ruby" 2>/dev/null || true
install_name_tool -id "@executable_path/../lib/libruby.3.2.dylib" "$LIBRUBY" 2>/dev/null || true
echo "  Fixed ruby binary libruby reference"

# Fix hardcoded CI runner absolute paths in dylib files
find "$PREFIX" -name "*.dylib" | while IFS= read -r f; do
  if otool -L "$f" 2>/dev/null | grep -q "runner/work"; then
    install_name_tool -change "$LIBRUBY" "@rpath/libruby.3.2.dylib" "$f" 2>/dev/null || true
  fi
done
echo "  Dylib paths fixed"
