// Codex over `codex app-server`: the JSON-RPC interface Codex's own IDE extension uses, spoken to
// the user's own installed `codex` with the login it keeps for itself. A Codex thread per chat (its
// id is the chat's session id), a Codex turn per message.
//
// The host app's note goes in `developerInstructions`; the host app's tools are an MCP server
// added with `-c mcp_servers.<name>.*` for this process only (the user's config.toml is untouched),
// its token read from SKILLFRAME_MCP_TOKEN, which the runner puts in the process environment.
import type { ChatRunner, Turn } from "../chat/runner.js";
import { toolHint } from "../chat/runner.js";
import type { AskBlock, Attachment, Decision } from "../chat/types.js";
import type { Driver, ReplyEnd, TurnSpec } from "./driver.js";
import { createInterface } from "node:readline";
import { kill, start, type Command } from "../spawn.js";
import { codexLimits } from "../info.js";

type Obj = Record<string, any>;

// the permission modes, as Codex's approval policy + sandbox. With no mode picked: Codex's own
// default for a trusted folder (asks when it needs to, may edit the workspace).
const MODES: Record<string, Obj> = {
  plan: { approvalPolicy: "on-request", sandbox: "read-only" },
  default: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
  acceptEdits: { approvalPolicy: "on-request", sandbox: "workspace-write" },
  bypassPermissions: { approvalPolicy: "never", sandbox: "danger-full-access" },
};
const DEFAULT_MODE = MODES.acceptEdits;

const TOOLS: Record<string, string> = {
  commandExecution: "Bash",
  fileChange: "Edit",
  webSearch: "WebSearch",
  imageView: "Read",
  collabAgentToolCall: "Agent",
  subAgentActivity: "Agent",
};

/** JSON-RPC 2.0 over the turn's stdin: numbered requests, each answer routed to its callback. */
export class Rpc {
  private n = 0;
  private waiting = new Map<number, (result: any, error: string | null) => void>();

  constructor(private turn: Turn) {}

  call(method: string, params: unknown, then?: (result: any, error: string | null) => void): boolean {
    const id = ++this.n;
    if (then) this.waiting.set(id, then);
    return this.turn.write({ jsonrpc: "2.0", id, method, params });
  }

  notify(method: string, params?: unknown): boolean {
    return this.turn.write(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params });
  }

  reply(id: unknown, result?: unknown, error?: string): boolean {
    if (error !== undefined) return this.turn.write({ jsonrpc: "2.0", id, error: { code: -32601, message: error } });
    return this.turn.write({ jsonrpc: "2.0", id, result: result ?? {} });
  }

  /** an answer to one of our requests: run its callback. false for anything else */
  dispatch(msg: Obj): boolean {
    if ("method" in msg || !("id" in msg) || !("result" in msg || "error" in msg)) return false;
    const then = this.waiting.get(msg.id);
    this.waiting.delete(msg.id);
    if (then) {
      const err = msg.error;
      then(msg.result, err ? (typeof err === "object" ? err.message || JSON.stringify(err) : String(err)) : null);
    }
    return true;
  }
}

const toml = (s: string) => JSON.stringify(s); // a TOML basic string is a JSON string

/** The models the user's Codex offers, asked from a short-lived `codex app-server` (no model call). */
export function codexModels(cmd: Command, env: NodeJS.ProcessEnv, timeoutMs = 15_000): Promise<{ id: string; name: string; desc?: string }[]> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof start>;
    try {
      proc = start(cmd, ["app-server"], { env, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      return resolve([]);
    }
    const done = (models: { id: string; name: string; desc?: string }[]) => {
      clearTimeout(timer);
      proc.stdin?.end();
      kill(proc);
      resolve(models);
    };
    const timer = setTimeout(() => done([]), timeoutMs);
    proc.on("error", () => done([]));
    proc.stdin?.on("error", () => {});
    const write = (o: Obj) => proc.stdin?.write(JSON.stringify(o) + "\n");
    createInterface({ input: proc.stdout! }).on("line", (line) => {
      let msg: Obj;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id === 1) {
        write({ jsonrpc: "2.0", method: "initialized" });
        write({ jsonrpc: "2.0", id: 2, method: "model/list", params: {} });
      } else if (msg.id === 2) {
        const data: Obj[] = msg.result?.data ?? [];
        done(data.filter((m) => !m.hidden).map((m) => ({ id: m.id ?? m.model, name: m.displayName ?? m.id, desc: m.description ?? "" })));
      }
    });
    write({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "skillframe", version: "0" } } });
  });
}

export class CodexDriver implements Driver {
  constructor(private appName = "skillframe") {}

  args(spec: TurnSpec): string[] {
    const args = ["app-server"];
    if (spec.mcp) {
      const key = `mcp_servers.${spec.mcp.name}`;
      args.push(
        "-c", `${key}.url=${toml(spec.mcp.url)}`,
        "-c", `${key}.bearer_token_env_var="SKILLFRAME_MCP_TOKEN"`,
        "-c", `${key}.http_headers={ "X-Skillframe-Chat" = ${toml(spec.mcp.chatId)} }`,
      );
    }
    return args;
  }

  private st(turn: Turn): Obj {
    return turn.state;
  }

  begin(turn: Turn, spec: TurnSpec): void {
    const s = this.st(turn);
    s.rpc = new Rpc(turn);
    s.spec = spec;
    s.items = new Map<string, Obj>();
    s.streamed = new Set<string>();
    s.rpc.call("initialize", { clientInfo: { name: "skillframe", title: this.appName, version: "0" } }, (_r: unknown, e: string | null) =>
      e ? this.fail(turn, e) : this.thread(turn),
    );
  }

  private fail(turn: Turn, message: string): void {
    turn.error = turn.error ?? message;
    this.close(turn);
  }

  private thread(turn: Turn): void {
    const s = this.st(turn);
    const spec: TurnSpec = s.spec;
    const { chat } = spec;
    s.rpc.notify("initialized");
    const params: Obj = { cwd: spec.cwd, ...(MODES[chat.mode ?? ""] ?? DEFAULT_MODE) };
    if (spec.context.trim()) params.developerInstructions = spec.context;
    if (chat.model) params.model = chat.model;
    if (spec.addDirs.length) params.config = { sandbox_workspace_write: { writable_roots: spec.addDirs } };
    const started = (r: Obj, e: string | null) => {
      if (e) return this.fail(turn, e);
      s.thread = r?.thread?.id;
      // a fork gets a thread of its own: from here on the chat resumes that one
      turn.runner.store.update(turn.chatId, { sessionId: s.thread, fork: undefined, ...(r?.model ? { modelUsed: r.model } : {}) }, false);
      turn.runner.emit("chat.init", turn.chatId, { model: r?.model });
      this.send(turn, spec.prompt, spec.images);
    };
    if (chat.sessionId) s.rpc.call("thread/resume", { ...params, threadId: chat.sessionId, excludeTurns: true }, started);
    else if (chat.fork) {
      const at = chat.fork.at ? { lastTurnId: chat.fork.at } : {};
      s.rpc.call("thread/fork", { ...params, threadId: chat.fork.sessionId, excludeTurns: true, ...at }, started);
    } else s.rpc.call("thread/start", params, started);
  }

  send(turn: Turn, prompt: string, images: Attachment[] = []): boolean {
    const s = this.st(turn);
    const chat = turn.runner.store.meta(turn.chatId) ?? s.spec.chat;
    const mode = MODES[chat.mode ?? ""] ?? DEFAULT_MODE;
    const input = [{ type: "text", text: prompt || "(see image)" }, ...images.map((im) => ({ type: "localImage", path: im.path }))];
    const params: Obj = { threadId: s.thread, input, approvalPolicy: mode.approvalPolicy };
    if (chat.model) params.model = chat.model;
    if (chat.effort) params.effort = chat.effort;
    return s.rpc.call("turn/start", params, (r: Obj, e: string | null) => {
      if (e) {
        turn.error = e;
        this.close(turn);
      } else s.turn = r?.turn?.id;
    });
  }

  close(turn: Turn): void {
    turn.close();
    // app-server normally exits once its stdin closes; make sure it does
    setTimeout(() => {
      if (turn.proc && turn.proc.exitCode === null) turn.proc.kill();
    }, 3000).unref();
  }

  interrupt(turn: Turn): boolean {
    const s = this.st(turn);
    if (!s.turn) return false;
    return s.rpc.call("turn/interrupt", { threadId: s.thread, turnId: s.turn });
  }

  answer(turn: Turn, ask: AskBlock & Obj, d: Decision): string | undefined {
    const rpc: Rpc = this.st(turn).rpc;
    const rid = ask.rpcId;
    if (ask.kind === "question") {
      if (d.skip) {
        ask.status = "denied";
        rpc.reply(rid, { answers: {} });
        return undefined;
      }
      const answers = Object.fromEntries(Object.entries(d.answers ?? {}).map(([k, v]) => [String(k), String(v)]));
      ask.status = "answered";
      ask.answers = answers;
      const byText = new Map<string, string>(((ask.input.questions as Obj[]) ?? []).map((q) => [q.question, q.id]));
      rpc.reply(rid, { answers: Object.fromEntries(Object.entries(answers).map(([q, a]) => [byText.get(q) ?? q, { answers: [a] }])) });
      return undefined;
    }
    if (ask.method === "mcpServer/elicitation/request") {
      ask.status = d.allow ? "allowed" : "denied";
      rpc.reply(rid, d.allow ? { action: "accept", content: {} } : { action: "decline" });
      return undefined;
    }
    if (ask.method === "item/permissions/requestApproval") {
      if (d.allow) {
        ask.status = "allowed";
        rpc.reply(rid, { permissions: ask.raw?.permissions ?? {}, scope: "turn" });
      } else {
        ask.status = "denied";
        rpc.reply(rid, undefined, "The user declined.");
      }
      return undefined;
    }
    let verdict: unknown;
    if (d.allow) {
      const chosen = typeof d.suggestion === "number" ? (ask.suggestions[d.suggestion] as Obj | undefined) : undefined;
      if (chosen?.type === "rule") verdict = { acceptWithExecpolicyAmendment: { execpolicy_amendment: chosen.rules } };
      else verdict = chosen ? "acceptForSession" : "accept";
      ask.status = "allowed";
    } else {
      verdict = "decline";
      ask.status = "denied";
      const s = this.st(turn);
      const note = (d.message ?? "").trim();
      if (note && s.turn) s.rpc.call("turn/steer", { threadId: s.thread, expectedTurnId: s.turn, input: [{ type: "text", text: note }] });
    }
    rpc.reply(rid, { decision: verdict });
    return undefined;
  }

  handle(runner: ChatRunner, turn: Turn, msg: Obj): ReplyEnd | null {
    const s = this.st(turn);
    if (s.rpc.dispatch(msg)) return null;
    const method: string = msg.method ?? "";
    const p: Obj = msg.params ?? {};
    if ("id" in msg) {
      this.request(runner, turn, msg.id, method, p);
      return null;
    }
    if (p.threadId && s.thread && p.threadId !== s.thread) return null; // a subagent's thread
    switch (method) {
      case "item/agentMessage/delta":
        s.streamed.add(p.itemId);
        runner.text(turn, p.delta ?? "");
        break;
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
        runner.text(turn, p.delta ?? "", "thinking");
        break;
      case "item/reasoning/summaryPartAdded":
        runner.text(turn, "\n\n", "thinking");
        break;
      case "item/started":
        this.item(runner, turn, p.item ?? {}, false);
        break;
      case "item/completed":
        this.item(runner, turn, p.item ?? {}, true);
        break;
      case "thread/compacted":
        runner.block(turn, { type: "note", text: "Context compacted" });
        break;
      case "thread/tokenUsage/updated": {
        const u: Obj = p.tokenUsage ?? {};
        const last: Obj = u.last ?? {};
        turn.usage = { used: Number(last.inputTokens ?? 0) + Number(last.outputTokens ?? 0), window: u.modelContextWindow ?? null };
        break;
      }
      case "account/rateLimits/updated":
        runner.setLimits(turn.agent, codexLimits(p.rateLimits ?? {}));
        break;
      case "error":
        if (!p.willRetry) s.error = p.error?.message ?? JSON.stringify(p.error ?? {});
        break;
      case "turn/plan/updated":
        runner.tasks(
          turn,
          ((p.plan ?? []) as Obj[]).map((step, i) => ({
            id: String(i + 1),
            subject: String(step.step ?? ""),
            status: step.status === "inProgress" ? "in_progress" : step.status === "completed" ? "completed" : "pending",
          })),
        );
        break;
      case "turn/completed": {
        const tr = p.turn ?? {};
        s.turn = null;
        if (tr.id) turn.point = tr.id; // thread/fork's lastTurnId: fork after this reply
        let error: string | null = null;
        if (tr.status === "failed") error = tr.error?.message ?? s.error ?? "Codex reported an error";
        s.error = null;
        return { error: turn.cancelled ? null : error };
      }
    }
    return null;
  }

  private item(runner: ChatRunner, turn: Turn, item: Obj, done: boolean): void {
    const s = this.st(turn);
    const kind = item.type;
    const id = String(item.id ?? "");
    if (kind === "agentMessage") {
      if (!done) {
        const last = turn.blocks[turn.blocks.length - 1];
        if (last && last.type === "text" && last.text.trim()) runner.text(turn, "\n\n"); // another message in the same reply
      } else if (!s.streamed.has(id) && item.text) runner.text(turn, item.text);
      return;
    }
    if (kind === "fileChange") s.items.set(id, item);
    const name = TOOLS[kind] ?? (kind === "mcpToolCall" ? String(item.tool) : kind === "dynamicToolCall" ? String(item.tool) : null);
    if (!name) return;
    const input = toolInput(item);
    if (!turn.tools.has(id)) runner.tool(turn, id, name, input);
    if (!done) return;
    const status = item.status;
    const ok = status !== "failed" && status !== "declined" && item.success !== false && !item.error;
    let result: unknown = item.aggregatedOutput ?? item.result ?? item.error ?? "";
    if (kind === "fileChange") result = ((item.changes ?? []) as Obj[]).map((c) => `${c.kind?.type ?? c.kind ?? ""} ${c.path ?? ""}`.trim()).join("\n");
    if (kind === "mcpToolCall" && item.result?.content) result = item.result.content;
    if (status === "declined") result = "Declined";
    runner.toolEnd(turn, id, ok, typeof result === "string" || Array.isArray(result) ? result : JSON.stringify(result));
  }

  private request(runner: ChatRunner, turn: Turn, rid: unknown, method: string, p: Obj): void {
    const s = this.st(turn);
    const ask = (kind: AskBlock["kind"], tool: string, input: Obj, extra: Obj = {}) =>
      runner.ask(turn, {
        type: "ask",
        id: `codex-${rid}`,
        kind,
        tool,
        input,
        hint: toolHint(input),
        desc: String(input.description ?? ""),
        suggestions: [],
        status: "pending",
        ...extra,
        rpcId: rid,
        method,
      } as AskBlock);
    switch (method) {
      case "item/commandExecution/requestApproval": {
        const suggestions: Obj[] = [{ type: "session" }];
        if (p.proposedExecpolicyAmendment) suggestions.unshift({ type: "rule", rules: p.proposedExecpolicyAmendment });
        ask("permission", "Bash", { command: p.command ?? "", description: p.reason ?? "" }, { suggestions });
        return;
      }
      case "item/fileChange/requestApproval": {
        const changes: Obj[] = s.items.get(p.itemId)?.changes ?? [];
        const input = {
          file_path: changes.map((c) => String(c.path ?? "")).join(", ") || p.grantRoot || "",
          diff: changes.map((c) => String(c.diff ?? "")).join("\n").slice(0, 6000),
          description: p.reason ?? "",
        };
        ask("permission", "Edit", input, { suggestions: [{ type: "session" }] });
        return;
      }
      case "item/tool/requestUserInput": {
        const questions = ((p.questions ?? []) as Obj[]).map((q) => ({
          id: q.id,
          question: q.question ?? "",
          header: q.header ?? "",
          options: ((q.options ?? []) as Obj[]).map((o) => ({ label: o.label, description: o.description })),
          multiSelect: false,
        }));
        ask("question", "AskUserQuestion", { questions });
        return;
      }
      case "item/permissions/requestApproval":
        ask("permission", "Permissions", { description: p.reason ?? "", permissions: p.permissions }, { raw: p });
        return;
      case "mcpServer/elicitation/request":
        // the host app's own tools are pre-approved, as with Claude Code's --allowedTools
        if (s.spec.mcp && p.serverName === s.spec.mcp.name && p.mode !== "url") {
          s.rpc.reply(rid, { action: "accept", content: {} });
          return;
        }
        if (p.mode === "form" && Object.keys(p.requestedSchema?.properties ?? {}).length === 0) {
          ask("permission", `${p.serverName}`, { description: p.message ?? "" });
          return;
        }
        s.rpc.reply(rid, { action: "decline" }); // forms with fields and links: not in the sidebar yet
        return;
      default:
        s.rpc.reply(rid, undefined, `skillframe does not support ${method}`);
    }
  }
}

function toolInput(item: Obj): Obj {
  switch (item.type) {
    case "commandExecution": {
      const actions: Obj[] = item.commandActions ?? [];
      return { command: actions.length === 1 && actions[0].command ? actions[0].command : item.command ?? "" };
    }
    case "fileChange":
      return { file_path: ((item.changes ?? []) as Obj[]).map((c) => String(c.path ?? "")).join(", ") };
    case "webSearch":
      return { query: item.query ?? "" };
    case "imageView":
      return { file_path: item.path ?? "" };
    default:
      return item.arguments && typeof item.arguments === "object" ? item.arguments : {};
  }
}
