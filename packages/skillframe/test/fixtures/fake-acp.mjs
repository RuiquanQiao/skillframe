// A stand-in for an ACP agent (`qwen --acp` and the like), speaking the Agent Client Protocol
// over stdio, so the tests cost no tokens. FAKE_ACP_HTTP=1 makes it say it takes HTTP MCP servers.
// What a prompt does depends on its text (after the <context> block):
//   hello     streams "Hi there"
//   args      replies with what it was given (JSON): session method, mcpServers, prompt, set_mode calls
//   perm      asks permission to edit, then replies "allowed" or "denied"
//   tool <json args>  calls the host app's first MCP tool (over HTTP, or through the stdio bridge)
//   plan      reports a plan
//   slow      never finishes until session/cancel
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const update = (sessionId, u) => out({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });
const say = (sid, text) => {
  for (const piece of text.match(/.{1,4}/gs) ?? [""]) update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: piece } });
};

let reqN = 500;
const waiting = new Map();
let session = null; // { method, params }
const setModes = [];
let cancelled = null;

function ask(method, params) {
  const id = ++reqN;
  out({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}

async function callTool(server, args) {
  const body = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
  if (server.type === "http") {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    for (const h of server.headers) headers[h.name] = h.value;
    const post = async (b) => (await fetch(server.url, { method: "POST", headers, body: b })).json();
    await post(body(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-acp", version: "1" } }));
    const list = await post(body(2, "tools/list"));
    const call = await post(body(3, "tools/call", { name: list.result.tools[0].name, arguments: args }));
    return call.result.content[0].text;
  }
  // a stdio server: start it and speak line by line
  const env = { ...process.env };
  for (const e of server.env) env[e.name] = e.value;
  const child = spawn(server.command, server.args, { env, stdio: ["pipe", "pipe", "inherit"] });
  const answers = new Map();
  createInterface({ input: child.stdout }).on("line", (l) => {
    const m = JSON.parse(l);
    answers.get(m.id)?.(m);
  });
  const rpc = (id, method, params) => new Promise((resolve) => {
    answers.set(id, resolve);
    child.stdin.write(body(id, method, params) + "\n");
  });
  await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-acp", version: "1" } });
  const list = await rpc(2, "tools/list");
  const call = await rpc(3, "tools/call", { name: list.result.tools[0].name, arguments: args });
  child.stdin.end();
  return call.result.content[0].text;
}

async function prompt(id, p) {
  const sid = p.sessionId;
  const full = p.prompt.map((b) => b.text ?? "").join("");
  const text = full.replace(/^<context>[\s\S]*?<\/context>\n\n/, "");
  const end = (stopReason = "end_turn") => out({ jsonrpc: "2.0", id, result: { stopReason } });
  if (text === "hello") {
    say(sid, "Hi there");
    return end();
  }
  if (text === "args") {
    say(sid, JSON.stringify({ method: session.method, mcpServers: session.params.mcpServers, prompt: full, setModes }));
    return end();
  }
  if (text === "perm") {
    const r = await ask("session/request_permission", {
      sessionId: sid,
      toolCall: { toolCallId: "tc-1", title: "Write a.txt", kind: "edit", rawInput: { file_path: "a.txt" } },
      options: [
        { optionId: "yes", name: "Allow", kind: "allow_once" },
        { optionId: "always", name: "Always allow", kind: "allow_always" },
        { optionId: "no", name: "Reject", kind: "reject_once" },
      ],
    });
    const ok = r.outcome?.outcome === "selected" && r.outcome.optionId !== "no";
    update(sid, { sessionUpdate: "tool_call", toolCallId: "tc-1", title: "Write a.txt", kind: "edit", status: "pending", rawInput: { file_path: "a.txt" } });
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: ok ? "completed" : "failed" });
    say(sid, ok ? `allowed:${r.outcome.optionId}` : "denied");
    return end();
  }
  if (text.startsWith("tool")) {
    const args = JSON.parse(text.slice(4).trim() || "{}");
    update(sid, { sessionUpdate: "tool_call", toolCallId: "mcp-1", title: "add_note", kind: "other", status: "in_progress", rawInput: args });
    const result = await callTool(session.params.mcpServers[0], args);
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: "mcp-1", status: "completed", content: [{ type: "content", content: { type: "text", text: result } }] });
    say(sid, `tool said: ${result}`);
    return end();
  }
  if (text === "plan") {
    update(sid, { sessionUpdate: "plan", entries: [{ content: "Look", status: "completed", priority: "high" }, { content: "Write", status: "in_progress", priority: "high" }] });
    say(sid, "planned");
    return end();
  }
  if (text === "slow") {
    say(sid, "working");
    await new Promise((r) => (cancelled = r));
    return end("cancelled");
  }
  say(sid, `echo: ${text}`);
  return end();
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (!msg.method && msg.id !== undefined) {
    waiting.get(msg.id)?.(msg.result ?? {});
    waiting.delete(msg.id);
    return;
  }
  const reply = (result) => out({ jsonrpc: "2.0", id: msg.id, result });
  const offer = {
    modes: { availableModes: [{ id: "default", name: "Default" }, { id: "yolo", name: "YOLO", description: "never asks" }], currentModeId: "default" },
    models: { availableModels: [{ modelId: "qwen-max", name: "Qwen Max" }], currentModelId: "qwen-max" },
  };
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { image: true }, mcpCapabilities: { http: process.env.FAKE_ACP_HTTP === "1" } } });
    case "session/new":
      session = { method: msg.method, params: msg.params };
      return reply({ sessionId: "acp-1", ...offer });
    case "session/load":
      session = { method: msg.method, params: msg.params };
      say(msg.params.sessionId, "OLD HISTORY"); // a real agent replays the conversation first
      return reply({ ...offer });
    case "session/set_mode":
      setModes.push(msg.params.modeId);
      return reply({});
    case "session/set_model":
      return reply({});
    case "session/prompt":
      prompt(msg.id, msg.params);
      return;
    case "session/cancel":
      cancelled?.();
      return;
    default:
      if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `fake-acp: no ${msg.method}` } });
  }
});
