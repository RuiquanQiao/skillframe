// `skillframe serve`: skillframe for an app in any language. The app's tools and context are HTTP
// routes of its own server, and its page is passed through. Checked with a stand-in app server,
// and end to end with the real Python example (examples/python), on the fake agents.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, describe, test } from "node:test";
import { serve } from "../src/serve.js";
import { fakeEnv, PKG, request, tmpDir } from "./helpers.js";

const EXAMPLE = path.resolve(PKG, "../../examples/python");

async function chatSay(base: string, text: string) {
  const id = (await request(`${base}/sf/chats`, "POST", { agent: "claude" })).json.id;
  await request(`${base}/sf/chats/${id}/send`, "POST", { text });
  for (let i = 0; i < 100; i++) {
    const r = (await request(`${base}/sf/chats`, "GET")).json;
    if (!r.running.includes(id)) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  const { messages } = (await request(`${base}/sf/chats/${id}`, "GET")).json;
  return messages.at(-1).blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

describe("skillframe serve", () => {
  const closers: (() => unknown)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });

  test("tools and context are the app's own HTTP routes; its pages pass through; it can publish", async () => {
    const calls: any[] = [];
    const app = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/tools/greet") {
          const { args } = JSON.parse(body);
          calls.push(JSON.parse(body));
          if (!args.name) return res.writeHead(400).end("name is missing");
          return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result: `Hello, ${args.name}` }));
        }
        if (req.url === "/context") return res.writeHead(200).end(`Screen: ${JSON.parse(body).screen?.page ?? "none"}`);
        res.writeHead(200, { "Content-Type": "text/html", "X-From": "app" }).end(`<p>the app's own page at ${req.url}</p>`);
      });
    });
    await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
    closers.push(() => app.close());
    const dir = tmpDir("serve");
    const file = path.join(dir, "skillframe.json");
    writeFileSync(file, JSON.stringify({
      appName: "Any Language App",
      app: `http://127.0.0.1:${(app.address() as any).port}`,
      workspace: "./ws",
      dataDir: "./data",
      context: "/context",
      tools: { greet: { description: "Greet someone", input: { name: "string" }, optional: ["name"], url: "/tools/greet" } },
    }));
    const old = { ...process.env };
    Object.assign(process.env, fakeEnv());
    const { url, sf } = await serve(file);
    closers.push(() => sf.close(), () => Object.assign(process.env, old));
    const base = url.replace(/\/$/, "");

    const page = await fetch(base + "/some/page?x=1");
    assert.equal(page.headers.get("x-from"), "app");
    assert.equal(await page.text(), "<p>the app's own page at /some/page?x=1</p>");
    assert.deepEqual((await request(`${base}/sf/app`, "GET")).json.tools, [{ name: "greet", description: "Greet someone" }]);

    assert.equal(await chatSay(base, 'call greet {"name":"Ada"}'), "tool said: Hello, Ada");
    assert.equal(calls[0].args.name, "Ada");
    assert.ok(calls[0].chatId, "the tool hears which chat called it");
    assert.match(await chatSay(base, 'call greet {}'), /tool said: name is missing/, "a 400 is a failed call the agent can read");
    assert.match(await chatSay(base, "context?"), /Screen: none/);

    // the app pushes an event to the page
    const events: string[] = [];
    const stream = await fetch(base + "/sf/events");
    const reader = stream.body!.getReader();
    const read = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        events.push(new TextDecoder().decode(value));
        if (events.join("").includes("todos-changed")) return;
      }
    })();
    assert.equal((await request(`${base}/sf/publish`, "POST", { name: "todos-changed", data: { n: 2 } })).status, 200);
    await read;
    await reader.cancel();
    assert.match(events.join(""), /"name":"todos-changed","data":\{"n":2\}/);
  });

  test("a config that points tools at another computer is refused", async () => {
    const dir = tmpDir("serve");
    const file = path.join(dir, "skillframe.json");
    writeFileSync(file, JSON.stringify({ appName: "X", tools: { t: { description: "d", url: "http://example.com/t" } } }));
    await assert.rejects(serve(file), /not on this computer/);
  });

  const hasPython = spawnSync("python", ["--version"]).status === 0;
  test("the Python example, end to end: the agent's tool call runs Python, and skillframe ends with the app", { skip: !hasPython && "no python on PATH" }, async () => {
    const home = tmpDir("python");
    const py = spawn("python", [path.join(EXAMPLE, "app.py")], { env: { ...fakeEnv(), APP_HOME: home, PYTHONIOENCODING: "utf-8" }, stdio: ["ignore", "pipe", "pipe"] });
    closers.push(() => py.kill());
    let out = "";
    let err = "";
    py.stderr.on("data", (d) => (err += d));
    const url = await new Promise<string>((resolve, reject) => {
      py.stdout.on("data", (d) => {
        out += d;
        const m = /running at (\S+)/.exec(out);
        if (m) resolve(m[1].replace(/\/$/, ""));
      });
      py.on("exit", () => reject(new Error(`app.py ended: ${out}${err}`)));
      setTimeout(() => reject(new Error(`no address: ${out}${err}`)), 30_000);
    });
    assert.match(await (await fetch(url + "/")).text(), /<title>Python Todo<\/title>/, "the page is the Python app's");
    assert.equal(await chatSay(url, 'call add_todo {"text":"buy milk"}'), "tool said: Added todo #1: buy milk");
    assert.deepEqual(await (await fetch(url + "/todos")).json(), [{ id: 1, text: "buy milk", done: false }]);
    assert.match(await chatSay(url, "context?"), /1 todos, 1 not done/, "Python's context reaches the agent");

    py.kill();
    let gone = false;
    for (let i = 0; i < 60 && !gone; i++) {
      await new Promise((r) => setTimeout(r, 100));
      gone = await fetch(url + "/sf/health", { signal: AbortSignal.timeout(500) }).then(() => false, () => true);
    }
    assert.ok(gone, "skillframe kept running after the app ended");
  });
});
