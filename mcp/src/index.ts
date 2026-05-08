import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child from "node:child_process";

// ── Configuration ──────────────────────────────────────────────────────────

const GITHUB_REPO = process.env.GITHUB_REPO ?? "hhtczengjing/ruby-build-standalone";
const DEFAULT_RUBY_VERSION = "3.2.3";
const DEFAULT_GEM_SOURCE = "https://gems.ruby-china.com";
const COMMAND_TIMEOUT_MS = 60_000;

const WORKSPACE_DIR = process.cwd();
const RUBY_STANDALONE_DIR = path.join(WORKSPACE_DIR, ".ruby_standalone");
const CACHE_DIR = path.join(RUBY_STANDALONE_DIR, "cache");
const RUBY_VERSIONS_DIR = path.join(RUBY_STANDALONE_DIR, "versions");

// Returns the root directory for a given Ruby version.
function getRubyDir(version: string): string {
  return path.join(RUBY_VERSIONS_DIR, version);
}

// Returns the bin directory for a given Ruby version.
function getRubyBinDir(version: string = DEFAULT_RUBY_VERSION): string {
  return path.join(getRubyDir(version), "bin");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function detectArch(): string {
  const rawArch = os.arch();
  // Node.js reports 'arm64' or 'x64'; normalize to artifact naming
  if (rawArch === "arm64") return "arm64";
  if (rawArch === "x64") return "x86_64";
  return rawArch;
}

function artifactName(version: string, arch: string): string {
  return `ruby_${version}_${arch}.tar.gz`;
}

function cachePath(version: string, arch: string): string {
  return path.join(CACHE_DIR, artifactName(version, arch));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isRubyReady(version: string = DEFAULT_RUBY_VERSION): boolean {
  const binDir = getRubyBinDir(version);
  return fs.existsSync(binDir) && fs.existsSync(path.join(binDir, "ruby"));
}

function getRubyVersion(version: string = DEFAULT_RUBY_VERSION): string | null {
  if (!isRubyReady(version)) return null;
  try {
    const result = child.execFileSync(path.join(getRubyBinDir(version), "ruby"), ["--version"], {
      encoding: "utf-8",
      env: cleanEnv(version),
    });
    const match = result.match(/^ruby (\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getFastlaneVersion(version: string = DEFAULT_RUBY_VERSION): string | null {
  if (!isRubyReady(version)) return null;
  try {
    const result = child.execFileSync(path.join(getRubyBinDir(version), "fastlane"), ["--version"], {
      encoding: "utf-8",
      env: cleanEnv(version),
    });
    const lines = result.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Returns the Ruby version to use for artifact naming and GitHub release lookup.
// Detects from the installed ruby binary first, falls back to DEFAULT_RUBY_VERSION.
function getRUBY_VERSION(): string {
  const detected = getRubyVersion();
  return detected ?? DEFAULT_RUBY_VERSION;
}

// Download a URL to a file path using curl (respects https_proxy/http_proxy env vars)
async function downloadWithCurl(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = child.spawn("curl", ["-fsSL", url, "-o", dest], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`curl failed with code ${code}: ${stderr}`));
    });
    proc.on("error", reject);
  });
}

function cleanEnv(version: string = DEFAULT_RUBY_VERSION): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Clear Ruby manager env vars (mirrors use-ruby.sh)
  delete env.GEM_HOME;
  delete env.GEM_PATH;
  delete env.GEM_CACHE;
  delete env.BUNDLE_PATH;
  delete env.BUNDLE_GEMFILE;
  delete env.RUBYLIB;
  delete env.MY_RUBY_HOME;
  delete env.RUBY_VERSION;
  delete env.GEM_ROOT;
  // Point OpenSSL to system CA certificates
  env.SSL_CERT_FILE = env.SSL_CERT_FILE || "/etc/ssl/cert.pem";
  // Set GEM_HOME to standalone gem directory
  const binDir = getRubyBinDir(version);
  env.GEM_HOME = path.join(getRubyDir(version), "lib", "ruby", "gems", "3.2.0");
  // Prepend standalone Ruby to PATH
  env.PATH = `${binDir}:${env.PATH}`;
  return env;
}

async function downloadFromGitHubRelease(artifact: string, dest: string): Promise<void> {
  ensureDir(CACHE_DIR);
  const tag = `ruby-${getRUBY_VERSION()}`;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`;
  console.error(`Fetching release info from ${url}`);

  // Use curl to fetch release JSON (respects proxy env vars)
  let releaseJson: string;
  try {
    releaseJson = child.execFileSync("curl", ["-fsSL", url], { encoding: "utf-8" });
  } catch (err) {
    throw new Error(
      `Failed to fetch release info from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const release = JSON.parse(releaseJson) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets.find((a) => a.name === artifact);
  if (!asset) {
    const available = release.assets.map((a) => a.name).join(", ");
    throw new Error(
      `Asset '${artifact}' not found in release '${release.tag_name}'. Available: ${available}`,
    );
  }
  console.error(`Downloading ${asset.browser_download_url}...`);
  await downloadWithCurl(asset.browser_download_url, dest);
  const stats = fs.statSync(dest);
  console.error(`Downloaded to ${dest} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

async function extractTarball(tarball: string, version: string): Promise<void> {
  const destDir = getRubyDir(version);
  // Remove existing extracted content if present
  if (fs.existsSync(path.join(destDir, "bin"))) {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
  }
  console.error(`Extracting ${tarball} to ${destDir}...`);
  return new Promise((resolve, reject) => {
    // --strip-components=1 removes the leading ruby-standalone/ directory from the archive
    const proc = child.spawn("tar", ["-xzf", tarball, "--strip-components=1", "-C", destDir], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code: number | null) => {
      if (code === 0) {
        console.error("Extraction complete.");
        resolve();
      } else reject(new Error(`tar failed with code ${code}: ${stderr}`));
    });
    proc.on("error", reject);
  });
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ruby-standalone",
  version: "1.0.0",
});

server.registerTool(
  "ruby_env_status",
  {
    title: "Ruby Environment Status",
    description:
      "Detects local CPU architecture, checks if the standalone Ruby environment is ready, " +
      "and reports cache status, Ruby version, and Fastlane version.",
    inputSchema: {},
  },
  async () => {
    const arch = detectArch();
    const version = getRUBY_VERSION();
    const artifact = artifactName(version, arch);
    const cached = fs.existsSync(cachePath(version, arch));
    const ready = isRubyReady();
    const rubyVer = getRubyVersion();
    const fastlaneVer = getFastlaneVersion();
    const lines = [
      `Architecture: ${arch}`,
      `Artifact: ${artifact}`,
      `Tarball cached: ${cached ? "yes" : "no"}`,
      `ruby-standalone/ ready: ${ready ? "yes" : "no"}`,
      `Ruby version: ${rubyVer ?? "not detected"}`,
      `Fastlane version: ${fastlaneVer ?? "not detected"}`,
    ];
    if (ready && rubyVer) {
      lines.push("", "Environment is ready to use.");
    } else {
      lines.push("", "Environment not ready. Use ruby_env_load to set it up.");
    }
    return {
      content: [
        {
          type: "text",
          text: lines.join("\n"),
        },
      ],
      structuredContent: {
        arch,
        artifact,
        cached,
        ready,
        rubyVersion: rubyVer,
        fastlaneVersion: fastlaneVer,
        cachePath: cachePath(version, arch),
        standaloneDir: RUBY_STANDALONE_DIR,
      },
    };
  },
);

server.registerTool(
  "ruby_env_load",
  {
    title: "Load Ruby Environment",
    description:
      "Downloads the Ruby standalone tarball from GitHub releases (if not cached), " +
      "extracts it, and prepares the environment. Returns the path and usage instructions.",
    inputSchema: {},
  },
  async () => {
    const arch = detectArch();
    const version = getRUBY_VERSION();
    const artifact = artifactName(version, arch);
    const cacheFile = cachePath(version, arch);
    const rubyDir = getRubyDir(version);
    const rubyBinDir = getRubyBinDir(version);

    // Check if already extracted and ready
    if (isRubyReady(version)) {
      const rubyVer = getRubyVersion(version);
      const fastlaneVer = getFastlaneVersion(version);
      return {
        content: [
          {
            type: "text",
            text: [
              `Ruby environment already extracted at ${rubyDir}`,
              `  Ruby: ${rubyVer ?? "unknown"}`,
              `  Fastlane: ${fastlaneVer ?? "unknown"}`,
              "",
              "Use ruby_env_run to execute commands.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          path: rubyDir,
          rubyVersion: rubyVer,
          fastlaneVersion: fastlaneVer,
          source: "already-extracted",
        },
      };
    }

    // Download if not cached
    if (!fs.existsSync(cacheFile)) {
      await downloadFromGitHubRelease(artifact, cacheFile);
    } else {
      console.error(`Using cached tarball: ${cacheFile}`);
    }

    // Extract
    await extractTarball(cacheFile, version);
    const rubyVer = getRubyVersion(version);
    const fastlaneVer = getFastlaneVersion(version);
    return {
      content: [
        {
          type: "text",
          text: [
            `Ruby environment loaded at ${rubyDir}`,
            `  Ruby: ${rubyVer ?? "unknown"}`,
            `  Fastlane: ${fastlaneVer ?? "unknown"}`,
            "",
            "Usage:",
            "  Use ruby_env_run to execute commands within this environment.",
            `  PATH will be prepended with ${rubyBinDir}`,
            "  Ruby manager env vars are cleared automatically.",
          ].join("\n"),
        },
      ],
      structuredContent: {
        path: rubyDir,
        rubyVersion: rubyVer,
        fastlaneVersion: fastlaneVer,
        source: fs.existsSync(cacheFile) ? "cache" : "downloaded",
        binPath: rubyBinDir,
      },
    };
  },
);

server.registerTool(
  "ruby_env_run",
  {
    title: "Execute Ruby Command",
    description:
      "Executes a command within the standalone Ruby environment. " +
      "Automatically sets PATH and unsets Ruby manager environment variables. " +
      "Returns stdout, stderr, and exit code.",
    inputSchema: {
      command: z
        .string()
        .describe(
          "The command to execute, e.g. 'ruby -v', 'fastlane --version', 'bundle install'",
        ),
    },
  },
  async ({ command }) => {
    if (!isRubyReady()) {
      return {
        content: [
          {
            type: "text",
            text: [
              "Error: Ruby environment is not set up.",
              "Use ruby_env_load first to download and extract the standalone Ruby environment.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          exitCode: 1,
          stdout: "",
          stderr: "Ruby environment not ready",
        },
        isError: true,
      };
    }
    try {
      const result = child.spawn(command, {
        shell: true,
        env: cleanEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      result.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      result.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      const exitCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          result.kill("SIGTERM");
          reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`));
        }, COMMAND_TIMEOUT_MS);
        result.on("close", (code: number | null) => { clearTimeout(timer); resolve(code ?? 1); });
        result.on("error", (err) => { clearTimeout(timer); reject(err); });
      });
      const outputLines: string[] = [];
      if (stdout.trim()) outputLines.push(stdout.trim());
      if (stderr.trim()) outputLines.push(stderr.trim());
      outputLines.push(`\nExit code: ${exitCode}`);
      return {
        content: [
          {
            type: "text",
            text: outputLines.join("\n"),
          },
        ],
        structuredContent: {
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
        isError: exitCode !== 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing command: ${message}`,
          },
        ],
        structuredContent: {
          exitCode: -1,
          stdout: "",
          stderr: message,
        },
        isError: true,
      };
    }
  },
);

server.registerTool(
  "ruby_env_gem_install",
  {
    title: "Install Gem",
    description:
      "Installs a specified version of a gem package in the standalone Ruby environment. " +
      "Returns the installation result including the installed version and any error messages.",
    inputSchema: {
      gem_name: z.string().describe("The name of the gem to install, e.g. 'fastlane', 'bundler'"),
      version: z
        .string()
        .optional()
        .describe("The version to install, e.g. '2.233.1'. Omit to install the latest version."),
      source: z
        .string()
        .optional()
        .describe("The gem source URL. Defaults to https://gems.ruby-china.com."),
    },
  },
  async ({ gem_name, version, source }) => {
    if (!isRubyReady()) {
      return {
        content: [
          {
            type: "text",
            text: [
              "Error: Ruby environment is not set up.",
              "Use ruby_env_load first to download and extract the standalone Ruby environment.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          success: false,
          gemName: gem_name,
          version: version,
        },
        isError: true,
      };
    }
    const gemArgs = ["install", gem_name];
    if (version) gemArgs.push("-v", version);
    gemArgs.push("--source", source ?? DEFAULT_GEM_SOURCE);

    try {
      const result = child.spawn(path.join(getRubyBinDir(), "gem"), gemArgs, {
        env: cleanEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      result.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      result.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      const exitCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          result.kill("SIGTERM");
          reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`));
        }, COMMAND_TIMEOUT_MS);
        result.on("close", (code: number | null) => { clearTimeout(timer); resolve(code ?? 1); });
        result.on("error", (err) => { clearTimeout(timer); reject(err); });
      });
      const outputLines: string[] = [];
      if (stdout.trim()) outputLines.push(stdout.trim());
      if (stderr.trim()) outputLines.push(stderr.trim());
      outputLines.push(`\nExit code: ${exitCode}`);
      // Try to extract the installed version from output (e.g. "Successfully installed rake-13.4.2")
      const installedMatch = stdout.match(/Successfully installed\s+\S+-(\d+\S*)/);
      const installedVersion = installedMatch ? installedMatch[1] : null;
      return {
        content: [
          {
            type: "text",
            text: outputLines.join("\n"),
          },
        ],
        structuredContent: {
          success: exitCode === 0,
          gemName: gem_name,
          version: installedVersion ?? version,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
        isError: exitCode !== 0,
      };
    } catch (error: unknown) {
      // exec throws on non-zero exit code, with the error containing stdout/stderr
      const errMsg = error instanceof Error ? error.message : String(error);
      const isExecError = error instanceof Error && "stdout" in error;
      const execStdout =
        isExecError && typeof (error as Record<string, unknown>).stdout === "string"
          ? ((error as Record<string, unknown>).stdout as string)
          : "";
      const execStderr =
        isExecError && typeof (error as Record<string, unknown>).stderr === "string"
          ? ((error as Record<string, unknown>).stderr as string)
          : "";
      const exitCode =
        isExecError && typeof (error as Record<string, unknown>).code === "number"
          ? ((error as Record<string, unknown>).code as number)
          : 1;
      const installedMatch = execStdout.match(/Successfully installed\s+(\S+)/);
      const installedVersion = installedMatch ? installedMatch[1] : null;
      const outputLines: string[] = [];
      if (execStdout.trim()) outputLines.push(execStdout.trim());
      if (execStderr.trim()) outputLines.push(execStderr.trim());
      outputLines.push(`\nExit code: ${exitCode}`);
      return {
        content: [
          {
            type: "text",
            text: outputLines.join("\n"),
          },
        ],
        structuredContent: {
          success: exitCode === 0,
          gemName: gem_name,
          version: installedVersion ?? version,
          error: errMsg,
          exitCode,
          stdout: execStdout.trim(),
          stderr: execStderr.trim(),
        },
        isError: true,
      };
    }
  },
);

// ── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ruby-standalone MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
