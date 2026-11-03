import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createSkillframe, type Skillframe } from "../src/index.js";
import { fakeEnv, request, tmpDir, untilDone } from "./helpers.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex").toString("base64");

function app(env: NodeJS.ProcessEnv = fakeEnv()) {
  const calls: { args: any; chatId?: string }[] = [];
  const dir = tmpDir("m3");
  const sf = createSkillframe({
    appName: "M3 App",
    agents: ["claude", "codex", "qwen"],
    workspace: path.join(dir, "ws"),
    dataDir: path.join(dir, "data"),
    env,
    context: () => "Screen: notes",
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
  return { sf, calls };
}

function client(sf: Skillframe, url: string) {
  const api = {
    async chat(agent: string) {
      const r = await request(`${url}/sf/chats`, "POST", { agent });
      return r.json.id as string;
    },
    async say(id: string, text: string, extra: Record<string, unknown> = {}, onEvent?: (e: string, d: any) => void) {
      const finished = untilDone(sf, id, onEvent);
      const r = await request(`${url}/sf/chats/${id}/send`, "POST", { text, ...extra });
      assert.equal(r.status, 200, r.text);
      return finished;
    },
    async get(id: string) {
      return (await request(`${url}/sf/chats/${id}`, "GET")).json;
    },
    async lastText(id: string) {
      const reply = (await api.get(id)).messages.at(-1);
      return reply.blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    },
  };
  return api;
}

describe("ACP agents (fake Qwen Code)", () => {
  for (const http of [false, true]) {
    describe(http ? "agent takes HTTP MCP servers" : "agent takes stdio MCP servers (through the bridge)", () => {
      let sf: Skillframe;
      let url: string;
      let calls: { args: any; chatId?: string }[];
      let c: ReturnType<typeof client>;

      before(async () => {
        ({ sf, calls } = app({ ...fakeEnv(), ...(http ? { FAKE_ACP_HTTP: "1" } : {}) }));
        url = (await sf.listen()).url.replace(/\/$/, "");
        c = client(sf, url);
      });
      after(() => sf.close());

      test("the agent calls the host app's tool, and the app knows which chat called", async () => {
        const id = await c.chat("qwen");
        await c.say(id, 'tool {"text":"tea"}');
        assert.deepEqual(calls.at(-1), { args: { text: "tea" }, chatId: id });
        const step = (await c.get(id)).messages.at(-1).blocks.find((b: any) => b.type === "tool");
        assert.equal(step.status, "done");
        assert.equal(step.result, "Added tea");
      });
    });
  }

  describe("conversation", () => {
    let sf: Skillframe;
    let url: string;
    let c: ReturnType<typeof client>;

    before(async () => {
      ({ sf } = app());
      url = (await sf.listen()).url.replace(/\/$/, "");
      c = client(sf, url);
    });
    after(() => sf.close());

    test("a reply streams in; the app's note rides with the message (ACP has no system prompt)", async () => {
      const id = await c.chat("qwen");
      const { done } = await c.say(id, "hello");
      assert.equal(done.ok, true);
      assert.equal(await c.lastText(id), "Hi there");
      await c.say(id, "args");
      const info = JSON.parse(await c.lastText(id));
      assert.match(info.prompt, /^<context>\n[\s\S]*Screen: notes[\s\S]*<\/context>\n\nargs$/);
      // the second message reopened the session; the agent's replay of it was not shown again
      assert.equal(info.method, "session/load");
      assert.ok(!(await c.get(id)).messages.some((m: any) => m.blocks?.some((b: any) => b.text?.includes("OLD HISTORY"))));
      assert.equal((await c.get(id)).meta.sessionId, "acp-1");
    });

    test("modes and models the agent reports become its picker options; a picked mode is set", async () => {
      const id = await c.chat("qwen");
      await c.say(id, "hello");
      const opts = (await request(`${url}/sf/agents/qwen/options`, "GET")).json;
      assert.deepEqual(opts.modes.map((m: any) => m.id), ["default", "yolo"]);
      assert.deepEqual(opts.models.map((m: any) => m.id), ["qwen-max"]);
      await request(`${url}/sf/chats/${id}/settings`, "POST", { mode: "yolo" });
      await c.say(id, "args");
      assert.deepEqual(JSON.parse(await c.lastText(id)).setModes, ["yolo"]);
    });

    test("a permission request: the user's pick goes back as the agent's own option", async () => {
      const id = await c.chat("qwen");
      await c.say(id, "perm", {}, (event, data) => {
        if (event === "chat.ask" && data.ask.status === "pending") {
          assert.equal(data.ask.tool, "Edit");
          assert.equal(data.ask.suggestions.length, 1); // "always allow"
          request(`${url}/sf/chats/${id}/answer`, "POST", { requestId: data.ask.id, decision: { allow: true, suggestion: 0 } });
        }
      });
      assert.equal(await c.lastText(id), "allowed:always");
      const id2 = await c.chat("qwen");
      await c.say(id2, "perm", {}, (event, data) => {
        if (event === "chat.ask" && data.ask.status === "pending") request(`${url}/sf/chats/${id2}/answer`, "POST", { requestId: data.ask.id, decision: { allow: false } });
      });
      assert.equal(await c.lastText(id2), "denied");
    });

    test("the agent's plan becomes the chat's task list", async () => {
      const id = await c.chat("qwen");
      await c.say(id, "plan");
      assert.deepEqual((await c.get(id)).meta.tasks.map((t: any) => [t.subject, t.status]), [["Look", "completed"], ["Write", "in_progress"]]);
    });

    test("stop cancels the prompt; it ends as cancelled", async () => {
      const id = await c.chat("qwen");
      const { done } = await c.say(id, "slow", {}, (event) => {
        if (event === "chat.delta") request(`${url}/sf/chats/${id}/cancel`, "POST", {});
      });
      assert.equal(done.cancelled, true);
      assert.equal(done.error, null);
    });

    test("an ACP agent can't fork", async () => {
      const id = await c.chat("qwen");
      await c.say(id, "hello");
      assert.equal((await request(`${url}/sf/chats/${id}/fork`, "POST", { at: 1 })).status, 409);
    });
  });
});

describe("pickers, tasks, attachments, forks (Claude Code and Codex)", () => {
  let sf: Skillframe;
  let url: string;
  let c: ReturnType<typeof client>;

  before(async () => {
    ({ sf } = app());
    url = (await sf.listen()).url.replace(/\/$/, "");
    c = client(sf, url);
  });
  after(() => sf.close());

  test("a picked mode and model go to Claude Code's next reply", async () => {
    const id = await c.chat("claude");
    const meta = (await request(`${url}/sf/chats/${id}/settings`, "POST", { mode: "plan", model: "sonnet" })).json;
    assert.deepEqual([meta.mode, meta.model], ["plan", "sonnet"]);
    await c.say(id, "args");
    const argv = JSON.parse(await c.lastText(id)) as string[];
    assert.equal(argv[argv.indexOf("--permission-mode") + 1], "plan");
    assert.equal(argv[argv.indexOf("--model") + 1], "sonnet");
  });

  test("picker options come from the agents themselves: models with effort levels, commands, account, limits", async () => {
    const claude = (await request(`${url}/sf/agents/claude/options`, "GET")).json;
    assert.deepEqual(claude.modes.map((m: any) => m.id), ["default", "acceptEdits", "plan", "auto", "bypassPermissions"]);
    // Claude Code's own list: "default" names the default model; full ids go under "More models"
    assert.deepEqual(claude.models.map((m: any) => [m.id, m.name, m.efforts.length, !!m.more]), [["opus", "Opus 5.5", 5, false], ["haiku", "Haiku 4.5", 0, false], ["claude-opus-5", "Opus 5", 5, true]]);
    assert.equal(claude.defaultModel, "Sonnet 5.5");
    assert.deepEqual(claude.commands.map((c: any) => [c.name, c.desc]), [["compact", "Clear history but keep a summary"], ["review", "Review a pull request"]]);
    assert.deepEqual(claude.account, { email: "fake@example.com", plan: "Claude Pro" });
    const codex = (await request(`${url}/sf/agents/codex/options`, "GET")).json;
    assert.deepEqual(codex.models, [{ id: "gpt-fake", name: "GPT Fake", desc: "a fake model", efforts: ["low", "medium", "high"] }]);
    assert.equal(codex.defaultModel, "GPT Fake");
    assert.deepEqual(codex.account, { email: "fake@example.com", plan: "plus" });
    assert.deepEqual(Object.keys(codex.limits.windows), ["five_hour", "seven_day"]);
    assert.equal(codex.limits.windows.seven_day.utilization, 0.55);
    assert.equal((await request(`${url}/sf/agents/nope/options`, "GET")).status, 404);
  });

  test("effort goes to the agent; context use and plan limits come back from its reply", async () => {
    const id = await c.chat("claude");
    await request(`${url}/sf/chats/${id}/settings`, "POST", { effort: "xhigh", model: "opus" });
    await c.say(id, "args");
    const argv = JSON.parse(await c.lastText(id)) as string[];
    assert.equal(argv[argv.indexOf("--effort") + 1], "xhigh");
    await c.say(id, "usage");
    const meta = (await c.get(id)).meta;
    assert.deepEqual(meta.context, { used: 50500, window: 200000 });
    const opts = (await request(`${url}/sf/agents/claude/options`, "GET")).json;
    assert.equal(opts.limits.windows.five_hour.utilization, 0.42);
    assert.equal((await request(`${url}/sf/chats/${id}/settings`, "POST", { model: "a b; rm" })).status, 400, "a model id is one plain word");
  });

  test("a chat can be renamed", async () => {
    const id = await c.chat("claude");
    assert.equal((await request(`${url}/sf/chats/${id}/title`, "POST", { title: "  Groceries  " })).json.title, "Groceries");
    assert.equal((await request(`${url}/sf/chats/${id}/title`, "POST", { title: " " })).status, 400);
  });

  test("Claude Code's TodoWrite and Codex's plan become the chat's task list", async () => {
    const a = await c.chat("claude");
    await c.say(a, "todo");
    assert.deepEqual((await c.get(a)).meta.tasks.map((t: any) => [t.subject, t.status]), [["Read notes", "completed"], ["Add milk", "in_progress"]]);
    const b = await c.chat("codex");
    await c.say(b, "plan");
    assert.deepEqual((await c.get(b)).meta.tasks.map((t: any) => [t.subject, t.status]), [["Look", "completed"], ["Write", "in_progress"]]);
  });

  test("an attached image reaches Claude Code as an image block, Codex as a local image", async () => {
    for (const [agent, expect] of [["claude", "text,image:image/png:true"], ["codex", "text,localImage"]]) {
      const id = await c.chat(agent);
      const up = (await request(`${url}/sf/chats/${id}/upload`, "POST", { name: "dot.png", type: "image/png", data: PNG })).json;
      assert.equal(up.image, true);
      await c.say(id, "images?", { files: [up] });
      assert.equal(await c.lastText(id), expect);
      assert.equal((await c.get(id)).messages[0].files[0].name, "dot.png");
    }
  });

  test("another file is handed over by path; a path outside the chat's folder is refused", async () => {
    const id = await c.chat("claude");
    const up = (await request(`${url}/sf/chats/${id}/upload`, "POST", { name: "../../notes.txt", type: "text/plain", data: Buffer.from("hi").toString("base64") })).json;
    assert.equal(up.name, "notes.txt"); // the name can't climb out of the chat's folder
    const again = (await request(`${url}/sf/chats/${id}/upload`, "POST", { name: "notes.txt", type: "text/plain", data: "aGk=" })).json;
    assert.equal(again.name, "notes (2).txt"); // never overwrites an earlier attachment
    await c.say(id, "args", { files: [up] });
    const argv = JSON.parse(await c.lastText(id)) as string[];
    assert.ok(argv.includes(path.dirname(up.path)), "the attachment's folder is readable to the agent");
    const bad = await request(`${url}/sf/chats/${id}/send`, "POST", { text: "hi", files: [{ path: path.resolve("package.json") }] });
    assert.equal(bad.status, 400);
  });

  test("fork Claude Code from an earlier reply: the new chat branches the session at that reply", async () => {
    const id = await c.chat("claude");
    await c.say(id, "hello");
    await c.say(id, "hello");
    const msgs = (await c.get(id)).messages;
    const point = msgs[1].point;
    assert.ok(point, "replies keep their fork point");
    const fork = (await request(`${url}/sf/chats/${id}/fork`, "POST", { at: 1 })).json;
    assert.equal((await c.get(fork.id)).messages.length, 2);
    await c.say(fork.id, "args");
    const argv = JSON.parse(await c.lastText(fork.id)) as string[];
    assert.equal(argv[argv.indexOf("--resume") + 1], "sess-1");
    assert.ok(argv.includes("--fork-session"));
    assert.equal(argv[argv.indexOf("--resume-session-at") + 1], point);
    // after its first reply the fork resumes its own session, not the original's
    const meta = (await c.get(fork.id)).meta;
    assert.equal(meta.fork, undefined);
    assert.ok(meta.sessionId);
  });

  test("fork Codex from its latest reply: thread/fork", async () => {
    const id = await c.chat("codex");
    await c.say(id, "hello");
    const fork = (await request(`${url}/sf/chats/${id}/fork`, "POST", { at: 1 })).json;
    await c.say(fork.id, "args");
    const info = JSON.parse(await c.lastText(fork.id));
    assert.equal(info.threadMethod, "thread/fork");
    assert.equal(info.threadParams.threadId, "thr-1");
    assert.equal((await c.get(fork.id)).meta.sessionId, "thr-fork");
  });

  test("forking from a message that isn't a reply is refused", async () => {
    const id = await c.chat("claude");
    await c.say(id, "hello");
    assert.equal((await request(`${url}/sf/chats/${id}/fork`, "POST", { at: 0 })).status, 409);
    assert.equal((await request(`${url}/sf/chats/${id}/fork`, "POST", { at: 9 })).status, 409);
  });
});
