// scripts/window.mjs, which the .exe files in demos/ run: it starts an example's
// server, opens a window on it, and stops the server when the window closes. A fake window stands
// in for Edge, and the example's data goes to a scratch folder.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fakeEnv, PKG, tmpDir } from "./helpers.js";

const SCRIPT = path.resolve(PKG, "../../scripts/window.mjs");
const FAKE_WINDOW = path.join(PKG, "test/fixtures/fake-window.mjs");

/** runs window.mjs for `app`, its window staying open `ms`; resolves when it exits */
function open(app: string, dir: string, ms: number) {
  const child = spawn(process.execPath, [SCRIPT, app], {
    env: {
      ...fakeEnv(),
      APP_HOME: path.join(dir, "app"),
      WINDOW_HOME: path.join(dir, "window"),
      WINDOW_BROWSER: FAKE_WINDOW,
      FAKE_WINDOW_LOG: path.join(dir, "windows.log"),
      FAKE_WINDOW_MS: String(ms),
    },
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  return new Promise<{ code: number | null; stderr: string }>((resolve) => child.on("exit", (code) => resolve({ code, stderr })));
}

const windows = (dir: string) => readFileSync(path.join(dir, "windows.log"), "utf8").trim().split("\n");

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe("scripts/window.mjs", () => {
  test("opens the page in a window, and closing the window stops the server", async () => {
    const dir = tmpDir("window");
    const { code, stderr } = await open("blank", dir, 300);
    assert.equal(code, 0, stderr);
    const [line] = windows(dir);
    assert.match(line, /^200 http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(existsSync(path.join(dir, "window/running.json")), false, "the lock is left behind");
    // the server went with the window
    const url = line.split(" ")[1];
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }));
  });

  test("opening it again while it runs opens another window on the same server", async () => {
    const dir = tmpDir("window");
    const first = open("blank", dir, 4000);
    await until(() => existsSync(path.join(dir, "window/running.json")) && existsSync(path.join(dir, "windows.log")), "the first window");
    const second = await open("blank", dir, 0);
    assert.equal(second.code, 0, second.stderr);
    assert.equal((await first).code, 0);
    const [a, b] = windows(dir);
    assert.equal(a, b, "both windows show the same address");
  });

  test("Studio's restart starts the server again on the same address, with the same project, while the window stays", async () => {
    const dir = tmpDir("window");
    const site = path.join(dir, "site");
    mkdirSync(site, { recursive: true });
    const child = spawn(process.execPath, [SCRIPT, "studio", site], {
      env: { ...fakeEnv(), APP_HOME: path.join(dir, "app"), WINDOW_HOME: path.join(dir, "window"), WINDOW_BROWSER: FAKE_WINDOW, FAKE_WINDOW_LOG: path.join(dir, "windows.log"), FAKE_WINDOW_MS: "8000" },
    });
    const exited = new Promise<number | null>((r) => child.on("exit", r));
    const lock = path.join(dir, "window/running.json");
    await until(() => existsSync(lock), "the server");
    const { url } = JSON.parse(readFileSync(lock, "utf8"));
    const state = async () => (await fetch(url + "studio/state")).json();
    assert.equal((await state()).project.folder, site);
    assert.equal((await state()).canRestart, true);

    await fetch(url + "studio/restart", { method: "POST" });
    // first gone, then back
    let down = false;
    for (let i = 0; i < 100 && !down; i++) {
      await new Promise((r) => setTimeout(r, 50));
      down = await state().then(() => false, () => true);
    }
    assert.ok(down, "the server went down");
    let back = false;
    for (let i = 0; i < 100 && !back; i++) {
      await new Promise((r) => setTimeout(r, 200));
      back = await state().then((s) => s.project?.folder === site, () => false);
    }
    assert.ok(back, "the server came back with the project");
    assert.equal(child.exitCode, null, "window.mjs kept running");
    assert.equal(await exited, 0);
  });

  test("an unknown example ends with a message the .exe can show", async () => {
    const { code, stderr } = await open("nope", tmpDir("window"), 0);
    assert.equal(code, 1);
    assert.match(stderr, /nope/);
  });

  // the .exe files live in demos/, a folder below the repository: the launcher has to look up for it
  const csc = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  test("a launcher .exe in a folder below the repository finds window.mjs and opens the example", { skip: !existsSync(csc) && "needs Windows' C# compiler" }, async () => {
    const dir = tmpDir("window");
    const exe = path.join(dir, "deep", "below", "Blank.exe");
    mkdirSync(path.dirname(exe), { recursive: true });
    const app = path.join(dir, "App.cs");
    writeFileSync(app, 'static class App { public const string Id = "blank"; public const string Title = "Blank"; }\n');
    const built = spawnSync(csc, ["/nologo", "/target:winexe", `/out:${exe}`, "/r:System.Windows.Forms.dll", path.resolve(PKG, "../../scripts/launcher/Launcher.cs"), app], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const child = spawn(exe, [], {
      env: { ...fakeEnv(), APP_HOME: path.join(dir, "app"), WINDOW_HOME: path.join(dir, "window"), WINDOW_BROWSER: FAKE_WINDOW, FAKE_WINDOW_LOG: path.join(dir, "windows.log"), FAKE_WINDOW_MS: "300" },
    });
    assert.equal(await new Promise((r) => child.on("exit", r)), 0);
    assert.match(windows(dir)[0], /^200 http:\/\/127\.0\.0\.1:\d+\/$/);
  });
});
