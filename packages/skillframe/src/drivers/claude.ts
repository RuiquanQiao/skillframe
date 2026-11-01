// Claude Code over `claude -p` with stream-json in AND out: the channel Claude Code's own SDK
// uses, spoken to the user's own installed `claude`. Permission prompts come back on the same
// channel (`--permission-prompt-tool stdio`) and become cards.
//
// Deliberately NOT done: `--bare`, `--system-prompt`, a forced reply language. The user's
// CLAUDE.md, skills, memory, settings and MCP servers load exactly as in their terminal; the only
// additions are the host app's note (appended to the system prompt) and the host app's tools.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChatRunner, Turn } from "../chat/runner.js";
import { toolHint } from "../chat/runner.js";
import type { AskBlock, Decision } from "../chat/types.js";
import type { Driver, ReplyEnd, TurnSpec } from "./driver.js";

export const MODES = ["default", "acceptEdits", "plan", "auto"];

type Obj = Record<string, any>;

function userLine(text: string): Obj {
  return { type: "user", message: { role: "user", content: text } };
}

export class ClaudeDriver implements Driver {
  args(spec: TurnSpec): string[] {
    const { chat } = spec;
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-prompt-tool", "stdio",
    ];
    if (spec.allowedTools.length) args.push("--allowedTools", spec.allowedTools.join(","));
    if (chat.mode && MODES.includes(chat.mode)) args.push("--permission-mode", chat.mode);
    if (chat.model) args.push("--model", chat.model);
    if (chat.sessionId) args.push("--resume", chat.sessionId);
    if (spec.context.trim()) {
      // a file, not an argument: no quoting rules to get wrong, no command-line length limit
      mkdirSync(spec.runDir, { recursive: true });
      const file = path.join(spec.runDir, `${chat.id}.context.md`);
      writeFileSync(file, spec.context, "utf8");
      args.push("--append-system-prompt-file", file);
    }
    if (spec.mcpConfig) args.push("--mcp-config", spec.mcpConfig);
    for (const d of spec.addDirs) args.push("--add-dir", d);
    return args;
  }

  begin(turn: Turn, spec: TurnSpec): void {
    turn.write(userLine(spec.prompt));
  }

  send(turn: Turn, prompt: string): boolean {
    return turn.write(userLine(prompt));
  }

  close(turn: Turn): void {
    turn.close(); // Claude Code ends by itself once its stdin closes
  }

  interrupt(turn: Turn): boolean {
    return turn.write({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } });
  }

  answer(turn: Turn, ask: AskBlock, d: Decision): string | undefined {
    let resp: Obj;
    let mode: string | undefined;
    if (ask.kind === "question") {
      if (d.skip) {
        resp = { behavior: "deny", message: "The user skipped this question without answering." };
        ask.status = "denied";
      } else {
        const answers = Object.fromEntries(Object.entries(d.answers ?? {}).map(([k, v]) => [String(k), String(v)]));
        resp = { behavior: "allow", updatedInput: { ...ask.input, answers } };
        ask.status = "answered";
        ask.answers = answers;
      }
    } else if (ask.kind === "plan") {
      if (d.approve) {
        mode = d.mode && ["acceptEdits", "default", "auto"].includes(d.mode) ? d.mode : "default";
        resp = { behavior: "allow", updatedInput: ask.input, updatedPermissions: [{ type: "setMode", mode, destination: "session" }] };
        ask.status = "approved";
      } else {
        const fb = (d.feedback ?? "").trim();
        resp = {
          behavior: "deny",
          message: "The user wants to keep refining the plan; don't carry it out yet." + (fb ? ` Their feedback: ${fb}` : ""),
        };
        ask.status = "revise";
      }
    } else if (d.allow) {
      resp = { behavior: "allow", updatedInput: ask.input };
      const pick = d.suggestion;
      if (typeof pick === "number" && ask.suggestions[pick]) {
        const sug = ask.suggestions[pick] as Obj;
        resp.updatedPermissions = [sug];
        if (sug.type === "setMode") mode = sug.mode;
      }
      ask.status = "allowed";
    } else {
      resp = { behavior: "deny", message: (d.message ?? "").trim() || "The user declined this action." };
      ask.status = "denied";
    }
    turn.write({ type: "control_response", response: { subtype: "success", request_id: ask.id, response: resp } });
    return mode;
  }

  handle(runner: ChatRunner, turn: Turn, msg: Obj): ReplyEnd | null {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          runner.store.update(turn.chatId, { sessionId: msg.session_id ?? undefined }, false);
          runner.emit("chat.init", turn.chatId, { model: msg.model, mode: msg.permissionMode, tools: msg.tools, mcp: msg.mcp_servers });
        } else if (msg.subtype === "compact_boundary") {
          runner.block(turn, { type: "note", text: "Context compacted" });
        }
        return null;

      case "control_request":
        this.onAsk(runner, turn, msg);
        return null;

      case "control_cancel_request": {
        const ask = turn.asks.get(msg.request_id);
        if (ask && ask.status === "pending") {
          ask.status = "cancelled";
          runner.emit("chat.ask", turn.chatId, { ask });
        }
        return null;
      }

      case "stream_event": {
        if (msg.parent_tool_use_id) return null; // a subagent's chatter stays out of the main transcript
        const ev = msg.event ?? {};
        const delta = ev.delta ?? {};
        if (ev.type === "content_block_delta") {
          if (delta.type === "text_delta") runner.text(turn, delta.text ?? "");
          else if (delta.type === "thinking_delta" && delta.thinking) runner.text(turn, delta.thinking, "thinking");
        }
        return null;
      }

      case "assistant": {
        if (msg.parent_tool_use_id) return null;
        const message = msg.message ?? {};
        for (const block of message.content ?? []) {
          // local commands (/context, /cost…) answer without streaming
          if (block.type === "text" && message.model === "<synthetic>" && block.text) runner.text(turn, block.text);
          if (block.type === "tool_use") runner.tool(turn, block.id, block.name, block.input ?? {});
        }
        return null;
      }

      case "user": {
        if (msg.parent_tool_use_id) return null;
        for (const block of msg.message?.content ?? []) {
          if (block?.type === "tool_result") runner.toolEnd(turn, block.tool_use_id, !block.is_error, block.content);
        }
        return null;
      }

      case "result": {
        if (msg.session_id) runner.store.update(turn.chatId, { sessionId: msg.session_id }, false);
        // nothing streamed (older versions, some errors): fall back to the final text
        if (!turn.blocks.some((b) => b.type === "text") && msg.result && !msg.is_error) runner.text(turn, String(msg.result));
        let error: string | null = null;
        if (msg.is_error || (msg.subtype && msg.subtype !== "success")) {
          error = turn.cancelled ? null : String(msg.result || msg.errors?.join("\n") || "Claude Code reported an error");
        }
        return { error, cost: msg.total_cost_usd ?? null };
      }
    }
    return null;
  }

  private onAsk(runner: ChatRunner, turn: Turn, msg: Obj): void {
    const req = msg.request ?? {};
    if (req.subtype !== "can_use_tool") {
      turn.write({
        type: "control_response",
        response: { subtype: "error", request_id: msg.request_id, error: `skillframe does not support ${req.subtype}` },
      });
      return;
    }
    const name = String(req.tool_name ?? "");
    const input = req.input ?? {};
    runner.ask(turn, {
      type: "ask",
      id: String(msg.request_id),
      kind: name === "AskUserQuestion" ? "question" : name === "ExitPlanMode" ? "plan" : "permission",
      tool: name,
      input,
      hint: toolHint(input),
      desc: req.description ?? "",
      suggestions: req.permission_suggestions ?? [],
      status: "pending",
    });
  }
}
