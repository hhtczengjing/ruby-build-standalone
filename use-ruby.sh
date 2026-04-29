#!/bin/bash
# Portable wrapper for standalone Ruby environment
# Place this script next to the ruby-standalone/ directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUBY_HOME="$SCRIPT_DIR/ruby-standalone"

# Clear other Ruby managers' environment variables
unset GEM_HOME GEM_PATH GEM_CACHE
unset BUNDLE_PATH BUNDLE_GEMFILE
unset RUBYLIB
unset MY_RUBY_HOME RUBY_VERSION GEM_ROOT

# Prepend standalone Ruby to PATH
export PATH="$RUBY_HOME/bin:$PATH"

# If arguments provided, run them
if [ $# -gt 0 ]; then
    exec "$@"
fi

echo "Standalone Ruby + Fastlane environment activated"
echo "  Ruby:    $(ruby --version 2>/dev/null)"
echo "  Fastlane: $(fastlane --version 2>/dev/null | tail -1)"
echo "  GEM_HOME: $(gem env gemdir)"
