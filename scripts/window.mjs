// Opens one of the examples in a window of its own, the way the .exe files at the repository
// root do (they only run this script; see scripts/launcher/Launcher.cs).
//
//   node scripts/window.mjs grill-me | hello | blank | studio [folder]
//
// It builds what the example needs, starts its server on a free port, opens the page in an Edge
// (or Chrome) window without an address bar, and stops the server when the window is closed.
// Opening the same example again while it runs only opens another window on the same server.
// Everything it keeps (the window's browser profile, the server's log) is in .cache/window/<app>/.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const apps = {
  "grill-me": { build: ["packages/skillframe"], server: "examples/grill-me/server.js" },
  hello: { build: ["packages/skillframe", "examples/hello"], server: "examples/hello/dist/server.js" },
  blank: { build: ["packages/skillframe"], server: "examples/blank/server.js" },
  studio: { build: ["packages/skillframe"], server: "examples/studio/server.js" },
};
// the exit code a server uses to ask for a restart
const RESTART = 75;

const zh = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
const say = (en, cn) => (zh ? cn : en);

const name = process.argv[2];
const app = apps[name];
if (!app) fail(`Unknown example "${name}". Known: ${Object.keys(apps).join(", ")}.`, `没有叫 "${name}" 的例子。可选：${Object.keys(apps).join("、")}。`);

// the tests put this folder elsewhere and use a stand-in for the browser
const home = process.env.WINDOW_HOME ?? path.join(root, ".cache", "window", name);
mkdirSync(home, { recursive: true });
const lockFile = path.join(home, "running.json");
const browser = process.env.WINDOW_BROWSER ?? findBrowser();

// a folder to open, for Studio (dropped on the .exe, or given after the app's name)
let folder = process.argv[3] ? path.resolve(process.argv[3]) : undefined;

// already open: another window on the running server
const running = readLock();
if (running && alive(running.pid) && (await answers(running.url))) {
  if (folder) await fetch(running.url + "studio/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) }).catch(() => {});
  openWindow(running.url);
  process.exit(0);
}

if (!existsSync(path.join(root, "node_modules", "typescript")))
  fail("Run `npm install` in the repository folder first.", "请先在仓库文件夹里运行一次 `npm install`。");
const built = build();
if (built) fail(`The build failed:\n\n${built}`, `编译失败：\n\n${built}`);

const port = await freePort();
const log = path.join(home, "server.log");
openSync(log, "w");
let server = null;
let url = null;
url = await start();
if (!url) {
  stop();
  fail(`The server did not start. Its output:\n\n${tail(log)}`, `服务器没能启动。它的输出：\n\n${tail(log)}`);
}
writeFileSync(lockFile, JSON.stringify({ pid: process.pid, url }));

// the window's own browser process lives as long as its last window: when it ends, so does the server
const win = openWindow(url);
win.on("exit", () => { stop(); process.exit(0); });
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => { stop(); process.exit(0); });

/** starts the server on `port`; resolves with its address, or null if it didn't start */
function start() {
  const s = spawn(process.execPath, [path.join(root, app.server)], {
    cwd: root,
    env: { ...process.env, PORT: String(port), STUDIO_RESTARTABLE: "1", ...(folder ? { PROJECT: folder } : {}) },
    stdio: ["ignore", "pipe", openSync(log, "a")],
    windowsHide: true,
  });
  server = s;
  s.stdout.on("data", (chunk) => writeFileSync(log, chunk, { flag: "a" }));
  // a server asking to be restarted (Studio's "Restart server") is built and started again on
  // the same port, so the open windows carry on; one that ends otherwise ends the window's watch
  s.on("exit", async (code) => {
    if (s !== server || !url) return;
    if (code !== RESTART) process.exit(1);
    folder = undefined; // the server remembers the project it had open
    build();
    await start();
  });
  return new Promise((resolve) => {
    let seen = "";
    const timer = setTimeout(() => resolve(null), 60_000);
    s.stdout.on("data", (chunk) => {
      seen += chunk;
      const m = /running at (http\S+)/.exec(seen);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    s.on("exit", () => { clearTimeout(timer); resolve(null); });
  });
}

function openWindow(at) {
  const args = [
    `--app=${at}`,
    `--user-data-dir=${path.join(home, "profile")}`,
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "--window-size=1440,900",
  ];
  // detached: Node ends the children it didn't detach when it exits, and a second launch exits at once
  return browser.endsWith(".mjs")
    ? spawn(process.execPath, [browser, ...args], { stdio: "ignore", detached: true, windowsHide: true })
    : spawn(browser, args, { stdio: "ignore", detached: true });
}

function findBrowser() {
  const bases = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  for (const rel of ["Microsoft\\Edge\\Application\\msedge.exe", "Google\\Chrome\\Application\\chrome.exe"])
    for (const base of bases) if (existsSync(path.join(base, rel))) return path.join(base, rel);
  fail("Neither Microsoft Edge nor Google Chrome was found.", "没有找到 Microsoft Edge 或 Google Chrome。");
}

/** compiles what the app needs (only what changed); returns the compiler's complaint, or "" */
function build() {
  const r = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-b", ...app.build], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? "" : `${r.stdout}${r.stderr}`;
}

function stop() {
  try { rmSync(lockFile, { force: true }); } catch {}
  if (server.exitCode === null) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
}

function readLock() {
  try { return JSON.parse(readFileSync(lockFile, "utf8")); } catch { return null; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function answers(at) {
  try { return (await fetch(at, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on("error", reject);
  });
}

function tail(file) {
  try { return readFileSync(file, "utf8").split("\n").slice(-25).join("\n"); } catch { return ""; }
}

// the .exe shows this text in a message box
function fail(en, cn) {
  process.stderr.write(say(en, cn));
  process.exit(1);
}
