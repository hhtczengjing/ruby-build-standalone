# ruby-build-standalone

Produce redistributable, self-contained builds of Ruby with Fastlane pre-installed.

## Overview

This project builds a portable Ruby environment that requires no RVM, rbenv, or other Ruby managers. The standalone package includes:

- **Ruby 3.2.3** — compiled from source with shared library support
- **Fastlane 2.233.0** — pre-installed and ready to use
- **Bundler** — for dependency management
- **OpenSSL 3** — compiled from source and statically linked into libruby

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

This runs 14 checks including:

- Ruby binary and version
- Fastlane and Bundler availability
- OpenSSL extension functionality
- No dependency on RVM/rbenv
- Gems installed within the standalone directory
- openssl/psych statically linked (no .bundle files)
- Dylib references use @loader_path/@executable_path

## Building from Source

### Prerequisites

Only basic build tools are needed — OpenSSL and libyaml are compiled from source:

```bash
brew install autoconf automake libtool pkg-config
```

### Build

The simplest way is to run `build.sh`:

```bash
./build.sh          # builds for current architecture
./build.sh arm64    # explicitly build for Apple Silicon
./build.sh x86_64   # explicitly build for Intel
```

This will:
1. Compile OpenSSL 3 and libyaml from source
2. Download and compile Ruby with `--with-static-linked-ext`
3. Install Fastlane
4. Bundle dylibs with proper @loader_path references
5. Run verification (14 checks)
6. Package the result as a tarball

### Manual Build

```bash
RUBY_VERSION=3.2.3
FASTLANE_VERSION=2.233.0
ARCH=$(uname -m)

# 1. Compile OpenSSL from source
curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-3.2.3/openssl-3.2.3.tar.gz" -o openssl.tar.gz
tar xzf openssl.tar.gz && cd openssl-3.2.3
./Configure "darwin64-${ARCH}-cc" --prefix="$PWD/../openssl/${ARCH}" shared no-docs no-tests
make -j$(sysctl -n hw.ncpu) && make install_sw

# 2. Compile libyaml from source
curl -fsSL "https://github.com/yaml/libyaml/releases/download/0.2.5/yaml-0.2.5.tar.gz" -o libyaml.tar.gz
tar xzf libyaml.tar.gz && cd yaml-0.2.5
./configure --prefix="$PWD/../libyaml/${ARCH}" --disable-static --enable-shared
make -j$(sysctl -n hw.ncpu) && make install

# 3. Configure and build Ruby
cd ruby-${RUBY_VERSION}
./configure \
  --prefix="${PWD}/../ruby-standalone" \
  --with-openssl-dir="${PWD}/../openssl/${ARCH}" \
  --with-libyaml-dir="${PWD}/../libyaml/${ARCH}" \
  --with-static-linked-ext --with-ext=openssl,psych,+ \
  --enable-load-relative --enable-rpath --enable-shared \
  --disable-install-doc
make -j$(sysctl -n hw.ncpu)
make install

# 4. Install gems and fix dylib paths (see build.sh for full details)
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
├── build.sh                        # Build script (compiles all deps from source)
├── use-ruby.sh                     # Environment activation script
├── verify.sh                       # Build verification script (14 checks)
├── LICENSE                         # MIT License
└── README.md
```

## License

MIT — see [LICENSE](LICENSE) for details.
