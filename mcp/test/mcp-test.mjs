import child from "node:child_process";
import path from "node:path";

const server = child.spawn("node", [path.resolve(import.meta.dirname, "../dist/index.js")], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: path.resolve(import.meta.dirname, "../.."),  // repo root
});

let id = 0;
let testCount = 0;
let passCount = 0;
let failCount = 0;

const tests = [
  { name: "1. ruby_env_status", method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } },
  { name: "1. ruby_env_status (tool call)", method: "tools/call", params: { name: "ruby_env_status", arguments: {} } },
  { name: "2. ruby_env_load", method: "tools/call", params: { name: "ruby_env_load", arguments: {} } },
  { name: "3. ruby_env_run (ruby -v)", method: "tools/call", params: { name: "ruby_env_run", arguments: { command: "ruby --version" } } },
  { name: "3. ruby_env_run (fastlane --version)", method: "tools/call", params: { name: "ruby_env_run", arguments: { command: "fastlane --version" } } },
  { name: "3. ruby_env_run (pod --version)", method: "tools/call", params: { name: "ruby_env_run", arguments: { command: "pod --version" } } },
  { name: "3. ruby_env_run (gem list)", method: "tools/call", params: { name: "ruby_env_run", arguments: { command: "gem list --local" } } },
  { name: "4. ruby_env_gem_install (rake)", method: "tools/call", params: { name: "ruby_env_gem_install", arguments: { gem_name: "rake", version: "13.1.0", source: "https://gems.ruby-china.com" } } },
];

let stepIndex = 0;

function send(name, method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params });
  console.error(`\n\x1b[33m[TEST ${name}]\x1b[0m → ${method}`);
  server.stdin.write(msg + "\n");
}

function markResult(name, success, detail) {
  testCount++;
  if (success) { passCount++; console.error(`\x1b[32m[PASS] ${name}\x1b[0m`); }
  else { failCount++; console.error(`\x1b[31m[FAIL] ${name}\x1b[0m: ${detail}`); }
}

server.stdout.on("data", (data) => {
  const lines = data.toString().trim().split("\n");
  for (const line of lines) {
    if (!line) continue;
    try {
      const resp = JSON.parse(line);
      if (resp.result === undefined && resp.error === undefined) continue;

      const currentTest = tests[stepIndex - 1];
      if (!currentTest) continue;

      if (resp.error) {
        markResult(currentTest.name, false, resp.error.message);
      } else {
        // Check tool call results
        if (currentTest.method === "tools/call") {
          const toolResult = resp.result?.content?.[0]?.text;
          const structured = resp.result?.structuredContent;
          const isError = resp.result?.isError;

          if (currentTest.name === "1. ruby_env_status (tool call)") {
            const ok = structured && structured.arch && structured.ready !== undefined;
            markResult(currentTest.name, ok, toolResult);
          } else if (currentTest.name === "2. ruby_env_load") {
            const ok = structured && (structured.path || structured.source);
            markResult(currentTest.name, ok, toolResult);
          } else if (currentTest.name.startsWith("3. ruby_env_run")) {
            const ok = !isError && structured && structured.exitCode === 0;
            markResult(currentTest.name, ok, `exitCode=${structured?.exitCode}, stderr=${structured?.stderr}`);
          } else if (currentTest.name === "4. ruby_env_gem_install (rake)") {
            const ok = structured && structured.success;
            markResult(currentTest.name, ok, `success=${structured?.success}, error=${structured?.error}`);
          } else {
            markResult(currentTest.name, true, "");
          }
        } else {
          // initialize response
          markResult(currentTest.name, !!resp.result, "");
        }
      }

      // Schedule next test
      if (stepIndex < tests.length) {
        const next = tests[stepIndex];
        stepIndex++;
        setTimeout(() => {
          send(next.name, next.method, next.params);
        }, 1000);
      } else {
        // All tests done
        setTimeout(() => {
          console.error(`\n\x1b[36m=== Results: ${passCount}/${testCount} passed, ${failCount} failed ===\x1b[0m`);
          server.kill();
        }, 500);
      }
    } catch {}
  }
});

server.on("exit", (code) => {
  if (code !== 0 && code !== null) console.error(`Server exited with code ${code}`);
});

// Start first test
send(tests[0].name, tests[0].method, tests[0].params);
stepIndex = 1;
