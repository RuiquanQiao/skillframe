import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createSkillframe, type Skillframe } from "../src/index.js";
import { Conflict, globToRegExp } from "../src/files.js";
import { fakeEnv, nextEvent, request, tmpDir, untilDone } from "./helpers.js";

describe("watch patterns", () => {
  test("globs match '/'-separated relative paths", () => {
    const m = (g: string, p: string) => globToRegExp(g).test(p);
    assert.ok(m("notes.json", "notes.json"));
    assert.ok(!m("notes.json", "sub/notes.json"));
    assert.ok(m("data/*.json", "data/a.json"));
    assert.ok(!m("data/*.json", "data/x/a.json"));
    assert.ok(m("data/**/*.md", "data/a.md"));
    assert.ok(m("data/**/*.md", "data/x/y/a.md"));
    assert.ok(m("**/*.yaml", "a.yaml"));
    assert.ok(!m("*.json", "notes.json.tmp"));
    assert.ok(m("a?.txt", "ab.txt"));
  });
});

describe("files shared by the app and the agent", () => {
  let sf: Skillframe;
  let url: string;
  let ws: string;
  let data: string;

  before(async () => {
    const dir = tmpDir("files");
    ws = path.join(dir, "ws");
    data = path.join(dir, "data");
    sf = createSkillframe({ appName: "Files", workspace: ws, dataDir: data, watch: ["notes.json", "docs/**/*.md"], env: fakeEnv() });
    url = (await sf.listen()).url.replace(/\/$/, "");
  });

  after(() => sf.close());

  test("a write on top of the version read succeeds; on top of an older one it is a Conflict", () => {
    const first = sf.files!.write("notes.json", "[1]", { baseHash: "" }); // "" = must not exist yet
    const second = sf.files!.write("notes.json", "[1,2]", { baseHash: first.hash });
    assert.throws(() => sf.files!.write("notes.json", "[1,3]", { baseHash: first.hash }), (e: unknown) => {
      assert.ok(e instanceof Conflict);
      assert.equal(e.current.text, "[1,2]");
      assert.equal(e.current.hash, second.hash);
      return true;
    });
    assert.equal(readFileSync(path.join(ws, "notes.json"), "utf8"), "[1,2]");
  });

  test("every overwrite keeps the old content in the history folder", () => {
    const before = sf.files!.read("notes.json");
    sf.files!.write("notes.json", before.text + " ", { baseHash: before.hash });
    const kept = readdirSync(path.join(data, "history")).filter((f) => f.startsWith("notes.json."));
    assert.ok(kept.some((f) => readFileSync(path.join(data, "history", f), "utf8") === before.text));
  });

  test("files outside the watch list can't be read or written", async () => {
    writeFileSync(path.join(ws, "secret.txt"), "x");
    assert.equal((await request(`${url}/sf/files?path=secret.txt`, "GET")).status, 403);
    assert.equal((await request(`${url}/sf/files?path=../../package.json`, "GET")).status, 403);
    assert.equal((await request(`${url}/sf/files`, "POST", { path: "secret.txt", text: "y" })).status, 403);
    assert.equal(readFileSync(path.join(ws, "secret.txt"), "utf8"), "x");
  });

  test("the page reads and writes over HTTP; a stale write gets 409 with the newer version", async () => {
    const v = (await request(`${url}/sf/files?path=docs/a/b.md`, "GET")).json;
    assert.deepEqual(v, { path: "docs/a/b.md", text: "", hash: "" });
    const w = await request(`${url}/sf/files`, "POST", { path: "docs/a/b.md", text: "# hi", baseHash: "" });
    assert.equal(w.status, 200);
    const stale = await request(`${url}/sf/files`, "POST", { path: "docs/a/b.md", text: "# other", baseHash: "" });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.current.text, "# hi");
    assert.equal(stale.json.current.hash, w.json.hash);
  });

  test("an edit made outside the app (by the agent) reaches the page as file.changed", async () => {
    const seen = nextEvent(sf, "file.changed", (d) => d.path === "docs/x.md");
    writeFileSync(path.join(ws, "docs", "x.md"), "outside edit");
    const d = await seen;
    assert.equal(d.by, "outside");
    assert.equal(d.hash, sf.files!.read("docs/x.md").hash);
  });

  test("the app's own write is announced once, as by the app (the watcher doesn't echo it)", async () => {
    const events: any[] = [];
    const off = sf.on((e, d: any) => e === "file.changed" && d.path === "notes.json" && events.push(d));
    const cur = sf.files!.read("notes.json");
    sf.files!.write("notes.json", "[9]", { baseHash: cur.hash });
    await new Promise((r) => setTimeout(r, 600)); // longer than the watcher's settle time
    off();
    assert.deepEqual(events.map((e) => e.by), ["app"]);
  });
});

describe("chatting with Codex (fake codex app-server)", () => {
  let sf: Skillframe;
  let url: string;
  const calls: { args: any; chatId?: string }[] = [];

  before(async () => {
    const dir = tmpDir("codex");
    sf = createSkillframe({
      appName: "Codex App",
      workspace: path.join(dir, "ws"),
      dataDir: path.join(dir, "data"),
      env: fakeEnv(),
      context: () => "Screen: the notes list",
      tools: {
        add_note: {
          description: "Add a note",
          input: { text: "string" },
          run: (args, ctx) => {
            calls.push({ args, chatId: ctx.chatId });
            return `Added ${args.text}`;
          },
        },
      },
    });
    url = (await sf.listen()).url.replace(/\/$/, "");
  });

  after(() => sf.close());

  async function newChat(agent = "codex") {
    const r = await request(`${url}/sf/chats`, "POST", { agent });
    assert.equal(r.json.agent, agent);
    return r.json.id as string;
  }

  async function say(chatId: string, text: string, onEvent?: (event: string, data: any) => void) {
    const finished = untilDone(sf, chatId, onEvent);
    const r = await request(`${url}/sf/chats/${chatId}/send`, "POST", { text });
    assert.equal(r.status, 200, r.text);
    return finished;
  }

  const lastReply = async (chatId: string) => (await request(`${url}/sf/chats/${chatId}`, "GET")).json.messages.at(-1);
  const textOf = (reply: any) => reply.blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");

  test("a reply streams in; the Codex thread id is kept as the session", async () => {
    const id = await newChat();
    const { done } = await say(id, "hello");
    assert.equal(done.ok, true);
    assert.equal(textOf(await lastReply(id)), "Hi there");
    assert.equal((await request(`${url}/sf/chats/${id}`, "GET")).json.meta.sessionId, "thr-1");
  });

  test("the app's note goes in developerInstructions; the next message resumes the thread", async () => {
    const id = await newChat();
    await say(id, "hello");
    await say(id, "args");
    const info = JSON.parse(textOf(await lastReply(id)));
    assert.equal(info.threadMethod, "thread/resume");
    assert.equal(info.threadParams.threadId, "thr-1");
    assert.match(info.threadParams.developerInstructions, /You are running inside Codex App/);
    assert.match(info.threadParams.developerInstructions, /Screen: the notes list/);
    // no mode picked: Codex's own default for a trusted folder
    assert.equal(info.threadParams.sandbox, "workspace-write");
    assert.equal(info.threadParams.approvalPolicy, "on-request");
    assert.equal(info.argv[0], "app-server");
    assert.ok(info.argv.some((a: string) => /^mcp_servers\.codex_app\.url=/.test(a)));
    // the token travels in the environment, not on the command line
    assert.equal(info.token, true);
    assert.ok(!info.argv.join(" ").includes(sf.mcp!.token));
  });

  test("Codex calls the host app's tool over MCP, and the app knows which chat called", async () => {
    const id = await newChat();
    await say(id, 'tool {"text":"eggs"}');
    assert.deepEqual(calls.at(-1), { args: { text: "eggs" }, chatId: id });
    const step = (await lastReply(id)).blocks.find((b: any) => b.type === "tool");
    assert.equal(step.name, "add_note");
    assert.equal(step.status, "done");
    assert.equal(step.result, "Added eggs");
  });

  test("Codex's approval request for the app's own tools is accepted without a card", async () => {
    const id = await newChat();
    const { events } = await say(id, "elicit");
    assert.ok(!events.includes("chat.ask"));
    assert.equal(textOf(await lastReply(id)), "elicitation: accept");
  });

  test("a command approval: allow", async () => {
    const id = await newChat();
    await say(id, "perm", (event, data) => {
      if (event === "chat.ask" && data.ask.status === "pending") {
        assert.equal(data.ask.tool, "Bash");
        assert.equal(data.ask.input.command, "rm notes.json");
        request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: data.ask.id, decision: { allow: true } });
      }
    });
    const reply = await lastReply(id);
    assert.equal(reply.blocks.find((b: any) => b.type === "ask").status, "allowed");
    assert.equal(textOf(reply), "allowed");
  });

  test("a command approval: deny", async () => {
    const id = await newChat();
    await say(id, "perm", (event, data) => {
      if (event === "chat.ask" && data.ask.status === "pending") {
        request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: data.ask.id, decision: { allow: false, message: "keep it" } });
      }
    });
    const reply = await lastReply(id);
    assert.equal(textOf(reply), "denied");
    assert.equal(reply.blocks.find((b: any) => b.type === "tool").status, "error");
  });

  test("stop interrupts the Codex turn; it ends as cancelled", async () => {
    const id = await newChat();
    const { done } = await say(id, "slow", (event) => {
      if (event === "chat.delta") request(`${url}/sf/chats/${id}/cancel`, "POST", {});
    });
    assert.equal(done.cancelled, true);
    assert.equal(done.error, null);
  });

  test("a failed turn shows Codex's error", async () => {
    const id = await newChat();
    const { done } = await say(id, "fail");
    assert.equal(done.ok, false);
    assert.equal(done.error, "quota exceeded");
  });

  test("a Codex that crashes shows what it printed", async () => {
    const id = await newChat();
    const { done } = await say(id, "crash");
    assert.match(done.error, /codex: not logged in/);
  });

  test("a chat can switch agent before it starts, not after", async () => {
    const id = await newChat("claude");
    const switched = await request(`${url}/sf/chats/${id}/agent`, "POST", { agent: "codex" });
    assert.equal(switched.json.agent, "codex");
    await say(id, "hello");
    const again = await request(`${url}/sf/chats/${id}/agent`, "POST", { agent: "claude" });
    assert.equal(again.status, 409);
    assert.equal((await request(`${url}/sf/chats/${id}/agent`, "POST", { agent: "nope" })).status, 400);
  });

  test("both agents are listed, with whether they look signed in", async () => {
    const r = await request(`${url}/sf/app`, "GET");
    assert.deepEqual(r.json.agents.map((a: any) => [a.id, a.installed, a.signedIn]), [["claude", true, true], ["codex", true, true]]);
  });
});
