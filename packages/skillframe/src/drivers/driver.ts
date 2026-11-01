// One agent protocol. ChatRunner owns the process, the transcript, the queue and the events;
// a driver says how to start the agent and turns its output into blocks.
import type { ChatRunner, Turn } from "../chat/runner.js";
import type { AskBlock, ChatMeta, Decision } from "../chat/types.js";

export interface TurnSpec {
  chat: ChatMeta;
  prompt: string;
  /** what the user is looking at in the host app, for the agent's system prompt */
  context: string;
  addDirs: string[];
  /** where the driver may write per-turn files */
  runDir: string;
  allowedTools: string[];
  /** an MCP config file with the host app's tools */
  mcpConfig?: string;
}

export interface ReplyEnd {
  error: string | null;
  cost?: number | null;
}

export interface Driver {
  /** the arguments after the command that put the agent in its machine mode */
  args(spec: TurnSpec): string[];
  /** right after the process starts: send the first message */
  begin(turn: Turn, spec: TurnSpec): void;
  /** a queued message into the running process */
  send(turn: Turn, prompt: string): boolean;
  /** one line of output; a ReplyEnd when a reply is over */
  handle(runner: ChatRunner, turn: Turn, msg: Record<string, unknown>): ReplyEnd | null;
  /** write the user's answer to a card and set its status; returns a new permission mode, if any */
  answer(turn: Turn, ask: AskBlock, decision: Decision): string | undefined;
  /** true when a real interrupt went out (the runner kills the process if it does not stop) */
  interrupt(turn: Turn): boolean;
  /** no more messages: let the process end */
  close(turn: Turn): void;
}
