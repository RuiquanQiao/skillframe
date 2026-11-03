// examples/studio/stacks.js: Studio runs a project the way its own stack runs it. Detection is
// checked on folders shaped like each stack; running is checked for real with a Node project, a
// Python server set up in .skillframe/run.json, and a server that crashes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { PKG, tmpDir } from "./helpers.js";

const { detect, AppRun } = await import(pathToFileURL(path.resolve(PKG, "../../examples/studio/stacks.js")).href);

/** a folder holding these files */
function folder(files: Record<string, string>): string {
  const dir = tmpDir("stack");
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const pkg = (scripts: object, deps: object = {}) => JSON.stringify({ scripts, devDependencies: deps });

/** runs it until `until(status)` or it times out; the run is stopped after */
async function runUntil(dir: string, spec: any, until: (s: any) => boolean) {
  const seen: any[] = [];
  let done!: (s: any) => void;
  const hit = new Promise<any>((r) => (done = r));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const run = new AppRun(dir, spec, port, (s: any) => {
    seen.push(s);
    if (until(s)) done(s);
  });
  await run.start();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out; saw ${JSON.stringify(seen)}\n${run.tail()}`)), 30_000));
  try {
    return { status: await Promise.race([hit, timeout]), run, port };
  } finally {
    run.stop();
  }
}

describe("Studio's stacks", () => {
  test("each stack is recognized by its own files, and run with its own command", () => {
    const cases: [string, Record<string, string>, string, RegExp][] = [
      ["Vite (npm)", { "package.json": pkg({ dev: "vite" }, { vite: "5" }), "package-lock.json": "{}" }, "Vite", /^npm run dev -- --port \{port\} --strictPort$/],
      ["Next.js (pnpm)", { "package.json": pkg({ dev: "next dev" }, { next: "15" }), "pnpm-lock.yaml": "" }, "Next.js", /^pnpm run dev$/],
      ["a start script", { "package.json": pkg({ start: "node server.js" }) }, "Node", /^npm run start$/],
      ["Django", { "manage.py": "" }, "Django", /manage\.py runserver 127\.0\.0\.1:\{port\}$/],
      ["Flask", { "app.py": "from flask import Flask\napp = Flask(__name__)\n" }, "Flask", /-m flask --app app run --debug --port \{port\}$/],
      ["FastAPI", { "main.py": "from fastapi import FastAPI\napi = FastAPI()\n" }, "FastAPI", /-m uvicorn main:api --reload --port \{port\}$/],
      ["Streamlit", { "dash.py": "import streamlit as st\n" }, "Streamlit", /-m streamlit run dash\.py --server\.port \{port\}/],
      ["Go", { "go.mod": "module x\n" }, "Go", /^go run \.$/],
      ["Rust", { "Cargo.toml": "[package]\n" }, "Rust", /^cargo run$/],
      ["Flutter", { "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }, "Flutter", /^flutter run -d web-server .*--web-port \{port\}$/],
      [".NET", { "App.csproj": "<Project/>" }, ".NET", /^dotnet watch run --urls http:\/\/127\.0\.0\.1:\{port\}$/],
      ["PHP", { "index.php": "<?php" }, "PHP", /^php -S 127\.0\.0\.1:\{port\}$/],
      ["run.json beats everything", { "package.json": pkg({ dev: "vite" }), ".skillframe/run.json": JSON.stringify({ name: "Mine", command: "make serve" }) }, "Mine", /^make serve$/],
    ];
    for (const [what, files, stack, command] of cases) {
      const spec = detect(folder(files));
      assert.equal(spec?.stack, stack, what);
      assert.match(spec.command, command, what);
    }
    assert.equal(detect(folder({ "index.html": "<p>hi" })), null, "plain files are served as they are");
    assert.equal(detect(folder({ "package.json": pkg({ build: "tsc" }) })), null, "no dev, start or serve script: nothing to run");
  });

  test("dependencies not installed yet are installed first", () => {
    const spec = detect(folder({ "package.json": JSON.stringify({ scripts: { dev: "vite" }, dependencies: { vite: "5" } }) }));
    assert.equal(spec.install, "npm install");
    assert.equal(detect(folder({ "package.json": pkg({ start: "node s.js" }) })).install, undefined, "nothing to install");
  });

  test("a Node project: its dev script runs, and the address it prints is shown", async () => {
    const dir = folder({
      "package.json": pkg({ dev: "node server.js" }),
      "server.js": `require("http").createServer((q, s) => s.end("hi")).listen(process.env.PORT, "127.0.0.1", () => console.log("  ➜  Local:   \\x1b[36mhttp://localhost:" + process.env.PORT + "/\\x1b[0m"));`,
    });
    const { status, port } = await runUntil(dir, detect(dir), (s) => s.state === "running");
    assert.equal(status.url, `http://localhost:${port}/`, "colors stripped, the address as printed");
    assert.equal(status.stack, "Node");
  });

  test("any other stack through .skillframe/run.json: a Python server that prints no address is found by its port", { skip: spawnSync("python", ["--version"]).status !== 0 && "no python on PATH" }, async () => {
    const dir = folder({
      ".skillframe/run.json": JSON.stringify({ name: "Python", command: "python -m http.server {port} --bind 127.0.0.1", url: "http://127.0.0.1:{port}/" }),
      "index.html": "<p>from python</p>",
    });
    const { status, port } = await runUntil(dir, detect(dir), (s) => s.state === "running");
    assert.equal(status.url, `http://127.0.0.1:${port}/`);
    assert.equal(status.own, true);
  });

  test("a server that crashes: stopped, with its exit code and its output kept for the agent", async () => {
    const dir = folder({ "package.json": pkg({ dev: "node boom.js" }), "boom.js": `console.error("Error: Cannot find module 'left-pad'"); process.exit(3);` });
    const { status, run } = await runUntil(dir, detect(dir), (s) => s.state === "exited");
    assert.notEqual(status.code, 0);
    assert.match(run.tail(), /Cannot find module 'left-pad'/);
  });

  test("stop() ends the whole tree: the port is free again", async () => {
    const dir = folder({
      "package.json": pkg({ dev: "node server.js" }),
      "server.js": `require("http").createServer((q, s) => s.end("hi")).listen(process.env.PORT, "127.0.0.1", () => console.log("http://127.0.0.1:" + process.env.PORT));`,
    });
    const { status } = await runUntil(dir, detect(dir), (s) => s.state === "running");
    // runUntil stopped it (npm, its shell and node all go)
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      gone = await fetch(status.url, { signal: AbortSignal.timeout(500) }).then(() => false, () => true);
      if (!gone) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(gone, "the server still answers after stop()");
  });
});
