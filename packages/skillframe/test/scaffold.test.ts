// `npm create skillframe` from a developer's point of view: make an app, install it, start it,
// and have the agent (a fake one) use the app's tools.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    ["skillframe", ["README.md", "LICENSE", "dist/src/index.js", "dist/src/index.d.ts", "src/index.ts", "ui/skillframe-chat.js", "bin/mcp-bridge.js", "bin/eject.js", "bin/skillframe.js"]],
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
    let url: string;
    ({ server, url } = await start(app, home));

    assert.match((await request(url + "/", "GET")).text, /<skillframe-chat/);
    const todos = (await request(`${url}/sf/files?path=todos.json`, "GET")).json;
    assert.match(todos.text, /Ask the agent to add a todo/);
    assert.ok(existsSync(path.join(home, "workspace", "todos.json")), "data goes to the app's data folder");

    // the fake agent calls the app's first tool (list_todos) over MCP
    assert.match(await toolResult(url, "claude"), /Ask the agent to add a todo/);
  });
});

describe("npm create skillframe --eject", () => {
  const root = tmpDir("eject");
  const app = path.join(root, "own");
  let server: ReturnType<typeof spawn> | undefined;
  after(() => server?.kill());

  test("puts skillframe's core and sidebar in the app, imported by path", () => {
    const made = spawnSync(process.execPath, [CREATE, app, "--eject"], { encoding: "utf8", cwd: root });
    assert.equal(made.status, 0, made.stderr);
    for (const f of ["skillframe/index.js", "skillframe/core/index.js", "skillframe/core/drivers/acp.js", "skillframe/ui/skillframe-chat.js", "skillframe/bin/mcp-bridge.js", "skillframe/README.md", "skillframe/LICENSE"]) {
      assert.ok(existsSync(path.join(app, f)), f);
    }
    assert.ok(!existsSync(path.join(app, "skillframe/core/index.d.ts")), "no type files that would go stale");
    assert.equal(JSON.parse(readFileSync(path.join(app, "package.json"), "utf8")).dependencies, undefined, "nothing to install");
    assert.match(readFileSync(path.join(app, "server.js"), "utf8"), /from "\.\/skillframe\/index\.js"/);
    assert.match(readFileSync(path.join(app, "README.md"), "utf8"), /skillframe\/README\.md/);
  });

  test("also ejects when the shell dropped `--` and npm passed --eject on as npm_config_eject", () => {
    const other = path.join(root, "powershell");
    const made = spawnSync(process.execPath, [CREATE, other], { encoding: "utf8", cwd: root, env: { ...process.env, npm_config_eject: "true" } });
    assert.equal(made.status, 0, made.stderr);
    assert.ok(existsSync(path.join(other, "skillframe/core/index.js")), "skillframe copied in");
    assert.match(readFileSync(path.join(other, "server.js"), "utf8"), /from "\.\/skillframe\/index\.js"/);
  });

  test("the app runs its own copy: an edit to the copied sidebar is what the page gets, and tools work over HTTP and the stdio bridge", { timeout: 60_000 }, async () => {
    const ui = path.join(app, "skillframe/ui/skillframe-chat.js");
    writeFileSync(ui, readFileSync(ui, "utf8") + "\n// edited in the app\n");
    let url: string;
    ({ server, url } = await start(app, path.join(root, "data")));

    const page = await request(`${url}/sf/ui/skillframe-chat.js`, "GET");
    assert.equal(page.status, 200);
    assert.match(page.text, /edited in the app/);
    assert.match(await toolResult(url, "claude"), /Ask the agent to add a todo/);
    // the fake ACP agent takes no HTTP MCP servers, so this goes through the copied bin/mcp-bridge.js
    assert.match(await toolResult(url, "qwen"), /Ask the agent to add a todo/);
  });
});

describe("npx skillframe eject", () => {
  const CLI = path.join(PKG, "bin/skillframe.js");
  const root = tmpDir("eject-cli");

  test("copies into ./skillframe, says which import to change, and won't overwrite", () => {
    const r = spawnSync(process.execPath, [CLI, "eject"], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(path.join(root, "skillframe/core/index.js")));
    assert.match(r.stdout, /from "\.\/skillframe\/index\.js"/);
    const again = spawnSync(process.execPath, [CLI, "eject"], { encoding: "utf8", cwd: root });
    assert.equal(again.status, 1);
    assert.match(again.stderr, /isn't empty/);
  });

  test("explains itself without a command, and fails on an unknown one", () => {
    const help = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /skillframe eject/);
    assert.equal(spawnSync(process.execPath, [CLI, "ejcet"], { encoding: "utf8" }).status, 1);
  });
});

/** starts a made app's server.js with fake agents; resolves with the address it prints */
function start(app: string, home: string) {
  const server = spawn(process.execPath, ["server.js"], { cwd: app, env: { ...fakeEnv(), PORT: "0", APP_HOME: home } });
  const url = new Promise<string>((resolve, reject) => {
    let out = "";
    server.stdout!.on("data", (d) => {
      out += d;
      const m = out.match(/running at (http:\/\/\S+?)\/?\s/);
      if (m) resolve(m[1]);
    });
    server.on("exit", (code) => reject(new Error(`the app exited (${code}): ${out}`)));
  });
  return url.then((u) => ({ server, url: u }));
}

/** has a fake agent call the app's first tool (list_todos); resolves with the tool's result */
async function toolResult(url: string, agent: string): Promise<string> {
  const chat = (await request(`${url}/sf/chats`, "POST", { agent })).json.id;
  await request(`${url}/sf/chats/${chat}/send`, "POST", { text: "tool {}" });
  let reply: any;
  for (let i = 0; i < 100 && !reply; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const m = (await request(`${url}/sf/chats/${chat}`, "GET")).json;
    if (!m.live && m.messages.length === 2) reply = m.messages[1];
  }
  assert.ok(reply, `${agent} never finished`);
  const step = reply.blocks.find((b: any) => b.type === "tool");
  assert.equal(step?.status, "done", JSON.stringify(reply.blocks));
  return step.result;
}
