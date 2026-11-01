import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSkillframe, type Skillframe } from "../src/index.js";
import { ChatStore } from "../src/chat/store.js";
import { toolHint } from "../src/chat/runner.js";
import { readShim, resolveCommand } from "../src/spawn.js";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE = path.join(PKG, "test/fixtures/fake-claude.mjs");
const TMP = path.join(PKG, ".cache/test");

function tmpDir(name: string): string {
  const dir = path.join(TMP, `${name}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---- a raw HTTP client: fetch() won't let a test set Host or Origin freely ----
function request(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any; text: string }>((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const req = http.request(url, { method, headers: { ...(data !== undefined ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, json, text });
      });
    });
    req.on("error", reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

describe("finding the agent command", () => {
  test("an npm shim that runs a native exe is started directly", () => {
    const dir = tmpDir("shim");
    const exe = path.join(dir, "node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, "");
    const shim = path.join(dir, "claude.cmd");
    writeFileSync(shim, '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n');
    assert.deepEqual(readShim(shim), { file: exe, args: [] });
  });

  test("an npm shim that runs a node script is started with node", () => {
    const dir = tmpDir("shim");
    const js = path.join(dir, "node_modules/x/cli.js");
    mkdirSync(path.dirname(js), { recursive: true });
    writeFileSync(js, "");
    const shim = path.join(dir, "x.cmd");
    writeFileSync(shim, '@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\x\\cli.js" %*\r\n) ELSE (\r\n  node  "%~dp0\\node_modules\\x\\cli.js" %*\r\n)\r\n');
    assert.deepEqual(readShim(shim), { file: process.execPath, args: [js] });
  });

  test("an unknown file is not a shim", () => {
    const dir = tmpDir("shim");
    writeFileSync(path.join(dir, "y.cmd"), "@echo hi\r\n");
    assert.equal(readShim(path.join(dir, "y.cmd")), null);
  });

  test("SKILLFRAME_<ID>_CMD replaces the command; a missing command is null", () => {
    assert.deepEqual(resolveCommand("claude", "claude", { SKILLFRAME_CLAUDE_CMD: '["node","fake.mjs"]' }), { file: "node", args: ["fake.mjs"] });
    assert.equal(resolveCommand("claude", "definitely-not-a-command-xyz", { PATH: tmpDir("empty") }), null);
  });
});

describe("tool step hints", () => {
  test("a known field wins; an app's own tool shows its short arguments", () => {
    assert.equal(toolHint({ file_path: "a.txt", content: "x" }), "a.txt");
    assert.equal(toolHint({ text: "buy milk", n: 2, deep: { x: 1 } }), "text=buy milk n=2");
    assert.equal(toolHint({}), "");
  });
});

describe("chat store", () => {
  test("create, update, list newest first, append, delete", async () => {
    const store = new ChatStore(tmpDir("store"));
    const a = store.create({ title: "a" });
    await new Promise((r) => setTimeout(r, 5));
    const b = store.create({ title: "b" });
    assert.deepEqual(store.list().map((c) => c.id), [b.id, a.id]);
    await new Promise((r) => setTimeout(r, 5));
    store.update(a.id, { title: "a2" });
    assert.equal(store.list()[0].title, "a2");
    store.append(a.id, { role: "user", text: "hi", at: 1 });
    assert.equal(store.messages(a.id).length, 1);
    store.delete(a.id);
    assert.equal(store.meta(a.id), undefined);
    assert.deepEqual(store.messages(a.id), []);
  });

  test("a chat id can't reach outside the folder", () => {
    const store = new ChatStore(tmpDir("store"));
    assert.throws(() => store.messages("../../etc"));
  });
});

describe("chatting with the agent (fake Claude Code)", () => {
  let sf: Skillframe;
  let url: string;
  const screens: unknown[] = [];
  const calls: { args: any; chatId?: string }[] = [];

  before(async () => {
    const dir = tmpDir("app");
    sf = createSkillframe({
      appName: "Test App",
      agents: ["claude"],
      workspace: path.join(dir, "ws"),
      dataDir: path.join(dir, "data"),
      env: { ...process.env, SKILLFRAME_CLAUDE_CMD: JSON.stringify([process.execPath, FAKE]) },
      context: ({ screen }) => {
        screens.push(screen);
        return `Screen: ${JSON.stringify(screen)}`;
      },
      tools: {
        add_note: {
          description: "Add a note",
          input: { text: "string" },
          run: (args, ctx) => {
            calls.push({ args, chatId: ctx.chatId });
            if (args.text === "fail") throw new Error("no notes today");
            return `Added ${args.text}`;
          },
        },
      },
    });
    url = (await sf.listen()).url.replace(/\/$/, "");
  });

  after(() => sf.close());

  /** the events of one chat until its chat.done */
  function untilDone(chatId: string, onEvent?: (event: string, data: any) => void) {
    return new Promise<{ events: string[]; done: any }>((resolve) => {
      const events: string[] = [];
      const off = sf.on((event, data: any) => {
        if (data?.chat !== chatId) return;
        events.push(event);
        onEvent?.(event, data);
        if (event === "chat.done") {
          off();
          resolve({ events, done: data });
        }
      });
    });
  }

  async function newChat() {
    const r = await request(`${url}/sf/chats`, "POST", {});
    assert.equal(r.status, 200);
    return r.json.id as string;
  }

  async function say(chatId: string, text: string, extra: Record<string, unknown> = {}) {
    const finished = untilDone(chatId);
    const r = await request(`${url}/sf/chats/${chatId}/send`, "POST", { text, ...extra });
    assert.equal(r.status, 200, r.text);
    return finished;
  }

  const lastReply = async (chatId: string) => {
    const r = await request(`${url}/sf/chats/${chatId}`, "GET");
    return r.json.messages.at(-1);
  };

  test("a reply streams in and is saved; the session id is kept", async () => {
    const id = await newChat();
    const { events, done } = await say(id, "hello");
    assert.equal(done.ok, true);
    assert.ok(events.includes("chat.start") && events.includes("chat.delta") && events.includes("chat.reply"));
    const r = await request(`${url}/sf/chats/${id}`, "GET");
    assert.deepEqual(r.json.messages.map((m: any) => m.role), ["user", "assistant"]);
    assert.equal(r.json.messages[1].blocks[0].text, "Hi there");
    assert.equal(r.json.meta.sessionId, "sess-1");
    assert.equal(r.json.meta.title, "hello");
  });

  test("the next message resumes the agent's session, with the stream-json flags", async () => {
    const id = await newChat();
    await say(id, "hello");
    await say(id, "args");
    const argv = JSON.parse((await lastReply(id)).blocks[0].text) as string[];
    assert.equal(argv[argv.indexOf("--resume") + 1], "sess-1");
    for (const flag of ["-p", "--input-format", "--output-format", "--verbose", "--permission-prompt-tool", "--mcp-config", "--allowedTools"]) {
      assert.ok(argv.includes(flag), `missing ${flag}`);
    }
    assert.match(argv[argv.indexOf("--allowedTools") + 1], /mcp__test_app/);
  });

  test("what the page says is on screen reaches the agent's system prompt", async () => {
    const id = await newChat();
    await say(id, "context?", { screen: { note: 7 } });
    const text = (await lastReply(id)).blocks[0].text;
    assert.match(text, /You are running inside Test App/);
    assert.match(text, /Screen: \{"note":7\}/);
    assert.deepEqual(screens.at(-1), { note: 7 });
  });

  test("a message sent while the agent works is queued into the same process", async () => {
    const id = await newChat();
    const finished = untilDone(id);
    await request(`${url}/sf/chats/${id}/send`, "POST", { text: "wait" });
    const q = await request(`${url}/sf/chats/${id}/send`, "POST", { text: "hello" });
    assert.equal(q.json.queued, true);
    const { events } = await finished;
    assert.ok(events.includes("chat.next"));
    const r = await request(`${url}/sf/chats/${id}`, "GET");
    assert.deepEqual(r.json.messages.map((m: any) => m.text ?? m.blocks[0].text), ["wait", "waited", "hello", "Hi there"]);
  });

  test("a permission card: allow goes back to the agent", async () => {
    const id = await newChat();
    const finished = untilDone(id, (event, data) => {
      if (event === "chat.ask" && data.ask.status === "pending") {
        request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: data.ask.id, decision: { allow: true } });
      }
    });
    await request(`${url}/sf/chats/${id}/send`, "POST", { text: "perm" });
    await finished;
    const reply = await lastReply(id);
    assert.equal(reply.blocks.find((b: any) => b.type === "ask").status, "allowed");
    assert.equal(reply.blocks.find((b: any) => b.type === "text").text, "allowed");
  });

  test("a permission card: deny passes the user's reason on", async () => {
    const id = await newChat();
    const finished = untilDone(id, (event, data) => {
      if (event === "chat.ask" && data.ask.status === "pending") {
        request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: data.ask.id, decision: { allow: false, message: "not that file" } });
      }
    });
    await request(`${url}/sf/chats/${id}/send`, "POST", { text: "perm" });
    await finished;
    assert.equal((await lastReply(id)).blocks.find((b: any) => b.type === "text").text, "denied: not that file");
  });

  test("answering a card that isn't waiting is a 404", async () => {
    const id = await newChat();
    const r = await request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: "nope", decision: { allow: true } });
    assert.equal(r.status, 404);
  });

  test("the agent calls the host app's tool over MCP, and the app knows which chat called", async () => {
    const id = await newChat();
    const seen: string[] = [];
    const off = sf.on((event) => seen.push(event));
    await say(id, 'tool {"text":"milk"}');
    off();
    assert.deepEqual(calls.at(-1), { args: { text: "milk" }, chatId: id });
    assert.ok(seen.includes("app.tool"));
    const reply = await lastReply(id);
    const step = reply.blocks.find((b: any) => b.type === "tool");
    assert.equal(step.status, "done");
    assert.equal(step.result, "Added milk");
  });

  test("a tool that throws reaches the agent as an error result, not a crash", async () => {
    const id = await newChat();
    await say(id, 'tool {"text":"fail"}');
    const step = (await lastReply(id)).blocks.find((b: any) => b.type === "tool");
    assert.equal(step.status, "error");
    assert.equal(step.result, "no notes today");
  });

  test("stop interrupts the reply; it ends as cancelled, not as an error", async () => {
    const id = await newChat();
    const finished = untilDone(id, (event) => {
      if (event === "chat.delta") request(`${url}/sf/chats/${id}/cancel`, "POST", {});
    });
    await request(`${url}/sf/chats/${id}/send`, "POST", { text: "slow" });
    const { done } = await finished;
    assert.equal(done.cancelled, true);
    assert.equal(done.ok, false);
    assert.equal(done.error, null);
    assert.equal((await lastReply(id)).cancelled, true);
  });

  test("an agent that crashes shows what it printed", async () => {
    const id = await newChat();
    const { done } = await say(id, "crash");
    assert.equal(done.ok, false);
    assert.match(done.error, /boom: not logged in/);
    assert.match((await lastReply(id)).error, /boom/);
  });

  test("an empty message and an unknown chat are refused", async () => {
    const id = await newChat();
    assert.equal((await request(`${url}/sf/chats/${id}/send`, "POST", { text: "  " })).status, 400);
    assert.equal((await request(`${url}/sf/chats/nochat/send`, "POST", { text: "hi" })).status, 404);
  });

  test("deleting a chat removes it", async () => {
    const id = await newChat();
    assert.equal((await request(`${url}/sf/chats/${id}`, "DELETE")).status, 200);
    assert.equal((await request(`${url}/sf/chats/${id}`, "GET")).status, 404);
  });

  test("the app info lists the agent and the tools", async () => {
    const r = await request(`${url}/sf/app`, "GET");
    assert.equal(r.json.appName, "Test App");
    assert.deepEqual(r.json.agents.map((a: any) => [a.id, a.installed]), [["claude", true]]);
    assert.deepEqual(r.json.tools, [{ name: "add_note", description: "Add a note" }]);
  });

  test("the sidebar script is served; nothing outside its folder is", async () => {
    const ok = await request(`${url}/sf/ui/skillframe-chat.js`, "GET");
    assert.equal(ok.status, 200);
    assert.match(ok.text, /customElements\.define\("skillframe-chat"/);
    assert.equal((await request(`${url}/sf/ui/../src/index.ts`, "GET")).status, 404);
    assert.equal((await request(`${url}/sf/ui/%2e%2e/package.json`, "GET")).status, 404);
  });
});

describe("only the app's own page and agent get in", () => {
  let sf: Skillframe;
  let url: string;

  before(async () => {
    const dir = tmpDir("sec");
    sf = createSkillframe({
      appName: "Sec",
      workspace: path.join(dir, "ws"),
      dataDir: path.join(dir, "data"),
      env: { ...process.env, SKILLFRAME_CLAUDE_CMD: JSON.stringify([process.execPath, FAKE]) },
      tools: { boom: { description: "throws", run: () => { throw new Error("x"); } } },
    });
    url = (await sf.listen()).url.replace(/\/$/, "");
  });

  after(() => sf.close());

  test("a page on another origin can't start a chat", async () => {
    const r = await request(`${url}/sf/chats`, "POST", {}, { Origin: "https://evil.example" });
    assert.equal(r.status, 403);
    const same = await request(`${url}/sf/chats`, "POST", {}, { Origin: url });
    assert.equal(same.status, 200);
  });

  test("a non-loopback Host header is refused (DNS rebinding)", async () => {
    const r = await request(`${url}/sf/chats`, "GET", undefined, { Host: "evil.example:80" });
    assert.equal(r.status, 403);
  });

  test("a form post (not JSON) is refused", async () => {
    const r = await request(`${url}/sf/chats`, "POST", "a=1", { "Content-Type": "application/x-www-form-urlencoded" });
    assert.equal(r.status, 415);
  });

  test("the MCP endpoint wants the agent's token", async () => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    assert.equal((await request(`${url}/sf/mcp`, "POST", body)).status, 401);
    assert.equal((await request(`${url}/sf/mcp`, "POST", body, { Authorization: "Bearer wrong" })).status, 401);
    const ok = await request(`${url}/sf/mcp`, "POST", body, { Authorization: `Bearer ${sf.mcp!.token}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.result.tools[0].name, "boom");
  });

  test("MCP: version negotiation, notifications, unknown methods and tools", async () => {
    const auth = { Authorization: `Bearer ${sf.mcp!.token}` };
    const init = await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, auth);
    assert.equal(init.json.result.protocolVersion, "2025-06-18");
    const odd = await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, auth);
    assert.equal(odd.json.result.protocolVersion, "2025-11-25");
    assert.equal((await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", method: "notifications/initialized" }, auth)).status, 202);
    assert.equal((await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", id: 2, method: "nope" }, auth)).json.error.code, -32601);
    const call = await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "missing" } }, auth);
    assert.equal(call.json.error.code, -32602);
    const thrown = await request(`${url}/sf/mcp`, "POST", { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boom", arguments: {} } }, auth);
    assert.equal(thrown.json.result.isError, true);
    assert.equal((await request(`${url}/sf/mcp`, "POST", "{not json", auth)).status, 400);
    assert.equal((await request(`${url}/sf/mcp`, "GET", undefined, auth)).status, 405);
  });
});

describe("when the agent isn't installed", () => {
  test("sending says how to install it", async () => {
    const dir = tmpDir("missing");
    const sf = createSkillframe({ appName: "M", workspace: path.join(dir, "ws"), dataDir: path.join(dir, "data"), env: { PATH: dir } });
    const url = (await sf.listen()).url.replace(/\/$/, "");
    const id = (await request(`${url}/sf/chats`, "POST", {})).json.id;
    const r = await request(`${url}/sf/chats/${id}/send`, "POST", { text: "hi" });
    assert.equal(r.status, 409);
    assert.match(r.json.error, /npm install -g @anthropic-ai\/claude-code/);
    assert.equal((await request(`${url}/sf/app`, "GET")).json.agents[0].installed, false);
    await sf.close();
  });
});
