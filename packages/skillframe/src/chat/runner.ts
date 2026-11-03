// Runs replies: one agent process per reply (plus whatever is queued behind it), its output
// turned into the blocks the sidebar draws, everything published as `chat.*` events.
import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { agentCommand, agentDef } from "../agents.js";
import type { EventBus } from "../events.js";
import { kill, start } from "../spawn.js";
import type { Driver, McpLink, TurnSpec } from "../drivers/driver.js";
import { driverFor } from "../drivers/index.js";
import type { ChatStore } from "./store.js";
import path from "node:path";
import type { AskBlock, Attachment, Block, ContextUse, Decision, Message, Task, ToolBlock, UserMessage } from "./types.js";
import type { Limits } from "../info.js";

const now = () => Math.round(Date.now()) / 1000;
const STDERR_CAP = 20_000;

export interface QueueItem {
  id: string;
  msg: UserMessage;
  prompt: string;
  images: Attachment[];
}

/** What an agent offers to pick from (filled in as the agent reports it). */
export interface AgentOptions {
  modes: { id: string; name: string; desc?: string }[];
  models: { id: string; name: string; desc?: string }[];
}

export class Turn {
  readonly startedAt = now();
  proc?: ChildProcess;
  driver!: Driver;
  runner!: ChatRunner;
  /** the chat's agent id */
  agent = "";
  /** the driver's own (thread / turn ids, RPC numbering…) */
  state: Record<string, any> = {};
  cancelled = false;
  closed = false;
  blocks: Block[] = [];
  tools = new Map<string, ToolBlock>();
  asks = new Map<string, AskBlock>();
  queue: QueueItem[] = [];
  error: string | null = null;
  flushedAny = false;
  replyStartedAt = now();
  /** where the agent's session stands after the current reply (a fork point) */
  point?: string;
  /** the context window's use as the agent last reported it (saved on the chat with each reply) */
  usage?: ContextUse;

  constructor(
    readonly chatId: string,
    readonly onDone?: (ok: boolean) => void,
  ) {}

  /** One JSON line to the agent's stdin. false once the input is closed. */
  write(obj: unknown): boolean {
    const stdin = this.proc?.stdin;
    if (this.closed || !stdin || !stdin.writable) return false;
    stdin.write(JSON.stringify(obj) + "\n");
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.proc?.stdin?.end();
  }
}

export interface SendOptions {
  /** what goes to the agent */
  text: string;
  /** what the transcript shows (default: `text`); a button's short label */
  shown?: string;
  /** a note for the agent about what the user is looking at, added to its system prompt */
  context?: string;
  addDirs?: string[];
  /** files the user attached (already saved in the chat's folder) */
  files?: Attachment[];
  onDone?: (ok: boolean) => void;
}

export interface RunnerOptions {
  bus: EventBus;
  store: ChatStore;
  cwd: string;
  /** per-turn files (the context note, the MCP config) */
  runDir: string;
  /** tools that never ask for permission (Claude Code's --allowedTools) */
  allowedTools: string[];
  /** where the host app's tools are for a chat's agent, if it has tools */
  mcp?: (chatId: string) => McpLink | undefined;
  env?: NodeJS.ProcessEnv;
}

export class ChatRunner {
  readonly turns = new Map<string, Turn>();
  /** modes and models each agent reported about itself */
  readonly learned = new Map<string, AgentOptions>();
  /** each agent's plan usage, as its last reply reported it */
  readonly limits = new Map<string, Limits>();

  constructor(readonly opts: RunnerOptions) {}

  get store(): ChatStore {
    return this.opts.store;
  }

  busy(chatId: string): boolean {
    return this.turns.has(chatId);
  }

  live(chatId: string) {
    const turn = this.turns.get(chatId);
    return turn ? { blocks: turn.blocks, queue: turn.queue, startedAt: turn.replyStartedAt } : null;
  }

  /** Start a reply, or queue the message behind the running one. */
  send(chatId: string, o: SendOptions): { queued: boolean; id?: string } {
    const chat = this.store.meta(chatId);
    if (!chat) throw new NotFound(`chat ${chatId} not found`);
    const files = o.files ?? [];
    const msg: UserMessage = { role: "user", text: o.shown ?? o.text, at: now(), ...(files.length ? { files } : {}) };
    const images = files.filter((f) => f.image);
    const others = files.filter((f) => !f.image);
    // other files: the agent reads them itself (its Read tool handles PDFs, documents, code)
    const prompt = others.length ? `${o.text}\n\nAttached files (read them):\n${others.map((f) => `- ${f.path}`).join("\n")}` : o.text;
    let turn = this.turns.get(chatId);
    if (turn && !turn.closed && !turn.cancelled) {
      if (o.onDone) throw new Busy("This chat is still replying; wait or stop it first.");
      const item = { id: Math.random().toString(36).slice(2, 10), msg, prompt, images };
      turn.queue.push(item);
      this.emit("chat.queue", chatId, { queue: turn.queue });
      return { queued: true, id: item.id };
    }
    if (turn) throw new Busy("The last reply is still ending; try again in a moment.");

    const def = agentDef(chat.agent);
    const cmd = agentCommand(def, this.opts.env);
    if (!cmd) throw new Busy(`The ${def.exe} command was not found. Install ${def.name} (${def.install}) and sign in first.`);

    this.store.append(chatId, msg);
    this.store.update(chatId, chat.title ? {} : { title: titleFrom(o.shown ?? o.text) });

    turn = new Turn(chatId, o.onDone);
    turn.driver = driverFor(def);
    turn.runner = this;
    turn.agent = def.id;
    this.turns.set(chatId, turn);
    const spec: TurnSpec = {
      chat,
      prompt,
      images,
      context: o.context ?? "",
      addDirs: [...new Set([...(o.addDirs ?? []), ...files.map((f) => path.dirname(f.path))])],
      cwd: this.opts.cwd,
      runDir: this.opts.runDir,
      allowedTools: this.opts.allowedTools,
      mcp: this.opts.mcp?.(chatId),
    };
    this.emit("chat.start", chatId, { message: msg, startedAt: turn.replyStartedAt });
    this.run(turn, cmd, spec, def.exe);
    return { queued: false };
  }

  answer(chatId: string, requestId: string, decision: Decision): AskBlock {
    const turn = this.turns.get(chatId);
    const ask = turn?.asks.get(requestId);
    if (!turn || !ask || ask.status !== "pending") throw new NotFound("That card is no longer waiting for an answer.");
    const mode = turn.driver.answer(turn, ask, decision);
    if (mode) this.store.update(chatId, { mode }, false);
    this.emit("chat.ask", chatId, { ask });
    return ask;
  }

  /** a picker changed: kept on the chat for its next replies, and applied to the running one where the agent can */
  settings(chatId: string, change: { mode?: string; model?: string; effort?: string }): void {
    if (!this.store.meta(chatId)) throw new NotFound("Chat not found");
    this.store.update(chatId, change, false);
    const turn = this.turns.get(chatId);
    if (turn && !turn.closed) turn.driver.setLive?.(turn, change);
    this.emit("chat.meta", chatId, { meta: this.store.meta(chatId) });
  }

  cancel(chatId: string): void {
    const turn = this.turns.get(chatId);
    if (!turn || turn.cancelled) return;
    turn.cancelled = true;
    turn.queue = [];
    // a real interrupt first, so the agent's session stays consistent; kill if it does not stop
    const sent = turn.driver.interrupt(turn);
    for (const ask of turn.asks.values()) if (ask.status === "pending") ask.status = "cancelled";
    turn.close();
    setTimeout(() => kill(turn.proc), sent ? 4000 : 0).unref();
  }

  cancelAll(): void {
    for (const turn of this.turns.values()) {
      turn.cancelled = true;
      turn.close();
      kill(turn.proc);
    }
  }

  // ---- the process ------------------------------------------------------
  private run(turn: Turn, cmd: ReturnType<typeof agentCommand> & {}, spec: TurnSpec, exe: string): void {
    let cost: number | null = null;
    let stderr = "";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.finish(turn, cost);
    };
    let proc: ChildProcess;
    try {
      proc = start(cmd, turn.driver.args(spec), {
        cwd: this.opts.cwd,
        env: {
          ...(this.opts.env ?? process.env),
          SKILLFRAME_CHAT: turn.chatId,
          ...(spec.mcp ? { SKILLFRAME_MCP_TOKEN: spec.mcp.token } : {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      turn.error = `Couldn't start ${exe}: ${(e as Error).message}`;
      finish();
      return;
    }
    turn.proc = proc;
    proc.stdin?.on("error", () => {}); // the agent may exit before reading everything; that's fine
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (d: string) => (stderr = (stderr + d).slice(-STDERR_CAP)));
    proc.on("error", (e) => {
      turn.error = `Couldn't start ${exe}: ${e.message}`;
      finish();
    });
    const lines = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    lines.on("line", (line) => {
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const res = turn.driver.handle(this, turn, msg as Record<string, unknown>);
      if (res) {
        cost = res.cost ?? cost;
        this.flush(turn, res.error, cost);
        if (!this.next(turn)) turn.driver.close(turn);
      }
    });
    proc.on("close", (code) => {
      if (code !== 0 && !turn.error && !turn.cancelled && !turn.flushedAny) {
        turn.error = stderr.trim().slice(-2000) || `${exe} exited with code ${code}`;
      }
      finish();
    });
    turn.driver.begin(turn, spec);
  }

  /** After a reply: send the next queued message into the same process. */
  private next(turn: Turn): boolean {
    if (turn.cancelled || turn.queue.length === 0) return false;
    const item = turn.queue.shift()!;
    turn.replyStartedAt = now();
    this.store.append(turn.chatId, item.msg);
    this.store.update(turn.chatId, {});
    this.emit("chat.next", turn.chatId, { message: item.msg, queue: turn.queue, startedAt: turn.replyStartedAt });
    return turn.driver.send(turn, item.prompt, item.images);
  }

  /** One reply is complete: save it and start a fresh assistant message. */
  private flush(turn: Turn, error: string | null, cost: number | null): void {
    for (const t of turn.tools.values()) if (t.status === "running") t.status = turn.cancelled ? "cancelled" : "unknown";
    for (const a of turn.asks.values()) if (a.status === "pending") a.status = "cancelled";
    const msg: Message = {
      role: "assistant",
      blocks: turn.blocks,
      at: now(),
      error: turn.cancelled ? null : error,
      cancelled: turn.cancelled,
      cost,
      took: Math.round((now() - turn.replyStartedAt) * 10) / 10,
      ...(turn.point ? { point: turn.point } : {}),
    };
    this.store.append(turn.chatId, msg);
    // a window alone (or nothing) would wipe the last known use
    if (turn.usage && (turn.usage.used !== null || turn.usage.compacted)) {
      const before = this.store.meta(turn.chatId)?.context;
      this.store.update(turn.chatId, { context: { ...turn.usage, window: turn.usage.window ?? before?.window ?? null } }, false);
      this.emit("chat.meta", turn.chatId, { meta: this.store.meta(turn.chatId) });
    }
    turn.error = turn.error ?? error;
    turn.flushedAny = true;
    turn.blocks = [];
    turn.tools = new Map();
    turn.asks = new Map();
    this.emit("chat.reply", turn.chatId, { error: msg.error, queue: turn.queue });
  }

  private finish(turn: Turn, cost: number | null): void {
    if (turn.blocks.length || !turn.flushedAny) this.flush(turn, turn.cancelled ? null : turn.error, cost);
    this.store.update(turn.chatId, {});
    this.turns.delete(turn.chatId);
    const ok = !turn.error && !turn.cancelled;
    try {
      turn.onDone?.(ok);
    } catch {
      /* a follow-up must never break the chat */
    }
    this.emit("chat.done", turn.chatId, { ok, error: turn.cancelled ? null : turn.error, cancelled: turn.cancelled, cost });
  }

  // ---- what the drivers call ------------------------------------------------
  emit(event: string, chatId: string, data: Record<string, unknown>): void {
    this.opts.bus.publish(event, { chat: chatId, ...data });
  }

  text(turn: Turn, delta: string, kind: "text" | "thinking" = "text"): void {
    if (!delta) return;
    const last = turn.blocks[turn.blocks.length - 1];
    if (last && last.type === kind) last.text += delta;
    else turn.blocks.push({ type: kind, text: delta });
    this.emit("chat.delta", turn.chatId, { text: delta, kind });
  }

  block(turn: Turn, block: Block): void {
    turn.blocks.push(block);
    this.emit("chat.block", turn.chatId, { block });
  }

  tool(turn: Turn, id: string, name: string, input: Record<string, unknown>): ToolBlock {
    const tool: ToolBlock = { type: "tool", id, name, hint: toolHint(input), status: "running", result: "" };
    turn.tools.set(id, tool);
    turn.blocks.push(tool);
    this.emit("chat.tool", turn.chatId, { tool });
    return tool;
  }

  toolEnd(turn: Turn, id: string, ok: boolean, result: unknown): void {
    const tool = turn.tools.get(id);
    if (!tool) return;
    tool.status = ok ? "done" : "error";
    tool.result = resultPreview(result);
    this.emit("chat.tool", turn.chatId, { tool });
  }

  /** the agent's task list changed */
  tasks(turn: Turn, tasks: Task[]): void {
    this.store.update(turn.chatId, { tasks }, false);
    this.emit("chat.tasks", turn.chatId, { tasks });
  }

  /** an agent said which modes and models it offers */
  learn(agentId: string, options: AgentOptions): void {
    const before = JSON.stringify(this.learned.get(agentId));
    this.learned.set(agentId, options);
    if (JSON.stringify(options) !== before) this.opts.bus.publish("agent.info", { agent: agentId, ...options });
  }

  /** an agent reported its plan's usage limits */
  setLimits(agentId: string, limits: Limits): void {
    this.limits.set(agentId, limits);
    this.opts.bus.publish("agent.limits", { agent: agentId, limits });
  }

  ask(turn: Turn, ask: AskBlock): void {
    turn.asks.set(ask.id, ask);
    turn.blocks.push(ask);
    this.emit("chat.ask", turn.chatId, { ask });
  }
}

export class NotFound extends Error {}
export class Busy extends Error {}

function titleFrom(text: string): string {
  const line = text.trim().split(/\s+/).join(" ");
  return line.length > 40 ? line.slice(0, 40) + "…" : line || "New chat";
}

export function toolHint(input: Record<string, unknown>): string {
  for (const key of ["file_path", "path", "pattern", "command", "skill", "url", "query", "description"]) {
    if (input[key]) return String(input[key]).slice(0, 160);
  }
  // an app's own tool: its arguments, short (add_note → text=buy milk)
  return Object.entries(input)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ")
    .slice(0, 160);
}

const CAP = 3000;

function resultPreview(content: unknown): string {
  if (Array.isArray(content)) {
    content = content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("\n");
  }
  const text = String(content ?? "").trim();
  if (text.length <= CAP) return text;
  // the start and the end: a command's last lines (its summary, its error) matter most
  return text.slice(0, CAP / 3).trimEnd() + "\n…\n" + text.slice(-(CAP - CAP / 3)).trimStart();
}
