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
  createdAt: number;
  updatedAt: number;
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
}

export interface AssistantMessage {
  role: "assistant";
  blocks: Block[];
  at: number;
  error?: string | null;
  cancelled?: boolean;
  cost?: number | null;
  took?: number;
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
