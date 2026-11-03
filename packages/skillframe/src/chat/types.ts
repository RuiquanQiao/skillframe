// The shapes the sidebar draws. They are also the wire format (docs/PROTOCOL.md, to come), so
// every field is plain JSON.

export interface ChatMeta {
  id: string;
  title: string;
  agent: string;
  /** the agent's own session id: the next reply resumes it */
  sessionId?: string;
  model?: string;
  mode?: string;
  /** picked effort level ("low" … "max"; absent: the agent's own choice) */
  effort?: string;
  /** the model the agent last said it runs (the picked one, or its default) */
  modelUsed?: string;
  /** how full the agent's context window is, after the last reply */
  context?: ContextUse;
  /** the agent's task list as it last reported it */
  tasks?: Task[];
  /** set on a chat forked from another: its first reply branches that session at `at` */
  fork?: { sessionId: string; at?: string };
  createdAt: number;
  updatedAt: number;
}

/** tokens in the context window; `used` is unknown right after the agent compacted it */
export interface ContextUse {
  used: number | null;
  window: number | null;
  compacted?: boolean;
}

export interface Task {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed";
}

/** A file the user attached to a message (saved in the chat's own folder). */
export interface Attachment {
  name: string;
  path: string;
  image: boolean;
  /** image/png etc. */
  type: string;
}

export interface TextBlock {
  type: "text" | "thinking";
  text: string;
}

export interface ToolBlock {
  type: "tool";
  id: string;
  name: string;
  hint: string;
  status: "running" | "done" | "error" | "cancelled" | "unknown";
  result: string;
}

/** A card waiting for the user: a permission, the agent's question, or its plan. */
export interface AskBlock {
  type: "ask";
  id: string;
  kind: "permission" | "question" | "plan";
  tool: string;
  input: Record<string, unknown>;
  hint: string;
  desc: string;
  suggestions: unknown[];
  status: "pending" | "allowed" | "denied" | "answered" | "approved" | "revise" | "cancelled";
  answers?: Record<string, string>;
}

export interface NoteBlock {
  type: "note";
  text: string;
}

export type Block = TextBlock | ToolBlock | AskBlock | NoteBlock;

export interface UserMessage {
  role: "user";
  text: string;
  at: number;
  files?: Attachment[];
}

export interface AssistantMessage {
  role: "assistant";
  blocks: Block[];
  at: number;
  error?: string | null;
  cancelled?: boolean;
  cost?: number | null;
  took?: number;
  /** where the agent's session stood after this reply (Claude Code: message uuid, Codex: turn id): a fork point */
  point?: string;
}

export type Message = UserMessage | AssistantMessage;

/** The user's answer to a card. */
export interface Decision {
  allow?: boolean;
  message?: string;
  /** index into the card's suggestions ("always allow …") */
  suggestion?: number;
  answers?: Record<string, string>;
  skip?: boolean;
  approve?: boolean;
  mode?: string;
  feedback?: string;
}
