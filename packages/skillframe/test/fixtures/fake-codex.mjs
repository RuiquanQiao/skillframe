// A stand-in for `codex app-server`, speaking the same JSON-RPC Codex does, so the tests cost no
// tokens. What a turn does depends on its text:
//   hello     streams "Hi there"
//   args      replies with its argv, the thread params and whether the MCP token arrived (JSON)
//   perm      asks to run a command, then replies "allowed" or "denied"
//   tool <json args>  calls the host app's first MCP tool (from the -c flags) with those args
//   elicit    sends an MCP approval for the host app's own server, replies with the answer
//   slow      never finishes until turn/interrupt
//   fail      the turn fails with "quota exceeded"
//   crash     writes to stderr and exits 1
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const notify = (method, params) => out({ jsonrpc: "2.0", method, params });
let threadId = null;
let threadParams = null;
let threadMethod = null;
let turnN = 0;
let lastInput = [];
let reqN = 100;
const waiting = new Map(); // our request id -> resolve(result)
let interrupted = null;

// the -c overrides the driver passed: mcp_servers.<name>.url / http_headers
const overrides = {};
for (let i = 0; i < argv.length; i++) if (argv[i] === "-c") overrides[argv[i + 1].split("=")[0]] = argv[i + 1].slice(argv[i + 1].indexOf("=") + 1);
const urlKey = Object.keys(overrides).find((k) => /^mcp_servers\.[^.]+\.url$/.test(k));
const mcpName = urlKey?.split(".")[1];

function ask(method, params) {
  const id = ++reqN;
  out({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}

function say(turnId, text) {
  const itemId = `msg-${turnId}`;
  notify("item/started", { threadId, turnId, item: { type: "agentMessage", id: itemId, text: "" } });
  for (const piece of text.match(/.{1,4}/gs) ?? [""]) notify("item/agentMessage/delta", { threadId, turnId, itemId, delta: piece });
  notify("item/completed", { threadId, turnId, item: { type: "agentMessage", id: itemId, text } });
}

const complete = (turnId, status = "completed", error = null) =>
  notify("turn/completed", { threadId, turn: { id: turnId, status, items: [], error } });

async function mcp(body) {
  const url = JSON.parse(overrides[urlKey]);
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${process.env.SKILLFRAME_MCP_TOKEN}` };
  const extra = overrides[`mcp_servers.${mcpName}.http_headers`];
  const m = extra && extra.match(/"([^"]+)"\s*=\s*("[^"]*")/);
  if (m) headers[m[1]] = JSON.parse(m[2]);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return res.status === 202 ? null : res.json();
}

async function run(turnId, text) {
  notify("turn/started", { threadId, turn: { id: turnId, status: "inProgress", items: [] } });
  if (text === "hello") {
    say(turnId, "Hi there");
    return complete(turnId);
  }
  if (text === "plan") {
    notify("turn/plan/updated", { threadId, turnId, plan: [{ step: "Look", status: "completed" }, { step: "Write", status: "inProgress" }] });
    say(turnId, "planned");
    return complete(turnId);
  }
  if (text === "images?") {
    say(turnId, lastInput.map((i) => i.type).join(","));
    return complete(turnId);
  }
  if (text === "args") {
    say(turnId, JSON.stringify({ argv, threadMethod, threadParams, token: !!process.env.SKILLFRAME_MCP_TOKEN }));
    return complete(turnId);
  }
  if (text === "perm") {
    const item = { type: "commandExecution", id: "cmd-1", command: "rm notes.json", status: "inProgress" };
    notify("item/started", { threadId, turnId, item });
    const r = await ask("item/commandExecution/requestApproval", { threadId, turnId, itemId: "cmd-1", command: "rm notes.json", reason: "clean up" });
    const ok = r.decision === "accept" || r.decision === "acceptForSession";
    notify("item/completed", { threadId, turnId, item: { ...item, status: ok ? "completed" : "declined", aggregatedOutput: ok ? "removed" : "" } });
    say(turnId, ok ? "allowed" : "denied");
    return complete(turnId);
  }
  if (text.startsWith("tool")) {
    await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-codex", version: "1" } } });
    const list = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tool = list.result.tools[0].name;
    const args = JSON.parse(text.slice(4).trim() || "{}");
    const item = { type: "mcpToolCall", id: "mcp-1", server: mcpName, tool, arguments: args, status: "inProgress" };
    notify("item/started", { threadId, turnId, item });
    const call = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: tool, arguments: args } });
    const failed = !!call.result.isError;
    notify("item/completed", { threadId, turnId, item: { ...item, status: failed ? "failed" : "completed", result: { content: call.result.content }, error: failed ? { message: call.result.content[0].text } : null } });
    say(turnId, `tool said: ${call.result.content[0].text}`);
    return complete(turnId);
  }
  if (text === "elicit") {
    const r = await ask("mcpServer/elicitation/request", { threadId, turnId, serverName: mcpName, mode: "form", message: "Allow add_note?", requestedSchema: { type: "object", properties: {} } });
    say(turnId, `elicitation: ${r.action}`);
    return complete(turnId);
  }
  if (text === "slow") {
    say(turnId, "working");
    await new Promise((r) => (interrupted = r));
    return complete(turnId, "interrupted");
  }
  if (text === "fail") {
    notify("error", { threadId, turnId, error: { message: "quota exceeded" }, willRetry: false });
    return complete(turnId, "failed", { message: "quota exceeded" });
  }
  if (text === "crash") {
    process.stderr.write("codex: not logged in\n");
    process.exit(1);
  }
  say(turnId, `echo: ${text}`);
  return complete(turnId);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const msg = JSON.parse(line);
  if (!msg.method && msg.id !== undefined) {
    // an answer to one of our requests
    waiting.get(msg.id)?.(msg.result ?? { error: msg.error });
    waiting.delete(msg.id);
    return;
  }
  const reply = (result) => out({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return reply({ userAgent: "fake-codex/0" });
    case "initialized":
      return;
    case "model/list":
      return reply({ data: [{ id: "gpt-fake", displayName: "GPT Fake", description: "a fake model" }, { id: "hidden-one", displayName: "Hidden", hidden: true }] });
    case "thread/start":
    case "thread/resume":
    case "thread/fork":
      threadMethod = msg.method;
      threadParams = msg.params;
      threadId = msg.method === "thread/fork" ? "thr-fork" : msg.params.threadId ?? "thr-1";
      notify("thread/started", { thread: { id: threadId } });
      return reply({ thread: { id: threadId }, model: "fake-codex" });
    case "turn/start": {
      const turnId = `turn-${++turnN}`;
      reply({ turn: { id: turnId, status: "inProgress", items: [] } });
      lastInput = msg.params.input;
      run(turnId, msg.params.input.filter((i) => i.type === "text").map((i) => i.text).join("").split("\n\nAttached files")[0]);
      return;
    }
    case "turn/interrupt":
      reply({});
      interrupted?.();
      return;
    case "turn/steer":
      return reply({ turnId: msg.params.expectedTurnId });
    default:
      out({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `fake-codex: no ${msg.method}` } });
  }
});
lines.on("close", () => process.exit(0));
