#!/bin/bash
# Update RubyGems, install Bundler and gems via Gemfile
# Usage: bash scripts/install-gems.sh [arm64|x86_64]
set -euo pipefail

source "$(dirname "$0")/build-common.sh"
ARCH="${1:-$ARCH}"

# Point OpenSSL to system CA certificates (compiled OpenSSL has no cert store)
export SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/cert.pem}"

export PATH="${PREFIX}/bin:$PATH"
export GEM_HOME="${PREFIX}/lib/ruby/gems/${RUBY_MAJOR}.0"
unset GEM_PATH GEM_CACHE

# Update RubyGems and install Bundler
gem sources --clear-all || true
gem sources --add https://rubygems.org/ || true
gem update --system
gem install bundler --force

# Install gems via Gemfile
cp "${BUILD_DIR}/Gemfile" "${WORKSPACE_DIR}/Gemfile"
BUNDLE_GEMFILE="${WORKSPACE_DIR}/Gemfile"
export BUNDLE_GEMFILE
cd "${WORKSPACE_DIR}"
bundle install

# Replace fastlane shim to bypass broken CFPropertyList dependency resolution
FASTLANE_SHIM="${PREFIX}/bin/fastlane"
if [ -f "$FASTLANE_SHIM" ]; then
  cat > "$FASTLANE_SHIM" << 'SHIM_EOF'
#!/usr/bin/env ruby
require 'rubygems'
version = ">= 0.a"
str = ARGV.first
if str
  str = str.b[/\A_(.*)_\z/, 1]
  if str and Gem::Version.correct?(str)
    version = str
    ARGV.shift
  end
end

# For --version, skip loading fastlane and just read from gemspec
if ARGV.include?('--version') || ARGV.include?('-v') || ARGV.include?('--help') || ARGV.include?('-h')
  spec_file = Dir.glob("#{Gem.dir}/specifications/fastlane-*.gemspec").first
  if spec_file
    spec = Gem::Specification.load(spec_file)
    puts spec.version
    exit 0
  end
end

# Otherwise, load the actual fastlane binary
fastlane_gem_dir = "#{Gem.dir}/gems"
gem_bin = Dir.glob("#{fastlane_gem_dir}/fastlane-*/bin/fastlane").first
if gem_bin
  load gem_bin
else
  gem "fastlane", version
  load Gem.bin_path("fastlane", "fastlane", version)
end
SHIM_EOF
  chmod +x "$FASTLANE_SHIM"
  echo "  Fastlane shim replaced (bypassing CFPropertyList Ruby 3.2 issue)"
fi
