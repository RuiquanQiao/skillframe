// Studio: build an app inside skillframe. Open a project folder: the agent in the sidebar works in
// that folder, and the main area shows the project's page, which reloads by itself when a file
// changes. What the user is looking at and the errors the page throws reach the agent with each
// message. A project with its own dev server (Vite, Next…) shows that address instead.
//
//   npm run studio [-- <folder>]        (from the repository root)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
// APP_HOME puts the data somewhere else (the tests use it)
const home = process.env.APP_HOME ?? here;
const dataDir = path.join(home, ".data");
const stateFile = path.join(dataDir, "studio.json");
mkdirSync(dataDir, { recursive: true });

// window.mjs restarts the server, in the same window, when it exits with this code
const RESTART = 75;

let saved = { recent: [], last: null };
try { saved = { ...saved, ...JSON.parse(readFileSync(stateFile, "utf8")) }; } catch {}

let origin = "";
let project = null; // { folder, name, preview: { url, close } }
let sf = null;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".wasm": "application/wasm", ".mp4": "video/mp4", ".mp3": "audio/mpeg",
};

// put into every HTML page the preview serves: reload on change, and tell the studio page where
// the user is and what went wrong
const INJECT = `<script>(() => {
  const post = (m) => parent !== window && parent.postMessage({ studio: m }, "*");
  post({ type: "start" });
  const where = () => post({ type: "page", path: location.pathname + location.search + location.hash, title: document.title });
  addEventListener("load", where); addEventListener("hashchange", where); addEventListener("popstate", where);
  addEventListener("error", (e) => post({ type: "error", text: e.message + (e.filename ? " (" + e.filename.replace(location.origin, "") + ":" + e.lineno + ")" : "") }));
  addEventListener("unhandledrejection", (e) => post({ type: "error", text: "Unhandled promise rejection: " + (e.reason && e.reason.message || e.reason) }));
  const err = console.error; console.error = (...a) => { post({ type: "error", text: a.map(String).join(" ") }); err.apply(console, a); };
  new EventSource("/__studio/reload").onmessage = () => location.reload();
})();</script>`;

const EMPTY = (name) => `<!doctype html><meta charset="utf-8"><title>${name}</title>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0;height:100vh;display:grid;place-items:center;color:GrayText}p{max-width:36ch;text-align:center;line-height:1.5}</style>
<p>This folder has no index.html yet. Ask the agent to make one, and it shows here as soon as it's written.</p>`;

/** a small server for the project's own files, on a port of its own so the page runs as it would on its own */
async function startPreview(folder) {
  const clients = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/__studio/reload") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" }).write(": hi\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return res.writeHead(400).end(); }
    let file = path.join(folder, rel);
    if (path.relative(folder, file).startsWith("..")) return res.writeHead(403).end();
    try { if (statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch {}
    if (!existsSync(file)) {
      if (rel === "/" || rel === "/index.html") return html(res, EMPTY(path.basename(folder)), 200);
      return html(res, `<!doctype html><meta charset="utf-8"><title>Not found</title><p>${rel.replace(/[<&]/g, "")} was not found in the project folder.</p>`, 404);
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    if (type.startsWith("text/html")) return html(res, readFileSync(file, "utf8"), 200);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  });
  const html = (res, text, status) => {
    // first thing in the page, so it hears the errors of the page's own scripts too
    // (after the doctype if there is no <head>: before it, the page would lose standards mode)
    const at = /<head[^>]*>/i.exec(text) ?? /^\s*<!doctype[^>]*>/i.exec(text);
    const cut = at ? at.index + at[0].length : 0;
    const body = text.slice(0, cut) + INJECT + text.slice(cut);
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(body);
  };
  // any change in the folder, apart from dependencies, version control and dot folders, reloads the page
  let timer;
  const watcher = watch(folder, { recursive: true }, (_event, name) => {
    if (name && /(^|[\\/])(node_modules|\.git|\.[^\\/]*)([\\/]|$)/.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { for (const c of clients) c.write("data: reload\n\n"); }, 150);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => {
      watcher.close();
      clearTimeout(timer);
      for (const c of clients) c.end();
      server.closeAllConnections();
      return new Promise((r) => server.close(r));
    },
  };
}

async function open(folder) {
  folder = path.resolve(String(folder ?? ""));
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`${folder} is not a folder.`);
  if (sf) {
    sf.publish("studio-switched", { folder }); // open windows reload onto the new project
    await sf.close();
  }
  await project?.preview.close();
  const preview = await startPreview(folder);
  project = { folder, name: path.basename(folder) || folder, preview };
  // each project keeps its own chats
  const id = createHash("sha1").update(folder.toLowerCase()).digest("hex").slice(0, 12);
  sf = createSkillframe({
    appName: "skillframe Studio",
    workspace: folder,
    dataDir: path.join(dataDir, "projects", id),
    context: ({ screen }) => {
      const s = screen ?? {};
      const shows = s.url && !s.url.startsWith(preview.url) ? s.url : preview.url;
      return [
        `The user is building the project in ${folder} (your working folder) and sees it running in the main area, next to you.`,
        shows === preview.url
          ? `The main area shows the folder's own files as a website at ${preview.url}: index.html is the start page, and it reloads by itself whenever a file in the folder changes, so there is nothing to start or refresh. If the project needs a dev server of its own, start it and call show_in_preview with its address.`
          : `The main area shows ${shows}, a server of the project's own.`,
        s.path ? `The user is looking at ${s.path}${s.title ? ` ("${s.title}")` : ""}.` : "",
        s.errors?.length ? `The page reported these errors since it last loaded:\n${s.errors.map((e) => `- ${e}`).join("\n")}` : "",
      ].filter(Boolean).join("\n");
    },
    tools: {
      show_in_preview: {
        description: "Show an address in the main area of the studio, next to the chat: a page of the project (\"/about.html\") or the project's own dev server (\"http://localhost:5173\").",
        input: { url: "string" },
        run: ({ url }) => {
          const target = String(url).startsWith("/") ? preview.url + String(url).slice(1) : String(url);
          if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(target)) throw new Error("Only addresses on this computer (localhost) can be shown.");
          sf.publish("studio-show", { url: target });
          return `The main area now shows ${target}.`;
        },
      },
    },
  });
  sf.setOrigin(origin);
  saved = { recent: [folder, ...saved.recent.filter((f) => f.toLowerCase() !== folder.toLowerCase())].slice(0, 8), last: folder };
  writeFileSync(stateFile, JSON.stringify(saved, null, 2) + "\n");
}

/** the system's folder picker (Windows only); resolves with the folder, or null when cancelled */
function browse() {
  if (process.platform !== "win32") return Promise.resolve(null);
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$d.Description = 'Open a project folder in skillframe Studio'",
    "$d.ShowNewFolderButton = $true",
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }",
    "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Write($d.SelectedPath) }",
  ].join("; ");
  return new Promise((resolve) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("exit", () => resolve(out.trim() || null));
    p.on("error", () => resolve(null));
  });
}

const json = (res, status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
const body = (req) => new Promise((resolve) => { let t = ""; req.on("data", (c) => (t += c)); req.on("end", () => { try { resolve(JSON.parse(t || "{}")); } catch { resolve({}); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  // the same loopback-only rule skillframe applies to its own routes
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host ?? "")) return json(res, 403, { error: "Forbidden host" });
  if (url.pathname.startsWith("/sf/") || url.pathname === "/sf") {
    if (sf && (await sf.handler(req, res))) return;
    return json(res, 404, { error: "No project is open" });
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return createReadStream(path.join(here, "public", "index.html")).pipe(res);
  }
  if (req.method === "GET" && url.pathname === "/studio/state") {
    return json(res, 200, {
      project: project && { folder: project.folder, name: project.name, preview: project.preview.url },
      recent: saved.recent.filter((f) => existsSync(f)),
      canBrowse: process.platform === "win32",
      canRestart: process.env.STUDIO_RESTARTABLE === "1",
    });
  }
  if (req.method === "POST" && url.pathname === "/studio/open") {
    try {
      await open((await body(req)).folder);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (req.method === "POST" && url.pathname === "/studio/browse") return json(res, 200, { folder: await browse() });
  if (req.method === "POST" && url.pathname === "/studio/restart" && process.env.STUDIO_RESTARTABLE === "1") {
    json(res, 200, { ok: true });
    setTimeout(() => process.exit(RESTART), 100);
    return;
  }
  json(res, 404, { error: "Not found" });
});

await new Promise((r) => server.listen(Number(process.env.PORT ?? 4350), "127.0.0.1", r));
origin = `http://127.0.0.1:${server.address().port}`;
// the folder to open: given on the command line or by window.mjs, else the last one
const first = process.argv[2] ?? process.env.PROJECT ?? saved.last;
if (first) await open(first).catch((e) => console.error(e.message));
console.log(`skillframe Studio is running at ${origin}/`);
