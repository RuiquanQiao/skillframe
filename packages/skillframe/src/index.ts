// skillframe: give your app a sidebar that runs your users' own coding agent on their own
// subscription, wired both ways into your UI.
//
//   const sf = createSkillframe({ appName, workspace, dataDir, context, tools });
//   await sf.listen();            // or: http.createServer(async (req, res) => { if (await sf.handler(req, res)) return; ... })
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { listAgents } from "./agents.js";
import { Busy, ChatRunner, NotFound } from "./chat/runner.js";
import { ChatStore } from "./chat/store.js";
import { EventBus, type Listener } from "./events.js";
import { createHandler, serveFile } from "./http.js";
import { McpTools, type ToolSpec } from "./mcp.js";
import { FileChannel } from "./files.js";

export type { ToolSpec, ToolContext, ToolInput } from "./mcp.js";
export { Conflict, type FileVersion } from "./files.js";
export { appDataDir } from "./paths.js";
export type { ChatMeta, Message, Block, AskBlock, ToolBlock, Decision, Attachment, Task } from "./chat/types.js";
import type { Attachment, ChatMeta } from "./chat/types.js";
import { AGENTS, agentCommand, agentDef, type AgentDef } from "./agents.js";
import { InfoCache, probeClaude, probeCodex, type AgentInfo, type ModelInfo } from "./info.js";
export type { AgentInfo, ModelInfo, Limits, UsageWindow } from "./info.js";

export interface ContextInfo {
  chatId: string;
  /** whatever the page passed to `chat.setScreen(...)` */
  screen: unknown;
}

export interface SkillframeOptions {
  /** your app's name: told to the agent, and used for the tools' MCP server name */
  appName: string;
  /** the folder the agent works in (its cwd: its CLAUDE.md, skills and settings load from there) */
  workspace: string;
  /** where chats and run files go: a folder of your app's own */
  dataDir: string;
  /** agents the sidebar offers, first is the default (default: every agent skillframe knows; ones not installed show as such) */
  agents?: string[];
  /** files in the workspace you and the agent both edit ("notes.json", "data/**\/*.md"): the page hears when they change */
  watch?: string[];
  /** called before each message: what the user is looking at, in words for the agent */
  context?: (info: ContextInfo) => string | Promise<string>;
  /** your app's abilities the agent may call (offered over MCP, pre-approved) */
  tools?: Record<string, ToolSpec>;
  /** where the routes live (default "/sf") */
  basePath?: string;
  /** a folder `listen()` serves at "/" (your page) */
  static?: string;
  /** Host header names accepted (default: loopback names only) */
  allowedHosts?: string[];
  /** more tools that never ask (Claude Code rules like "Bash(git status*)") */
  allowedTools?: string[];
  /** environment for the agent processes (default: process.env) */
  env?: NodeJS.ProcessEnv;
}

export interface SendInput {
  text: string;
  shown?: string;
  screen?: unknown;
  addDirs?: string[];
  files?: Attachment[];
  onDone?: (ok: boolean) => void;
}

// Pre-approved so ordinary looking around never stops for a card. Edits and commands are not
// listed: the permission mode decides them, like in the terminal.
const DEFAULT_ALLOWED = ["Read", "Glob", "Grep", "Skill", "WebFetch", "WebSearch"];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "app";
}

export interface Core {
  basePath: string;
  /** the agent's working folder */
  workspace: string;
  allowedHosts: string[];
  agentIds: string[];
  bus: EventBus;
  store: ChatStore;
  runner: ChatRunner;
  mcp?: McpTools;
  files?: FileChannel;
  appInfo(): unknown;
  send(chatId: string, input: SendInput): Promise<{ queued: boolean; id?: string }>;
  /** what an agent offers (modes, models with their effort levels, commands) and its plan's usage, for the sidebar */
  agentOptions(agentId: string, refresh?: boolean): Promise<Omit<AgentInfo, "signedIn"> & { signedIn?: boolean }>;
  /** a new chat that goes on from reply number `at` (an index into the messages) of another */
  fork(chatId: string, at: number): ChatMeta;
}

/** your own requests, before the static folder: answer and return true, or return false */
export type Routes = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

export interface Skillframe extends Core {
  /** answers the request if it is under basePath; resolves true when it did */
  handler(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** start a local server for your page and the sidebar */
  listen(opts?: { port?: number; host?: string; routes?: Routes }): Promise<{ url: string; server: Server }>;
  /** push an event of your own to every open page (the sidebar element fires it as "sf:<name>") */
  publish(name: string, data: unknown): void;
  /** when you mount `handler` in your own server: the origin the agent can reach it at (http://127.0.0.1:3000) */
  setOrigin(url: string): void;
  /** every event, in process (chat.delta, chat.done, …) */
  on(fn: Listener): () => void;
  close(): Promise<void>;
}

export function createSkillframe(o: SkillframeOptions): Skillframe {
  const basePath = (o.basePath ?? "/sf").replace(/\/$/, "");
  const dataDir = path.resolve(o.dataDir);
  const runDir = path.join(dataDir, "run");
  const workspace = path.resolve(o.workspace);
  mkdirSync(workspace, { recursive: true });
  const agentIds = o.agents?.length ? o.agents : AGENTS.map((a) => a.id);
  const bus = new EventBus();
  const store = new ChatStore(path.join(dataDir, "chats"));
  let origin = ""; // http://127.0.0.1:<port>, known once a server listens

  const tools = o.tools && Object.keys(o.tools).length ? o.tools : undefined;
  const mcp = tools
    ? new McpTools(slug(o.appName), "0.0.1", tools, (name, args, ctx) => bus.publish("app.tool", { name, args, chat: ctx.chatId }))
    : undefined;

  const runner = new ChatRunner({
    bus,
    store,
    cwd: workspace,
    runDir,
    env: o.env,
    allowedTools: [...DEFAULT_ALLOWED, ...(mcp ? [mcp.allowRule] : []), ...(o.allowedTools ?? [])],
    mcp: (chatId) => {
      if (!mcp) return undefined;
      if (!origin) throw new Error("skillframe: the app's tools need a server; call listen() or setOrigin() first");
      return { name: mcp.name, url: `${origin}${basePath}/mcp`, token: mcp.token, chatId };
    },
  });

  const files = o.watch?.length
    ? new FileChannel(workspace, o.watch, bus, path.join(dataDir, "history"), () => (runner.turns.size ? "agent" : "outside"))
    : undefined;
  files?.start();

  const infos = new InfoCache(path.join(dataDir, "agents"));
  const ask = (def: AgentDef) => {
    const cmd = agentCommand(def, o.env);
    const env = o.env ?? process.env;
    if (!cmd) return null;
    if (def.protocol === "claude") return () => probeClaude(cmd, { cwd: workspace, env });
    if (def.protocol === "codex") return () => probeCodex(cmd, { cwd: workspace, env });
    return null; // ACP agents report theirs when a session opens
  };

  const core: Core = {
    basePath,
    workspace,
    allowedHosts: (o.allowedHosts ?? ["localhost", "127.0.0.1", "[::1]"]).map((h) => h.toLowerCase()),
    agentIds,
    bus,
    store,
    runner,
    mcp,
    files,
    appInfo: () => ({
      appName: o.appName,
      agents: listAgents(agentIds, o.env),
      tools: tools ? Object.entries(tools).map(([name, t]) => ({ name, description: t.description })) : [],
      watch: o.watch ?? [],
    }),
    async send(chatId, input) {
      const parts = [
        `You are running inside ${o.appName}: the user talks to you in its sidebar, next to the app itself.`,
        mcp ? `${o.appName}'s own abilities are your tools from the "${mcp.name}" MCP server; use them to act in the app.` : "",
      ];
      if (o.context) parts.push((await o.context({ chatId, screen: input.screen })).trim());
      return runner.send(chatId, {
        text: input.text,
        shown: input.shown,
        context: parts.filter(Boolean).join("\n") + "\n",
        addDirs: input.addDirs,
        files: input.files,
        onDone: input.onDone,
      });
    },
    async agentOptions(agentId, refresh = false) {
      const def = AGENTS.find((a) => a.id === agentId && agentIds.includes(a.id));
      if (!def) throw new NotFound(`Unknown agent ${agentId}`);
      const asker = ask(def);
      if (asker) {
        // never asked: wait for the answer. Asked before: answer from the last one, ask again behind it
        const pending = infos.age(def.id) > 300 || refresh ? infos.refresh(def.id, asker) : null;
        if (pending && (!infos.get(def.id) || refresh)) await pending;
      }
      const info = infos.get(def.id) ?? {};
      const learned = runner.learned.get(def.id);
      const models: ModelInfo[] = learned?.models.length
        ? learned.models.map((m) => ({ efforts: [], ...m }))
        : info.models?.length ? info.models : def.models.map((m) => ({ ...m, efforts: [] }));
      return {
        modes: learned?.modes.length ? learned.modes : def.modes,
        models,
        defaultModel: info.defaultModel,
        commands: info.commands ?? [],
        account: info.account,
        signedIn: info.signedIn,
        limits: runner.limits.get(def.id) ?? info.limits,
      };
    },
    fork(chatId, at) {
      const meta = store.meta(chatId);
      if (!meta) throw new NotFound("Chat not found");
      if (!agentDef(meta.agent).fork) throw new Busy(`${agentDef(meta.agent).name} can't branch a conversation`);
      const messages = store.messages(chatId);
      const reply = messages[at];
      if (!reply || reply.role !== "assistant") throw new Busy("Pick one of the agent's replies to fork from");
      const sessionId = meta.sessionId ?? meta.fork?.sessionId;
      if (!sessionId) throw new Busy("This chat has no session to fork yet");
      // the newest reply needs no point: the fork takes the whole session
      const last = messages.slice(at + 1).every((m) => m.role !== "assistant");
      if (!last && !reply.point) throw new Busy("This reply can't be forked from (it was saved before forking was possible)");
      const chat = store.create({
        title: `${meta.title || "Chat"} (fork)`,
        agent: meta.agent,
        mode: meta.mode,
        model: meta.model,
        fork: { sessionId, ...(last ? {} : { at: reply.point }) },
      });
      for (const m of messages.slice(0, at + 1)) store.append(chat.id, m);
      return chat;
    },
  };
  const handler = createHandler(core);
  const servers: Server[] = [];

  return {
    ...core,
    handler,
    publish: (name, data) => bus.publish("sf", { name, data }),
    on: (fn) => bus.on(fn),
    setOrigin: (url) => {
      origin = url.replace(/\/$/, "");
    },
    async listen({ port = 0, host = "127.0.0.1", routes }: { port?: number; host?: string; routes?: Routes } = {}) {
      const staticRoot = o.static ? path.resolve(o.static) : undefined;
      const server = createServer(async (req, res) => {
        if (await handler(req, res)) return;
        if (routes && (await routes(req, res))) return;
        const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
        if (req.method === "GET" && staticRoot && serveFile(staticRoot, rel, res)) return;
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      });
      await new Promise<void>((resolve) => server.listen(port, host, resolve));
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      origin = `http://${host}:${p}`;
      servers.push(server);
      return { url: origin + "/", server };
    },
    async close() {
      runner.cancelAll();
      files?.stop();
      bus.close();
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    },
  };
}
