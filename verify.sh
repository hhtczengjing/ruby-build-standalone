#!/bin/bash
# Verify the standalone Ruby environment works correctly

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUBY_HOME="$SCRIPT_DIR/ruby-standalone"
RUBY_BIN="$RUBY_HOME/bin"
PASS=0
FAIL=0

# Clear other Ruby managers' environment variables
unset GEM_HOME GEM_PATH GEM_CACHE
unset BUNDLE_PATH BUNDLE_GEMFILE
unset MY_RUBY_HOME RUBY_VERSION GEM_ROOT

# Dynamically detect arch triple (no longer hardcode darwin24)
RUBY_TRIPLE=$(ls "$RUBY_HOME/lib/ruby/3.2.0/" | grep -E "^(arm64|x86_64)-darwin" | head -1)
export RUBYLIB="$RUBY_HOME/lib/ruby/3.2.0/$RUBY_TRIPLE:$RUBY_HOME/lib/ruby/3.2.0:$RUBY_HOME/lib/ruby/site_ruby/3.2.0/$RUBY_TRIPLE:$RUBY_HOME/lib/ruby/site_ruby/3.2.0:$RUBY_HOME/lib/ruby/site_ruby:$RUBY_HOME/lib/ruby/vendor_ruby/3.2.0/$RUBY_TRIPLE:$RUBY_HOME/lib/ruby/vendor_ruby/3.2.0:$RUBY_HOME/lib/ruby/vendor_ruby"

# Set GEM_HOME to standalone directory
export GEM_HOME="$RUBY_HOME/lib/ruby/gems/3.2.0"

run() {
    (
        export PATH="$RUBY_BIN:$PATH"
        exec env -u GEM_PATH -u GEM_CACHE -u BUNDLE_PATH -u BUNDLE_GEMFILE -u MY_RUBY_HOME -u RUBY_VERSION -u GEM_ROOT -u RUBYLIB "$@"
    )
}

echo "=== Standalone Ruby Environment Verification ==="
echo ""

# Helper function
check() {
    local desc="$1"
    local result="$2"
    if [ "$result" -eq 0 ]; then
        echo "[PASS] $desc"
        ((PASS++))
    else
        echo "[FAIL] $desc"
        ((FAIL++))
    fi
}

# 1. Ruby binary exists
test -x "$RUBY_BIN/ruby"
check "Ruby binary exists" $?

# 2. Ruby version is 3.2.3
VERSION=$(run "$RUBY_BIN/ruby" --version 2>/dev/null | grep -o "3.2.3")
[ "$VERSION" = "3.2.3" ]
check "Ruby version is 3.2.3" $?

# 3. Fastlane binary exists
test -x "$RUBY_BIN/fastlane"
check "Fastlane binary exists" $?

# 4. Fastlane runs successfully
run "$RUBY_BIN/fastlane" --version >/dev/null 2>&1
check "Fastlane runs" $?

# 5. Bundle runs
run "$RUBY_BIN/bundle" --version >/dev/null 2>&1
check "Bundler runs" $?

# 6. CocoaPods binary exists
test -x "$RUBY_BIN/pod"
check "CocoaPods binary exists" $?

# 7. CocoaPods runs successfully
run "$RUBY_BIN/pod" --version >/dev/null 2>&1
check "CocoaPods runs" $?

# 8. Gems are installed inside standalone directory
test -d "$GEM_HOME" && test -n "$(ls "$GEM_HOME" 2>/dev/null)"
check "Gems installed in standalone directory ($GEM_HOME)" $?

# 9. No dependency on RVM/rbenv Ruby
OTOL=$(otool -L "$RUBY_HOME/lib/libruby.3.2.dylib" 2>/dev/null | grep -c "rvm\|rbenv")
[ "$OTOL" -eq 0 ]
check "No dependency on RVM/rbenv Ruby" $?

# 10. OpenSSL extension works
run "$RUBY_BIN/ruby" -ropenssl -e 'puts OpenSSL::OPENSSL_VERSION' >/dev/null 2>&1
check "OpenSSL extension works" $?

# 11. Shebang uses env ruby (not hardcoded path)
SHEBANG=$(head -1 "$RUBY_BIN/fastlane" 2>/dev/null)
echo "$SHEBANG" | grep -q "#!/usr/bin/env ruby"
check "Fastlane uses env ruby shebang" $?

# 12. No hardcoded Homebrew paths in dylib references
HOMEBREW_REFS=$(find "$RUBY_HOME" -name "*.dylib" -o -name "*.bundle" | while IFS= read -r f; do
  otool -L "$f" 2>/dev/null | grep "/opt/homebrew" || true
done | wc -l | tr -d ' ')
[ "$HOMEBREW_REFS" -eq 0 ]
check "No hardcoded Homebrew paths in dylib references" $?

# 13. openssl.bundle does not exist (statically linked into libruby)
test ! -f "$RUBY_HOME/lib/ruby/3.2.0/$RUBY_TRIPLE/openssl.bundle"
check "openssl.bundle not present (statically linked)" $?

# 14. psych.bundle does not exist (statically linked into libruby)
test ! -f "$RUBY_HOME/lib/ruby/3.2.0/$RUBY_TRIPLE/psych.bundle"
check "psych.bundle not present (statically linked)" $?

# 15. libruby references bundled OpenSSL and libyaml via @loader_path
LIBRUBY_REFS=$(otool -L "$RUBY_HOME/lib/libruby.3.2.dylib" 2>/dev/null | grep -c "@loader_path")
[ "$LIBRUBY_REFS" -ge 3 ]
check "libruby references bundled OpenSSL and libyaml ($LIBRUBY_REFS refs)" $?

# 16. Ruby binary uses @executable_path for libruby
otool -L "$RUBY_BIN/ruby" 2>/dev/null | grep "libruby" | grep -q "@executable_path"
check "Ruby binary uses @executable_path for libruby" $?

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
