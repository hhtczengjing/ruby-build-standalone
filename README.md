# ruby-build-standalone

Produce redistributable, self-contained builds of Ruby with Fastlane and CocoaPods pre-installed.

## Overview

This project builds a portable Ruby environment that requires no RVM, rbenv, or other Ruby managers. The standalone package includes:

- **Ruby 3.2.3** — compiled from source with shared library support
- **Fastlane 2.233.1** — pinned in Gemfile, pre-installed and ready to use
- **CocoaPods 1.16.2** — pinned in Gemfile, pre-installed and ready to use
- **Bundler** — for dependency management
- **OpenSSL 3.2.3** — compiled from source and statically linked into libruby
- **libyaml 0.2.5** — compiled from source and statically linked into libruby

The resulting `ruby-standalone/` directory can be moved anywhere and used immediately on macOS (`arm64` and `x86_64`).

## Quick Start

### Download a Release

Download the pre-built tarball from [Releases](https://github.com/hhtczengjing/ruby-build-standalone/releases) for your architecture:

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
./use-ruby.sh pod --version       # check cocoapods version
```

The script prepends the standalone Ruby to your `PATH` and clears conflicting environment variables from other Ruby managers.

### Verify the Build

```bash
./verify.sh
```

This runs 16 checks including:

- Ruby binary and version
- Fastlane, CocoaPods, and Bundler availability
- OpenSSL extension functionality
- No dependency on RVM/rbenv
- Gems installed within the standalone directory
- openssl/psych statically linked (no .bundle files)
- Dylib references use @loader_path/@executable_path
- No hardcoded Homebrew paths in dylibs

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
3. Update RubyGems, install Bundler, and install gems via `Gemfile`
4. Copy dylibs and fix library paths with `install_name_tool`
5. Run verification (16 checks)
6. Package the result as a tarball

### Package

```bash
tar czf ruby_${RUBY_VERSION}_$(uname -m).tar.gz -C .. ruby-standalone/
```

## CI/CD

This project uses GitHub Actions to build and release:

- **Manual dispatch** (`workflow_dispatch`) → optionally specify custom Ruby/OpenSSL/libyaml versions
- **Release published** → creates a GitHub Release with attached tarballs

Each build compiles both `arm64` (macos-latest) and `x86_64` (macos-26-intel) in parallel.

See [build-ruby-standalone.yml](.github/workflows/build-ruby-standalone.yml) for details.

## MCP Server

The project includes a Model Context Protocol (MCP) server (`ruby-standalone`) that allows AI assistants to interact with the standalone Ruby environment.

### Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `ruby_env_status` | Check Ruby environment status | — |
| `ruby_env_load` | Download and extract the standalone Ruby environment | — |
| `ruby_env_run` | Execute a command within the Ruby environment | `command` (string) |
| `ruby_env_gem_install` | Install a gem package | `gem_name` (string), `version` (optional), `source` (optional, defaults to `https://gems.ruby-china.com`) |

### Usage

Configure your MCP client to connect to the server:

```json
{
  "mcpServers": {
    "ruby-standalone": {
      "command": "node",
      "args": ["mcp/dist/index.js"]
    }
  }
}
```

The MCP server creates a `.ruby_standalone` directory in the **current working directory** of the MCP client. All Ruby environment operations (cache, extraction, gem installation) are scoped to that directory.

### Build

```bash
cd mcp
npm install
npm run build
```

## Project Structure

```
.
├── .github/workflows/
│   └── build-ruby-standalone.yml   # CI/CD workflow
├── mcp/
│   ├── src/index.ts                # MCP server implementation
│   ├── dist/index.js               # Compiled MCP server
│   └── package.json                # MCP dependencies
├── mcp-call.mjs                    # MCP server test/demo script
├── scripts/
│   ├── build-common.sh             # Shared configuration (versions, paths)
│   ├── build-openssl.sh            # Compile OpenSSL from source
│   ├── build-libyaml.sh            # Compile libyaml from source
│   ├── build-ruby.sh               # Download and compile Ruby
│   ├── install-gems.sh             # Update RubyGems, install gems
│   ├── fix-dylibs.sh               # Copy dylibs and fix install_name paths
│   └── package.sh                  # Fix shebangs, verify, package
├── build.sh                        # Main build orchestrator
├── use-ruby.sh                     # Environment activation script
├── verify.sh                       # Build verification script (16 checks)
├── Gemfile                         # Ruby gem dependencies
├── LICENSE                         # MIT License
└── README.md
```

## License

MIT — see [LICENSE](LICENSE) for details.
