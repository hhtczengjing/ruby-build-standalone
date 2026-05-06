import child from "node:child_process";

const server = child.spawn("node", ["mcp/dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: import.meta.dirname,
});

let id = 0;
let toolCalled = false;

function send(method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params });
  console.error("→ " + msg);
  server.stdin.write(msg + "\n");
}

server.stdout.on("data", (data) => {
  const lines = data.toString().trim().split("\n");
  for (const line of lines) {
    if (!line) continue;
    try {
      const resp = JSON.parse(line);
      // Pretty print the tool result
      if (resp.result?.content) {
        for (const c of resp.result.content) {
          if (c.type === "text") {
            console.log(c.text);
          }
        }
      }
    } catch {}
  }
});

// Step 1: Initialize
send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } });

// Step 2: Call tool after init response
setTimeout(() => {
  send("tools/call", { name: "ruby_env_run", arguments: { command: "fastlane --version" } });
}, 500);

// Step 3: Exit
setTimeout(() => {
  server.kill();
}, 10000);
