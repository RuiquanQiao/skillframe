#!/usr/bin/env node
// stdio <-> HTTP for MCP: for an agent that can only start MCP servers as commands (stdio), this
// is that command, and it forwards every JSON-RPC line to the host app's HTTP MCP endpoint.
//
//   node mcp-bridge.js <url>       token in SKILLFRAME_MCP_TOKEN, chat id in SKILLFRAME_CHAT
import { createInterface } from "node:readline";

const url = process.argv[2];
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${process.env.SKILLFRAME_MCP_TOKEN ?? ""}`,
  "X-Skillframe-Chat": process.env.SKILLFRAME_CHAT ?? "",
};

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

// answers go back in the order requests came, one at a time (stdio servers are sequential)
let chain = Promise.resolve();
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    try {
      const res = await fetch(url, { method: "POST", headers, body: line });
      if (res.status === 202) return; // a notification: nothing to answer
      const body = await res.json();
      out(body);
    } catch (e) {
      if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `The app isn't reachable: ${e.message}` } });
    }
  });
});
