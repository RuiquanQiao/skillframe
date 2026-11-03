// `npx skillframe serve [skillframe.json]`: skillframe for an app written in any language.
//
// The app doesn't import anything. It writes skillframe.json, and its own abilities are plain HTTP
// endpoints of its own server, which skillframe calls when the agent uses them:
//
//   {
//     "appName": "Todo",
//     "app": "http://127.0.0.1:5000",         your server: every request that isn't /sf goes there
//                                             (or pass --app, for a server on a port it picked)
//     "workspace": "./workspace",             the agent's folder (paths are relative to this file)
//     "tools": {
//       "add_todo": { "description": "Add a todo", "input": { "text": "string" },
//                     "url": "/agent/add_todo" }        (relative to "app", or a full address)
//     },
//     "context": "/agent/context",
//     "watch": ["todos.json"]
//   }
//
// A tool is called with POST { "args": {...}, "chatId": "…" }; whatever it answers (text, or JSON)
// goes back to the agent, and an answer of 400 or more is a failed tool call carrying its text.
// `context` is called with POST { "chatId", "screen" } before each message; its text is what the
// user is looking at. The app's page, opened at skillframe's address, adds the sidebar with
// <script type="module" src="/sf/ui/skillframe-chat.js"></script> <skillframe-chat></skillframe-chat>.
// The app can push its own events to the page with POST /sf/publish { "name", "data" }.
//
// With --parent <pid>, skillframe ends when that process does (an app that starts it as a child).
import { readFileSync } from "node:fs";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { appDataDir } from "./paths.js";
import { createSkillframe, type Skillframe } from "./index.js";
import type { ToolSpec } from "./mcp.js";

export interface ServeConfig {
  appName: string;
  /** the app's own server; requests that aren't skillframe's are passed to it */
  app?: string;
  /** or: a folder of files to serve */
  static?: string;
  workspace?: string;
  dataDir?: string;
  port?: number;
  host?: string;
  agents?: string[];
  watch?: string[];
  allowedTools?: string[];
  tools?: Record<string, { description: string; input?: Record<string, unknown>; optional?: string[]; url: string }>;
  context?: string;
}

/** loopback only: the tools and the context are the app's own server, never another computer */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

export function readConfig(file: string): ServeConfig {
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`Couldn't read ${file}: ${(e as Error).message}`);
  }
  if (!raw || typeof raw.appName !== "string" || !raw.appName.trim()) throw new Error(`${file}: "appName" is missing`);
  for (const [name, t] of Object.entries<any>(raw.tools ?? {})) {
    if (typeof t?.url !== "string") throw new Error(`${file}: tool "${name}" needs a "url"`);
    if (typeof t.description !== "string") throw new Error(`${file}: tool "${name}" needs a "description"`);
  }
  return raw;
}

/** an address of the app's: relative ones against `app`; only this computer's are taken */
function local(url: string, app: string | undefined, what: string): string {
  let full: string;
  try {
    full = new URL(url, app).href;
  } catch {
    throw new Error(`${what}: "${url}" is not an address${app ? "" : ' (a relative one needs "app")'}`);
  }
  if (!LOCAL.test(full)) throw new Error(`${what}: ${full} is not on this computer (http://127.0.0.1:…)`);
  return full;
}

/** POST json to the app; its answer as text (JSON answers as compact JSON, or their "result") */
async function call(url: string, body: unknown): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const text = await res.text();
  if (res.status >= 400) throw new Error(text.trim() || `${url} answered ${res.status}`);
  if ((res.headers.get("content-type") ?? "").includes("json")) {
    try {
      const v = JSON.parse(text);
      if (v && typeof v === "object" && "error" in v && v.error) throw new Error(String(v.error));
      if (v && typeof v === "object" && "result" in v) return typeof v.result === "string" ? v.result : JSON.stringify(v.result);
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch (e) {
      if (e instanceof SyntaxError) return text;
      throw e;
    }
  }
  return text;
}

/** hands a request to the app's own server, as it came */
function proxy(target: string, req: IncomingMessage, res: ServerResponse): void {
  const to = new URL(req.url ?? "/", target);
  const out = httpRequest(to, { method: req.method, headers: { ...req.headers, host: to.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  out.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`skillframe couldn't reach the app at ${target}: ${e.message}`);
  });
  req.pipe(out);
}

export async function serve(file: string, o: { port?: number; parent?: number; app?: string; workspace?: string; dataDir?: string } = {}): Promise<{ url: string; sf: Skillframe }> {
  const config = readConfig(file);
  if (o.app) config.app = o.app;
  // flags win over the file, and their paths are the caller's
  if (o.workspace) config.workspace = path.resolve(o.workspace);
  if (o.dataDir) config.dataDir = path.resolve(o.dataDir);
  if (config.app) config.app = local(config.app, undefined, `"app"`);
  const contextUrl = config.context ? local(config.context, config.app, `"context"`) : undefined;
  const base = path.dirname(path.resolve(file));
  const at = (p: string | undefined, fallback: string) => path.resolve(base, p ?? fallback);
  const home = appDataDir(config.appName);
  const tools: Record<string, ToolSpec> = {};
  for (const [name, t] of Object.entries(config.tools ?? {})) {
    const url = local(t.url, config.app, `tool "${name}"`);
    tools[name] = {
      description: t.description,
      input: (t.input ?? {}) as ToolSpec["input"],
      optional: t.optional,
      run: (args, ctx) => call(url, { args, chatId: ctx.chatId }),
    };
  }
  const sf = createSkillframe({
    appName: config.appName,
    workspace: at(config.workspace, path.join(home, "workspace")),
    dataDir: at(config.dataDir, path.join(home, "skillframe")),
    static: config.static ? at(config.static, ".") : undefined,
    agents: config.agents,
    watch: config.watch,
    allowedTools: config.allowedTools,
    tools,
    context: contextUrl ? ({ chatId, screen }) => call(contextUrl, { chatId, screen }).catch((e) => `(The app's context didn't answer: ${e.message})`) : undefined,
  });
  const { url } = await sf.listen({
    port: o.port ?? config.port ?? 0,
    host: config.host ?? "127.0.0.1",
    routes: async (req, res) => {
      if (config.app) {
        proxy(config.app, req, res);
        return true;
      }
      return false;
    },
  });
  if (o.parent) {
    const parent = o.parent;
    setInterval(() => {
      try {
        process.kill(parent, 0);
      } catch {
        sf.close().finally(() => process.exit(0));
      }
    }, 1000).unref();
  }
  return { url, sf };
}
