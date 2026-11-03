// Opens one of the examples in a window of its own, the way the .exe files in demos/
// do (they only run this script; see scripts/launcher/Launcher.cs).
//
//   node scripts/window.mjs grill-me | hello | blank | studio [folder]
//
// It builds what the example needs, starts its server on a free port, opens the page in a native
// window (demos/skillframe-window.exe, WebView2; `npm run exe` builds it), or in an Edge or Chrome
// window without an address bar when that isn't built, and stops the server once no page of it is open.
// Opening the same example again while it runs only opens another window on the same server.
// Everything it keeps (the window's browser profile, the server's log) is in .cache/window/<app>/.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const apps = {
  "grill-me": { title: "Grill Me", build: ["packages/skillframe"], server: "examples/grill-me/server.js" },
  hello: { title: "Hello Notes", build: ["packages/skillframe", "examples/hello"], server: "examples/hello/dist/server.js" },
  blank: { title: "skillframe", build: ["packages/skillframe"], server: "examples/blank/server.js" },
  studio: { title: "skillframe Studio", build: ["packages/skillframe"], server: "examples/studio/server.js" },
  // an app in another language: it starts `skillframe serve` itself
  python: { title: "Python Todo", build: ["packages/skillframe"], command: ["python", "examples/python/app.py"] },
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

// The server lives as long as a page of it is open, counted by the event streams the pages hold
// (GET /sf/health). Not by the browser process we started: Edge with Startup boost, or a browser
// already running on this profile, takes the window over and that process ends at once, which
// used to stop the server under a window that had just opened ("127.0.0.1 refused to connect").
const win = openWindow(url);
let browserGone = false;
win.on("exit", () => { browserGone = true; });
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => { stop(); process.exit(0); });
watchPages();

async function watchPages() {
  const grace = Number(process.env.WINDOW_GRACE_MS ?? 8000); // a reload or a restart reconnects well within this
  const started = Date.now();
  let seen = false;
  let lastOpen = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const pages = await openPages(url);
    if (pages === null) { lastOpen = Date.now(); continue; } // restarting: not an answer about the window
    if (pages > 0) { seen = true; lastOpen = Date.now(); continue; }
    if (seen ? Date.now() - lastOpen > grace : browserGone && Date.now() - started > 60_000) break;
  }
  stop();
  process.exit(0);
}

/** how many pages hold the server's event stream; null when the server doesn't answer */
async function openPages(at) {
  try {
    const r = await fetch(at + "sf/health", { signal: AbortSignal.timeout(2000) });
    return r.ok ? (await r.json()).pages : null;
  } catch {
    return null;
  }
}

/** starts the server on `port`; resolves with its address, or null if it didn't start */
function start() {
  const [exe, ...args] = app.command ?? [process.execPath, app.server];
  const s = spawn(exe, args.map((a) => (a.startsWith("examples/") ? path.join(root, a) : a)), {
    cwd: root,
    env: { ...process.env, PORT: String(port), PYTHONIOENCODING: "utf-8", STUDIO_RESTARTABLE: "1", ...(folder ? { PROJECT: folder } : {}) },
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
  if (browser.endsWith("skillframe-window.exe")) {
    const args = ["--url", at, "--title", app.title, "--data", path.join(home, "webview"), "--icon", path.join(root, "scripts", "launcher", "skillframe.ico")];
    return spawn(browser, args, { stdio: "ignore", detached: true });
  }
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
  const native = path.join(root, "demos", "skillframe-window.exe");
  if (process.platform === "win32" && existsSync(native)) return native;
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
