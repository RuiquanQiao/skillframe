// The Agent Client Protocol (agentclientprotocol.com): the open standard Qwen Code, DeepSeek
// Harness, Gemini CLI and others speak over stdio. initialize, then session/load (or session/new),
// then session/prompt per message.
//
// ACP has no system prompt slot, so the host app's note rides with the message in a <context>
// block. The host app's tools go in `mcpServers`: as an HTTP server when the agent says it takes
// one, else through skillframe's stdio bridge (bin/mcp-bridge.js) to the same endpoint.
import path from "node:path";
import type { ChatRunner, Turn } from "../chat/runner.js";
import { toolHint } from "../chat/runner.js";
import type { AskBlock, Decision } from "../chat/types.js";
import { OWN_ROOT } from "../paths.js";
import { Rpc } from "./codex.js";
import type { Driver, ReplyEnd, TurnSpec } from "./driver.js";

type Obj = Record<string, any>;

const BRIDGE = path.join(OWN_ROOT, "bin", "mcp-bridge.js");

// ACP's tool kinds, named like Claude Code's tools so the sidebar draws them the same way
const TOOLS: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  delete: "Delete",
  move: "Move",
  search: "Grep",
  execute: "Bash",
  think: "Think",
  fetch: "WebFetch",
};
const STATUS: Record<string, "done" | "error"> = { completed: "done", failed: "error" };

export class AcpDriver implements Driver {
  constructor(private extraArgs: string[]) {}

  args(): string[] {
    return this.extraArgs;
  }

  private st(turn: Turn): Obj {
    return turn.state;
  }

  begin(turn: Turn, spec: TurnSpec): void {
    const s = this.st(turn);
    s.rpc = new Rpc(turn);
    s.spec = spec;
    s.loading = false;
    s.rpc.call(
      "initialize",
      { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "skillframe", version: "0" } },
      (r: Obj, e: string | null) => (e ? this.fail(turn, e) : this.session(turn, r ?? {})),
    );
  }

  private fail(turn: Turn, message: string): void {
    turn.error = turn.error ?? message;
    this.close(turn);
  }

  /** the host app's MCP server, in the shape this agent takes */
  private mcpServers(spec: TurnSpec, caps: Obj): Obj[] {
    if (!spec.mcp) return [];
    const { name, url, token, chatId } = spec.mcp;
    if (caps.mcpCapabilities?.http) {
      return [{ type: "http", name, url, headers: [{ name: "Authorization", value: `Bearer ${token}` }, { name: "X-Skillframe-Chat", value: chatId }] }];
    }
    return [
      {
        name,
        command: process.execPath,
        args: [BRIDGE, url],
        env: [
          { name: "SKILLFRAME_MCP_TOKEN", value: token },
          { name: "SKILLFRAME_CHAT", value: chatId },
        ],
      },
    ];
  }

  private session(turn: Turn, init: Obj): void {
    const s = this.st(turn);
    const spec: TurnSpec = s.spec;
    const caps = init.agentCapabilities ?? {};
    const sid = spec.chat.sessionId;
    const base = { cwd: spec.cwd, mcpServers: this.mcpServers(spec, caps) };
    const opened = (r: Obj, e: string | null, resumed: boolean) => {
      s.loading = false;
      if (e) return this.fail(turn, e);
      s.sid = r?.sessionId ?? sid;
      turn.runner.store.update(turn.chatId, { sessionId: s.sid }, false);
      this.learn(turn, r ?? {});
      if (sid && !resumed) turn.runner.block(turn, { type: "note", text: "This agent can't reopen an earlier conversation, so this reply starts a new one" });
      this.settings(turn, r ?? {});
    };
    if (sid && caps.loadSession) {
      s.loading = true; // the agent replays the history first: not shown again
      s.rpc.call("session/load", { ...base, sessionId: sid }, (r: Obj, e: string | null) => opened(r, e, true));
    } else {
      s.rpc.call("session/new", base, (r: Obj, e: string | null) => opened(r, e, false));
    }
  }

  /** the modes and models the agent offers, for the sidebar's pickers */
  private learn(turn: Turn, r: Obj): void {
    const modes = (r.modes?.availableModes ?? []).map((m: Obj) => ({ id: m.id, name: m.name ?? m.id, desc: m.description ?? "" }));
    const models = (r.models?.availableModels ?? []).map((m: Obj) => ({ id: m.modelId, name: m.name ?? m.modelId, desc: m.description ?? "" }));
    if (modes.length || models.length) turn.runner.learn(turn.state.spec.chat.agent, { modes, models });
  }

  /** the chat's own model and mode, if it picked some, then the message */
  private settings(turn: Turn, r: Obj): void {
    const s = this.st(turn);
    const chat = s.spec.chat;
    const steps: [string, Obj][] = [];
    if (chat.model && chat.model !== r.models?.currentModelId) steps.push(["session/set_model", { sessionId: s.sid, modelId: chat.model }]);
    if (chat.mode && chat.mode !== r.modes?.currentModeId) steps.push(["session/set_mode", { sessionId: s.sid, modeId: chat.mode }]);
    const next = () => {
      // a setting the agent refuses is skipped, never fatal
      const step = steps.shift();
      if (step) s.rpc.call(step[0], step[1], next);
      else this.send(turn, s.spec.prompt);
    };
    next();
  }

  send(turn: Turn, prompt: string): boolean {
    const s = this.st(turn);
    const spec: TurnSpec = s.spec;
    const text = spec.context.trim() ? `<context>\n${spec.context.trim()}\n</context>\n\n${prompt}` : prompt;
    return s.rpc.call("session/prompt", { sessionId: s.sid, prompt: [{ type: "text", text }] }, (r: Obj, e: string | null) => {
      const error = e ?? (r?.stopReason === "refusal" ? "The agent refused to answer" : null);
      s.done?.({ error: turn.cancelled ? null : error });
    });
  }

  close(turn: Turn): void {
    turn.close();
    // most ACP agents don't exit when stdin closes: end them
    setTimeout(() => {
      if (turn.proc && turn.proc.exitCode === null) turn.proc.kill();
    }, 1500).unref();
  }

  interrupt(turn: Turn): boolean {
    const s = this.st(turn);
    if (!s.rpc || !s.sid) return false;
    // the protocol wants every open permission request answered "cancelled"
    for (const ask of turn.asks.values() as Iterable<Obj>) {
      if (ask.rpcId !== undefined && !ask.replied) {
        ask.replied = true;
        s.rpc.reply(ask.rpcId, { outcome: { outcome: "cancelled" } });
      }
    }
    return s.rpc.notify("session/cancel", { sessionId: s.sid });
  }

  setLive(turn: Turn, change: { model?: string; mode?: string }): void {
    const s = this.st(turn);
    if (!s.rpc || !s.sid) return;
    if (change.model) s.rpc.call("session/set_model", { sessionId: s.sid, modelId: change.model });
    if (change.mode) s.rpc.call("session/set_mode", { sessionId: s.sid, modeId: change.mode });
  }

  answer(turn: Turn, ask: AskBlock & Obj, d: Decision): string | undefined {
    const options: Obj[] = ask.options ?? [];
    const first = (...kinds: string[]) => kinds.map((k) => options.find((o) => o.kind === k)?.optionId).find(Boolean);
    let option: string | undefined;
    if (d.allow) {
      const pick = typeof d.suggestion === "number" ? (ask.suggestions[d.suggestion] as Obj | undefined) : undefined;
      option = pick?.optionId ?? first("allow_once", "allow_always");
      ask.status = "allowed";
    } else {
      option = first("reject_once", "reject_always");
      ask.status = "denied";
    }
    ask.replied = true;
    this.st(turn).rpc.reply(ask.rpcId, { outcome: option ? { outcome: "selected", optionId: option } : { outcome: "cancelled" } });
    return undefined;
  }

  handle(runner: ChatRunner, turn: Turn, msg: Obj): ReplyEnd | null {
    const s = this.st(turn);
    // session/prompt's answer ends the reply: handled here so the runner sees it like any end
    let end: ReplyEnd | null = null;
    s.done = (r: ReplyEnd) => (end = r);
    if (s.rpc.dispatch(msg)) return end;
    const method: string = msg.method ?? "";
    const p: Obj = msg.params ?? {};
    if ("id" in msg) {
      if (method === "session/request_permission") {
        const tc: Obj = p.toolCall ?? {};
        const raw: Obj = tc.rawInput && typeof tc.rawInput === "object" ? tc.rawInput : {};
        const options: Obj[] = p.options ?? [];
        const input = { ...raw, description: tc.title ?? "" };
        runner.ask(turn, {
          type: "ask",
          id: `acp-${msg.id}`,
          kind: "permission",
          tool: TOOLS[tc.kind ?? ""] ?? tc.title ?? "tool",
          input,
          hint: toolHint(raw) || String(tc.title ?? ""),
          desc: String(tc.title ?? ""),
          suggestions: options.filter((o) => o.kind === "allow_always").map((o) => ({ type: "option", label: o.name, optionId: o.optionId })),
          status: "pending",
          rpcId: msg.id,
          options,
        } as AskBlock);
      } else {
        s.rpc.reply(msg.id, undefined, `skillframe does not support ${method}`);
      }
      return null;
    }
    if (method !== "session/update" || s.loading) return null;
    const u: Obj = p.update ?? {};
    const content: Obj = u.content && typeof u.content === "object" && !Array.isArray(u.content) ? u.content : {};
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        if (content.type === "text") runner.text(turn, content.text ?? "");
        break;
      case "agent_thought_chunk":
        if (content.type === "text") runner.text(turn, content.text ?? "", "thinking");
        break;
      case "tool_call": {
        const raw: Obj = u.rawInput && typeof u.rawInput === "object" ? u.rawInput : {};
        if (!turn.tools.has(u.toolCallId)) {
          const tool = runner.tool(turn, u.toolCallId, TOOLS[u.kind ?? ""] ?? u.title ?? "tool", raw);
          if (!tool.hint && u.title) tool.hint = String(u.title).slice(0, 160);
        }
        this.toolUpdate(runner, turn, u);
        break;
      }
      case "tool_call_update":
        this.toolUpdate(runner, turn, u);
        break;
      case "plan":
        runner.tasks(
          turn,
          ((u.entries ?? []) as Obj[]).map((e, i) => ({
            id: String(i + 1),
            subject: e.content ?? "",
            status: e.status === "in_progress" ? "in_progress" : e.status === "completed" ? "completed" : "pending",
          })),
        );
        break;
      case "current_mode_update":
        runner.store.update(turn.chatId, { mode: u.currentModeId }, false);
        break;
      case "usage_update":
        if (u.size) turn.usage = { used: Number(u.used ?? 0), window: Number(u.size) };
        break;
    }
    return null;
  }

  private toolUpdate(runner: ChatRunner, turn: Turn, u: Obj): void {
    const tool = turn.tools.get(u.toolCallId);
    if (!tool) return;
    const texts: string[] = [];
    for (const c of (u.content ?? []) as Obj[]) {
      if (c?.content?.type === "text") texts.push(c.content.text ?? "");
      else if (c?.type === "diff") texts.push(String(c.path ?? ""));
    }
    const st = STATUS[u.status ?? ""];
    if (st) runner.toolEnd(turn, tool.id, st === "done", texts.join("\n"));
  }
}
