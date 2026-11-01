// `npm create skillframe` from a developer's point of view: make an app, install it, start it,
// and have the agent (a fake one) use the app's tools.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { appDataDir } from "../src/index.js";
import { fakeEnv, PKG, request, tmpDir } from "./helpers.js";

const CREATE = path.resolve(PKG, "../create-skillframe/index.js");

function npm(args: string[], cwd: string) {
  // under `npm test`, npm says where it is; otherwise the one on PATH
  const cli = process.env.npm_execpath;
  return cli && cli.endsWith(".js")
    ? spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" })
    : spawnSync("npm", args, { cwd, encoding: "utf8", shell: true });
}

describe("appDataDir", () => {
  test("follows each system's convention", () => {
    assert.equal(appDataDir("a", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "win32"), path.join("C:\\Users\\u\\AppData\\Roaming", "a"));
    assert.match(appDataDir("a", {}, "darwin"), /Library[\\/]Application Support[\\/]a$/);
    assert.equal(appDataDir("a", { XDG_DATA_HOME: "/x" }, "linux"), path.join("/x", "a"));
    assert.match(appDataDir("a", {}, "linux"), /\.local[\\/]share[\\/]a$/);
  });
});

describe("what npm would publish", () => {
  for (const [pkg, must] of [
    ["skillframe", ["README.md", "LICENSE", "dist/src/index.js", "dist/src/index.d.ts", "src/index.ts", "ui/skillframe-chat.js", "bin/mcp-bridge.js"]],
    ["create-skillframe", ["README.md", "LICENSE", "index.js", "template/server.js", "template/gitignore", "template/public/index.html"]],
  ] as const) {
    test(`${pkg} carries everything it needs, and no tests`, { timeout: 120_000 }, () => {
      const r = npm(["pack", "--dry-run", "--json"], path.resolve(PKG, "..", pkg));
      assert.equal(r.status, 0, r.stderr);
      const files: string[] = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].files.map((f: any) => f.path);
      for (const f of must) assert.ok(files.includes(f), `${pkg} is missing ${f}`);
      assert.ok(!files.some((f) => f.includes("test/") || f.includes(".cache")), "no tests or caches");
    });
  }
});

describe("npm create skillframe", () => {
  const root = tmpDir("scaffold");
  const app = path.join(root, "My Todo App");
  let server: ReturnType<typeof spawn> | undefined;
  after(() => server?.kill());

  test("refuses without a folder, and refuses a folder that isn't empty", () => {
    const none = spawnSync(process.execPath, [CREATE], { encoding: "utf8" });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /Say which folder/);
    const busy = spawnSync(process.execPath, [CREATE, PKG], { encoding: "utf8" });
    assert.equal(busy.status, 1);
    assert.match(busy.stderr, /isn't empty/);
  });

  test("creates an app that installs, starts, and gives the agent its tools", { timeout: 120_000 }, async () => {
    const made = spawnSync(process.execPath, [CREATE, app, "--skillframe", `file:${PKG}`], { encoding: "utf8", cwd: root });
    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stdout, /npm install\s+npm start/);
    for (const f of ["package.json", "server.js", "public/index.html", "README.md", ".gitignore"]) assert.ok(existsSync(path.join(app, f)), f);
    const pkg = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
    assert.equal(pkg.name, "my-todo-app");
    assert.match(pkg.dependencies.skillframe, /^file:/);
    assert.ok(!readFileSync(path.join(app, "server.js"), "utf8").includes("{{"), "every placeholder filled");

    const install = npm(["install", "--no-audit", "--no-fund"], app);
    assert.equal(install.status, 0, install.stderr);

    const home = path.join(root, "data");
    server = spawn(process.execPath, ["server.js"], { cwd: app, env: { ...fakeEnv(), PORT: "0", APP_HOME: home } });
    const url = await new Promise<string>((resolve, reject) => {
      let out = "";
      server!.stdout!.on("data", (d) => {
        out += d;
        const m = out.match(/running at (http:\/\/\S+?)\/?\s/);
        if (m) resolve(m[1]);
      });
      server!.on("exit", (code) => reject(new Error(`the app exited (${code}): ${out}`)));
    });

    assert.match((await request(url + "/", "GET")).text, /<skillframe-chat/);
    const todos = (await request(`${url}/sf/files?path=todos.json`, "GET")).json;
    assert.match(todos.text, /Ask the agent to add a todo/);
    assert.ok(existsSync(path.join(home, "workspace", "todos.json")), "data goes to the app's data folder");

    // the fake agent calls the app's first tool (list_todos) over MCP
    const chat = (await request(`${url}/sf/chats`, "POST", { agent: "claude" })).json.id;
    await request(`${url}/sf/chats/${chat}/send`, "POST", { text: "tool {}" });
    let reply: any;
    for (let i = 0; i < 100 && !reply; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const m = (await request(`${url}/sf/chats/${chat}`, "GET")).json;
      if (!m.live && m.messages.length === 2) reply = m.messages[1];
    }
    const step = reply.blocks.find((b: any) => b.type === "tool");
    assert.equal(step.status, "done");
    assert.match(step.result, /Ask the agent to add a todo/);
  });
});
