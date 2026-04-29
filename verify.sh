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
unset RUBYLIB
unset MY_RUBY_HOME RUBY_VERSION GEM_ROOT

# Set GEM_HOME to standalone directory
export GEM_HOME="$RUBY_HOME/lib/ruby/gems/3.2.0"

run() {
    env -u GEM_PATH -u GEM_CACHE -u BUNDLE_PATH -u BUNDLE_GEMFILE -u RUBYLIB -u MY_RUBY_HOME -u RUBY_VERSION -u GEM_ROOT "$@"
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

# 6. Gems are installed inside standalone directory
test -d "$GEM_HOME" && test -n "$(ls "$GEM_HOME" 2>/dev/null)"
check "Gems installed in standalone directory ($GEM_HOME)" $?

# 7. No dependency on RVM/rbenv Ruby
OTOL=$(otool -L "$RUBY_HOME/lib/libruby.3.2.dylib" 2>/dev/null | grep -c "rvm\|rbenv")
[ "$OTOL" -eq 0 ]
check "No dependency on RVM/rbenv Ruby" $?

# 8. OpenSSL extension works
run "$RUBY_BIN/ruby" -ropenssl -e 'puts OpenSSL::OPENSSL_VERSION' >/dev/null 2>&1
check "OpenSSL extension works" $?

# 9. Shebang uses env ruby (not hardcoded path)
SHEBANG=$(head -1 "$RUBY_BIN/fastlane" 2>/dev/null)
echo "$SHEBANG" | grep -q "#!/usr/bin/env ruby"
check "Fastlane uses env ruby shebang" $?

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
