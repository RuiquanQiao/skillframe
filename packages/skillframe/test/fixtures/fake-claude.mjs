// A stand-in for `claude -p --input-format stream-json --output-format stream-json`, speaking the
// same lines Claude Code does, so the tests cost no tokens. What it does depends on the message:
//   hello     streams "Hi there"
//   args      replies with its own argv (JSON)
//   context?  replies with the --append-system-prompt-file content
//   wait      replies "waited" after 300 ms (to queue a message behind it)
//   perm      asks permission to Write, then replies "allowed" or "denied: <message>"
//   tool <json args>  calls the host app's first MCP tool over HTTP with those args
//   slow      never finishes until interrupted
//   crash     writes to stderr and exits 1
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const session = opt("--resume") ?? "sess-1";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let n = 0;
const waiting = new Map(); // request_id -> resolve(response)
let interrupted = null;

out({ type: "system", subtype: "init", session_id: session, model: "fake-model", permissionMode: opt("--permission-mode") ?? "default", tools: [] });

function say(text) {
  for (const piece of text.match(/.{1,4}/gs) ?? [""]) {
    out({ type: "stream_event", session_id: session, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } } });
  }
  out({ type: "assistant", session_id: session, message: { model: "fake-model", content: [{ type: "text", text }] } });
}

function done(text, extra = {}) {
  out({ type: "result", subtype: "success", is_error: false, result: text, session_id: session, total_cost_usd: 0.001, ...extra });
}

function ask(request) {
  const id = `req-${++n}`;
  out({ type: "control_request", request_id: id, request });
  return new Promise((resolve) => waiting.set(id, resolve));
}

async function mcp(config, body) {
  const server = Object.values(config.mcpServers)[0];
  const res = await fetch(server.url, { method: "POST", headers: { ...server.headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
  return res.status === 202 ? null : res.json();
}

async function reply(text) {
  if (text === "hello") {
    say("Hi there");
    return done("Hi there");
  }
  if (text === "args") {
    say(JSON.stringify(argv));
    return done("args");
  }
  if (text === "context?") {
    const file = opt("--append-system-prompt-file");
    const ctx = file ? readFileSync(file, "utf8") : "(none)";
    say(ctx);
    return done(ctx);
  }
  if (text === "wait") {
    await new Promise((r) => setTimeout(r, 300));
    say("waited");
    return done("waited");
  }
  if (text === "perm") {
    const r = await ask({ subtype: "can_use_tool", tool_name: "Write", input: { file_path: "a.txt", content: "x" }, permission_suggestions: [{ type: "addRules", rules: [{ toolName: "Write" }], behavior: "allow", destination: "session" }] });
    const answer = r.behavior === "allow" ? "allowed" : `denied: ${r.message}`;
    say(answer);
    return done(answer);
  }
  if (text.startsWith("tool")) {
    const config = JSON.parse(readFileSync(opt("--mcp-config"), "utf8"));
    await mcp(config, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "1" } } });
    await mcp(config, { jsonrpc: "2.0", method: "notifications/initialized" });
    const list = await mcp(config, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const name = list.result.tools[0].name;
    const args = JSON.parse(text.slice(4).trim() || "{}");
    out({ type: "assistant", session_id: session, message: { model: "fake-model", content: [{ type: "tool_use", id: "tu-1", name: `mcp__app__${name}`, input: args }] } });
    const call = await mcp(config, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
    const result = call.result.content[0].text;
    out({ type: "user", session_id: session, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: result, is_error: !!call.result.isError }] } });
    say(`tool said: ${result}`);
    return done(result);
  }
  if (text === "slow") {
    say("working");
    await new Promise((r) => (interrupted = r));
    return done("", { subtype: "error_during_execution", is_error: true });
  }
  if (text === "crash") {
    process.stderr.write("boom: not logged in\n");
    process.exit(1);
  }
  say(`echo: ${text}`);
  return done(text);
}

// one message at a time, like Claude Code: the next user line waits for the current reply
let chain = Promise.resolve();
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type === "control_response") {
    waiting.get(msg.response.request_id)?.(msg.response.response);
    waiting.delete(msg.response.request_id);
  } else if (msg.type === "control_request" && msg.request.subtype === "interrupt") {
    interrupted?.();
  } else if (msg.type === "user") {
    chain = chain.then(() => reply(String(msg.message.content)));
  }
});
lines.on("close", () => chain.then(() => process.exit(0)));
