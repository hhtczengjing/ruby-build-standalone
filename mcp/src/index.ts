import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child from "node:child_process";
import util from "node:util";

const exec = util.promisify(child.exec);

// ── Configuration ──────────────────────────────────────────────────────────

const GITHUB_REPO = process.env.GITHUB_REPO ?? "hhtczengjing/ruby-build-standalone";
const DEFAULT_RUBY_VERSION = "3.2.3";
const FASTLANE_VERSION = process.env.FASTLANE_VERSION ?? "2.233.1";
const DEFAULT_GEM_SOURCE = "https://gems.ruby-china.com";

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.join(PROJECT_ROOT, "cache");
const RUBY_STANDALONE_DIR = path.join(PROJECT_ROOT, "ruby-standalone");
const RUBY_BIN = path.join(RUBY_STANDALONE_DIR, "bin");

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

function isRubyReady(): boolean {
  return fs.existsSync(RUBY_BIN) && fs.existsSync(path.join(RUBY_BIN, "ruby"));
}

function getRubyVersion(): string | null {
  if (!isRubyReady()) return null;
  try {
    const result = child.execFileSync(path.join(RUBY_BIN, "ruby"), ["--version"], {
      encoding: "utf-8",
      env: cleanEnv(),
    });
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getFastlaneVersion(): string | null {
  if (!isRubyReady()) return null;
  try {
    const result = child.execFileSync(path.join(RUBY_BIN, "fastlane"), ["--version"], {
      encoding: "utf-8",
      env: cleanEnv(),
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
  await exec(`curl -fsSL "${url}" -o "${dest}"`);
}

function cleanEnv(): NodeJS.ProcessEnv {
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
  // Prepend standalone Ruby to PATH
  env.PATH = `${RUBY_BIN}:${env.PATH}`;
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

async function extractTarball(tarball: string, destDir: string): Promise<void> {
  // Remove existing directory to avoid conflicts
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  console.error(`Extracting ${tarball} to ${path.dirname(destDir)}...`);
  await exec(`tar -xzf "${tarball}" -C "${path.dirname(destDir)}"`);
  console.error("Extraction complete.");
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ruby-fastlane",
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

    // Check if already extracted and ready
    if (isRubyReady()) {
      const rubyVer = getRubyVersion();
      const fastlaneVer = getFastlaneVersion();
      return {
        content: [
          {
            type: "text",
            text: [
              `Ruby environment already extracted at ${RUBY_STANDALONE_DIR}`,
              `  Ruby: ${rubyVer ?? "unknown"}`,
              `  Fastlane: ${fastlaneVer ?? "unknown"}`,
              "",
              "Use ruby_env_run to execute commands.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          path: RUBY_STANDALONE_DIR,
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
    await extractTarball(cacheFile, RUBY_STANDALONE_DIR);
    const rubyVer = getRubyVersion();
    const fastlaneVer = getFastlaneVersion();
    return {
      content: [
        {
          type: "text",
          text: [
            `Ruby environment loaded at ${RUBY_STANDALONE_DIR}`,
            `  Ruby: ${rubyVer ?? "unknown"}`,
            `  Fastlane: ${fastlaneVer ?? "unknown"}`,
            "",
            "Usage:",
            "  Use ruby_env_run to execute commands within this environment.",
            `  PATH will be prepended with ${RUBY_BIN}`,
            "  Ruby manager env vars are cleared automatically.",
          ].join("\n"),
        },
      ],
      structuredContent: {
        path: RUBY_STANDALONE_DIR,
        rubyVersion: rubyVer,
        fastlaneVersion: fastlaneVer,
        source: fs.existsSync(cacheFile) ? "cache" : "downloaded",
        binPath: RUBY_BIN,
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
      result.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      result.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      const exitCode = await new Promise<number>((resolve, reject) => {
        result.on("close", (code: number | null) => resolve(code ?? 1));
        result.on("error", reject);
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
    const versionFlag = version ? `-v ${version}` : "";
    const gemSource = source ?? DEFAULT_GEM_SOURCE;
    const command = `gem install ${gem_name} ${versionFlag} --source ${gemSource}`.trim();
    try {
      const { stdout, stderr } = await exec(command, { env: cleanEnv() });
      const exitCode = 0;
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
          success: true,
          gemName: gem_name,
          version: installedVersion ?? version,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
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
  console.error("ruby-fastlane MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
