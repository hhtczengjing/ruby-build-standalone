# ruby-build-standalone

Produce redistributable, self-contained builds of Ruby with Fastlane pre-installed.

## Overview

This project builds a portable Ruby environment that requires no RVM, rbenv, or other Ruby managers. The standalone package includes:

- **Ruby 3.2.3** — compiled from source with shared library support
- **Fastlane 2.233.0** — pre-installed and ready to use
- **Bundler** — for dependency management
- **OpenSSL 3** — for secure network operations

The resulting `ruby-standalone/` directory can be moved anywhere and used immediately on macOS (`arm64` and `x86_64`).

## Quick Start

### Download a Release

Download the pre-built tarball from [Releases](https://github.com/your-org/ruby-build-standalone/releases) for your architecture:

```bash
# Download and extract
tar xzf ruby_3.2.3_arm64.tar.gz   # for Apple Silicon
tar xzf ruby_3.2.3_x86_64.tar.gz  # for Intel Macs
```

### Use the Standalone Ruby

Run the `use-ruby.sh` script to activate the environment:

```bash
./use-ruby.sh                     # enter the interactive shell
./use-ruby.sh ruby --version      # run a single command
./use-ruby.sh fastlane --version  # check fastlane version
```

The script prepends the standalone Ruby to your `PATH` and clears conflicting environment variables from other Ruby managers.

### Verify the Build

```bash
./verify.sh
```

This runs 9 checks including:

- Ruby binary and version
- Fastlane and Bundler availability
- OpenSSL extension functionality
- No dependency on RVM/rbenv
- Gems installed within the standalone directory

## Building from Source

### Prerequisites

```bash
brew install autoconf automake libtool pkg-config openssl@3 readline libyaml libffi
```

### Build

```bash
RUBY_VERSION=3.2.3
FASTLANE_VERSION=2.233.0

# Download and extract Ruby source
curl -fsSL "https://cache.ruby-lang.org/pub/ruby/${RUBY_VERSION%.*}/ruby-${RUBY_VERSION}.tar.gz" -o ruby.tar.gz
tar xzf ruby.tar.gz

# Configure and build
cd ruby-${RUBY_VERSION}
./configure \
  --prefix="${PWD}/../ruby-standalone" \
  --with-openssl-dir=$(brew --prefix openssl@3) \
  --disable-install-doc \
  --enable-shared
make -j$(sysctl -n hw.ncpu)
make install

# Update RubyGems and install Fastlane
export PATH="${PWD}/../ruby-standalone/bin:$PATH"
gem update --system
gem install bundler
export GEM_HOME="${PWD}/../ruby-standalone/lib/ruby/gems/3.2.0"
gem install fastlane -v $FASTLANE_VERSION --no-document

# Fix shebangs to use env
RUBY_BIN="${PWD}/../ruby-standalone/bin"
for f in "$RUBY_BIN"/*; do
  if [ -f "$f" ] && [ -x "$f" ] && head -1 "$f" | grep -q "ruby"; then
    sed -i '' '1s|^#!/.*ruby|#!/usr/bin/env ruby|' "$f"
  fi
done
```

### Package

```bash
tar czf ruby_${RUBY_VERSION}_$(uname -m).tar.gz -C .. ruby-standalone/
```

## CI/CD

This project uses GitHub Actions to build and release:

- **Push to `main`/`master`** or open a PR → builds both `arm64` and `x86_64` artifacts
- **Manual dispatch** → optionally specify custom Ruby/Fastlane versions
- **Tag push** (`refs/tags/`) → creates a GitHub Release with attached tarballs

See [build-ruby-standalone.yml](.github/workflows/build-ruby-standalone.yml) for details.

## Project Structure

```
.
├── .github/workflows/
│   └── build-ruby-standalone.yml   # CI/CD workflow
├── use-ruby.sh                     # Environment activation script
├── verify.sh                       # Build verification script (9 checks)
├── LICENSE                         # MIT License
└── README.md
```

## License

MIT — see [LICENSE](LICENSE) for details.
