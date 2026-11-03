// The HTTP interface the sidebar talks to, mounted under a base path (default /sf) in the host
// app's own server or in the one `listen()` starts.
//
// It drives a coding agent that can edit files and run commands, so it only answers the page it
// was made for: the Host header must be a loopback name (no DNS rebinding), anything that changes
// state must come from the same origin as JSON (a web page elsewhere can neither send it nor read
// the answer), and the MCP endpoint wants the token only our own agent processes were given.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { IMAGE_TYPES } from "./chat/store.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Core } from "./index.js";
import { Busy, NotFound } from "./chat/runner.js";
import { Conflict, OutsideWatch } from "./files.js";
import { OWN_ROOT } from "./paths.js";

const UI_DIR = path.join(OWN_ROOT, "ui");
const BODY_CAP = 25 * 1024 * 1024; // an attachment arrives as base64 in JSON

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > BODY_CAP) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** A file under `root`, or false (never anything outside it). */
export function serveFile(root: string, rel: string, res: ServerResponse): boolean {
  const file = path.resolve(root, "." + path.posix.normalize("/" + rel));
  if (file !== root && !file.startsWith(root + path.sep)) return false;
  let target = file;
  if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, "index.html");
  if (!existsSync(target) || !statSync(target).isFile()) return false;
  res.writeHead(200, { "Content-Type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(target).pipe(res);
  return true;
}

function hostOk(req: IncomingMessage, allowed: string[]): boolean {
  const host = req.headers.host ?? "";
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return allowed.includes(name.toLowerCase());
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // not sent by a browser page (curl, the agent's own tools)
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

export function createHandler(core: Core) {
  const base = core.basePath;

  /** true when the request was ours (under the base path) and has been answered */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== base && !url.pathname.startsWith(base + "/")) return false;
    const route = url.pathname.slice(base.length) || "/";
    const method = req.method ?? "GET";
    try {
      if (!hostOk(req, core.allowedHosts)) throw new HttpError(403, "Refused: unexpected Host header");

      if (route === "/mcp") {
        if (!core.mcp) throw new HttpError(404, "This app has no tools");
        await core.mcp.handle(req, res, method === "POST" ? await readBody(req) : "");
        return true;
      }

      if (method !== "GET" && method !== "HEAD") {
        if (!sameOrigin(req)) throw new HttpError(403, "Refused: cross-origin request");
        if (method === "POST" && !(req.headers["content-type"] ?? "").startsWith("application/json")) {
          throw new HttpError(415, "Send JSON (Content-Type: application/json)");
        }
      }
      const body = method === "POST" ? parseJson(await readBody(req)) : {};
      const out = await route_(core, method, route, body, res, url.searchParams);
      if (out !== ANSWERED) json(res, 200, out);
    } catch (e) {
      if (res.headersSent) return true; // e.g. the event stream was already open
      if (e instanceof Conflict) {
        json(res, 409, { error: e.message, conflict: true, current: e.current });
        return true;
      }
      const status =
        e instanceof HttpError ? e.status : e instanceof NotFound ? 404 : e instanceof Busy ? 409 : e instanceof OutsideWatch ? 403 : 500;
      json(res, status, { error: (e as Error).message });
    }
    return true;
  };
}

function parseJson(text: string): Record<string, any> {
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {
    /* falls through */
  }
  throw new HttpError(400, "The body must be a JSON object");
}

const SKIP = /^(node_modules|\.git|dist|build|out|target|__pycache__|\.venv|venv|\.next|\.cache)$/;

/** up to 50 paths under `root` (relative, with /) whose path contains every word of `q`; dot folders and build output are skipped */
export function findFiles(root: string, q: string): string[] {
  const words = q.toLowerCase().split(/[\s/\\]+/).filter(Boolean);
  const out: string[] = [];
  let seen = 0;
  const walk = (dir: string, rel: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => Number(b.isFile()) - Number(a.isFile()) || a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= 50 || ++seen > 5000) return;
      if (e.name.startsWith(".") || SKIP.test(e.name)) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), p);
      else if (words.every((w) => p.toLowerCase().includes(w))) out.push(p);
    }
  };
  walk(root, "");
  return out;
}

/** returned by routes that wrote the response themselves (files, the event stream) */
const ANSWERED = Symbol("answered");

async function route_(core: Core, method: string, route: string, b: Record<string, any>, res: ServerResponse, query: URLSearchParams): Promise<unknown> {
  const { runner, store } = core;
  const m = route.match(/^\/chats\/([\w-]+)(\/[a-z]+)?$/);
  const id = m?.[1];
  const action = m?.[2];

  if (method === "GET" && route.startsWith("/ui/")) {
    if (serveFile(UI_DIR, route.slice(4), res)) return ANSWERED;
    throw new HttpError(404, "Not found");
  }
  if (method === "GET" && route === "/events") {
    core.bus.attach(res);
    return ANSWERED;
  }
  if (method === "GET" && route === "/app") return core.appInfo();
  if (method === "GET" && route === "/health") return { ok: true, pages: core.bus.pages };
  // files in the agent's folder, for "@" in the message box (names only, never their contents)
  if (method === "GET" && route === "/workspace/files") return { files: findFiles(core.workspace, query.get("q") ?? "") };
  // the host app (in any language) pushes an event of its own to every open page
  if (method === "POST" && route === "/publish") {
    if (typeof b.name !== "string" || !/^[\w.:-]{1,64}$/.test(b.name)) throw new HttpError(400, "Send { name, data }; name is a word");
    core.bus.publish("sf", { name: b.name, data: b.data ?? null });
    return { ok: true };
  }
  if (route === "/files") {
    if (!core.files) throw new HttpError(404, "This app shares no files with the agent");
    if (method === "GET") return core.files.read(query.get("path") ?? "");
    if (method === "POST") {
      if (typeof b.path !== "string" || typeof b.text !== "string") throw new HttpError(400, "Send { path, text, baseHash? }");
      const v = core.files.write(b.path, b.text, typeof b.baseHash === "string" ? { baseHash: b.baseHash } : {});
      return { path: v.path, hash: v.hash };
    }
  }
  const agentRoute = route.match(/^\/agents\/([\w-]+)\/options$/);
  if (method === "GET" && agentRoute) return core.agentOptions(agentRoute[1], query.get("refresh") === "1");
  if (method === "GET" && route === "/chats") return { chats: store.list(), running: [...runner.turns.keys()] };
  if (method === "POST" && route === "/chats") {
    const agent = typeof b.agent === "string" && core.agentIds.includes(b.agent) ? b.agent : core.agentIds[0];
    return store.create({ title: String(b.title ?? ""), agent });
  }
  if (id && !action && method === "GET") {
    const meta = store.meta(id);
    if (!meta) throw new NotFound("Chat not found");
    return { meta, messages: store.messages(id), live: runner.live(id) };
  }
  if (id && !action && method === "DELETE") {
    runner.cancel(id);
    store.delete(id);
    return { ok: true };
  }
  if (id && action === "/send" && method === "POST") {
    const text = String(b.text ?? "").trim();
    if (!text) throw new HttpError(400, "The message is empty");
    // attachments are named by the paths /upload gave; only files in this chat's own folder are taken
    const dir = store.filesDir(id);
    const files = (Array.isArray(b.files) ? b.files : []).map((f: any) => {
      const p = path.resolve(String(f?.path ?? ""));
      if (!p.startsWith(dir + path.sep) || !existsSync(p)) throw new HttpError(400, `Not an attachment of this chat: ${f?.name ?? p}`);
      const type = String(f?.type ?? "");
      return { name: path.basename(p), path: p, type, image: IMAGE_TYPES.includes(type) };
    });
    const r = await core.send(id, { text, shown: typeof b.shown === "string" ? b.shown : undefined, screen: b.screen, files });
    return { ok: true, ...r };
  }
  if (id && action === "/upload" && method === "POST") {
    if (!store.meta(id)) throw new NotFound("Chat not found");
    if (typeof b.name !== "string" || typeof b.data !== "string") throw new HttpError(400, "Send { name, type, data (base64) }");
    return store.saveFile(id, b.name, String(b.type ?? ""), Buffer.from(b.data, "base64"));
  }
  if (id && action === "/settings" && method === "POST") {
    const change: { mode?: string; model?: string; effort?: string } = {};
    if (typeof b.mode === "string") change.mode = b.mode;
    // "" = the agent's default. A model id goes to the agent as one argument: keep it plain
    if (typeof b.model === "string") {
      if (b.model && !/^[A-Za-z0-9][\w.:/\-[\]]{0,120}$/.test(b.model)) throw new HttpError(400, "Not a model id");
      change.model = b.model;
    }
    if (typeof b.effort === "string") {
      if (b.effort && !/^[a-z]{2,12}$/.test(b.effort)) throw new HttpError(400, "Not an effort level");
      change.effort = b.effort;
    }
    runner.settings(id, change);
    return store.meta(id);
  }
  if (id && action === "/title" && method === "POST") {
    const title = String(b.title ?? "").trim().slice(0, 120);
    if (!title) throw new HttpError(400, "The title is empty");
    if (!store.meta(id)) throw new NotFound("Chat not found");
    const meta = store.update(id, { title }, false);
    core.bus.publish("chat.meta", { chat: id, meta });
    return meta;
  }
  if (id && action === "/fork" && method === "POST") return core.fork(id, Number(b.at));
  if (id && action === "/answer" && method === "POST") {
    return { ok: true, ask: runner.answer(id, String(b.requestId ?? ""), b.decision ?? {}) };
  }
  if (id && action === "/agent" && method === "POST") {
    const meta = store.meta(id);
    if (!meta) throw new NotFound("Chat not found");
    if (!core.agentIds.includes(b.agent)) throw new HttpError(400, `Unknown agent ${b.agent}`);
    // a chat stays with the agent it started on: its history lives in that agent's session
    if (meta.sessionId || store.messages(id).length) throw new HttpError(409, "This chat has started; start a new chat to use another agent");
    return store.update(id, { agent: b.agent }, false);
  }
  if (id && action === "/cancel" && method === "POST") {
    runner.cancel(id);
    return { ok: true };
  }
  throw new HttpError(404, `No route for ${method} ${route}`);
}

