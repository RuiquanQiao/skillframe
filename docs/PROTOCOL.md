# skillframe protocol (v0)

How the sidebar (`<skillframe-chat>`) talks to the skillframe core. Anything that serves these
routes and events can drive the sidebar, so a backend in another language (Python, Rust, Go) only
needs to implement this page.

Status: **v0**, written from the code at M3. It may still change before 1.0; changes will be listed
here.

## Conventions

- Every route lives under a **base path**, `/sf` by default. Below, `/chats` means `/sf/chats`.
- Bodies are JSON. Requests that change anything are `POST` (or `DELETE`) with
  `Content-Type: application/json`.
- Errors are `{ "error": "<a sentence for the user>" }` with a status code:
  `400` bad input, `403` refused, `404` not found, `409` busy or in conflict, `415` not JSON.
- Times are Unix seconds with milliseconds (`1793515673.351`).

## Who may call it

The core drives a coding agent that can edit files and run commands, so it answers only the page
it was made for:

| Check | Why |
|---|---|
| The `Host` header must be a loopback name (`localhost`, `127.0.0.1`, `[::1]`, or what the host app allows) | stops DNS rebinding: a web page on another site can't reach the server under its own name |
| Requests that change state must come from the same origin as the page (`Origin` absent or equal to `http://<Host>`) | a page on another site can't start a chat |
| Those requests must be `application/json` | a plain HTML form can't be used to send one |
| `/mcp` needs `Authorization: Bearer <token>` | only agent processes the core started know the token |

## Shapes

```ts
interface ChatMeta {
  id: string;
  title: string;
  agent: string;             // "claude" | "codex" | "qwen" | …; fixed once the chat has started
  sessionId?: string;        // the agent's own session; the next reply resumes it
  model?: string;            // picked model ("" or absent: the agent's default)
  mode?: string;             // picked permission mode (absent: as the user set the agent up)
  effort?: string;           // picked effort level ("low" … "max", or the agent's own; absent: the agent decides)
  modelUsed?: string;        // the model the agent said it ran last
  context?: { used: number | null; window: number | null; compacted?: boolean };  // context window use after the last reply
  tasks?: Task[];            // the agent's task list as last reported
  fork?: { sessionId: string; at?: string };   // set on a fork until its first reply
  createdAt: number;
  updatedAt: number;
}

interface Task { id: string; subject: string; status: "pending" | "in_progress" | "completed" }

interface Attachment { name: string; path: string; type: string; image: boolean }

type Message =
  | { role: "user"; text: string; at: number; files?: Attachment[] }
  | { role: "assistant"; blocks: Block[]; at: number; error?: string | null; cancelled?: boolean;
      cost?: number | null; took?: number; point?: string };   // point: a fork point

type Block =
  | { type: "text" | "thinking"; text: string }
  | { type: "tool"; id: string; name: string; hint: string; result: string;
      status: "running" | "done" | "error" | "cancelled" | "unknown" }
  | { type: "ask"; id: string; kind: "permission" | "question" | "plan"; tool: string;
      input: object; hint: string; desc: string; suggestions: object[];
      status: "pending" | "allowed" | "denied" | "answered" | "approved" | "revise" | "cancelled";
      answers?: Record<string, string> }
  | { type: "note"; text: string };

// the user's answer to an "ask" block
interface Decision {
  allow?: boolean; message?: string; suggestion?: number;   // permission ("always allow" = a suggestion's index)
  answers?: Record<string, string>; skip?: boolean;         // question: question text -> picked label(s)
  approve?: boolean; mode?: string; feedback?: string;      // plan
}
```

A tool's `name` is the agent's own (`Read`, `Bash`, `Edit`…). The host app's tools arrive as
`mcp__<server>__<tool>` from Claude Code and as the bare tool name from Codex and ACP agents; the
sidebar shows the bare name either way.

## Routes

### App

| Route | Answer |
|---|---|
| `GET /app` | `{ appName, agents: AgentInfo[], tools: { name, description }[], watch: string[] }` |
| `GET /agents/:id/options` | What the agent reports about itself, asked without a model call (`?refresh=1` asks again): `{ modes: Option[], models: Model[], defaultModel?, commands: { name, desc, hint }[], account?: { email?, plan? }, signedIn?, limits?: Limits }`. `Option = { id, name, desc? }`, `Model = Option & { efforts: string[], more?: true }` (`more`: listed under "More models"), `Limits = { windows: { [key]: { utilization: 0..1, resetsAt?, minutes? } }, status?, at }` with keys `five_hour`, `seven_day` or `m<minutes>`. |
| `GET /ui/<file>` | the sidebar's own files (`/ui/skillframe-chat.js`) |
| `GET /health` | `{ ok: true, pages }`: `pages` is how many pages hold `/events` open. A desktop shell can stop the server once it drops to 0, instead of watching a browser process that may hand its window to another one. |
| `POST /publish` | `{ name, data }` from the host app's own server (any language): every open page gets an `sf` event, and the sidebar fires `sf:<name>`. `name` is a word. |
| `GET /workspace/files?q=` | `{ files: string[] }`: up to 50 paths in the agent's folder (relative, `/`-separated) containing every word of `q`, for "@" in the box. Dot folders, `node_modules` and build output are skipped; names only, never contents. |

`AgentInfo = { id, name, installed, signedIn: boolean | null, install, login, fork }`.
`signedIn` is a guess from where the agent keeps its own login (`null`: can't tell without asking it);
the agent's own error is the real answer. `install` is the command that installs it and `login` how
to sign in (markdown). `fork` says whether its chats can be forked.

### Chats

| Route | Body | Answer |
|---|---|---|
| `GET /chats` | | `{ chats: ChatMeta[] (newest first), running: string[] }` |
| `POST /chats` | `{ agent?, title? }` | the new `ChatMeta` |
| `GET /chats/:id` | | `{ meta, messages: Message[], live: { blocks, queue, startedAt } \| null }` (`live`: the reply in progress) |
| `DELETE /chats/:id` | | `{ ok: true }`; stops a running reply first |
| `POST /chats/:id/send` | `{ text, shown?, screen?, files?: Attachment[] }` | `{ ok, queued, id? }`. `shown` is what the transcript displays instead of `text`; `screen` is passed to the host app's `context()`; `files` must be attachments this chat's `/upload` returned. While a reply runs, the message is queued (`queued: true`). |
| `POST /chats/:id/upload` | `{ name, type, data }` (`data` base64) | the saved `Attachment` (a new name if one exists) |
| `POST /chats/:id/answer` | `{ requestId, decision: Decision }` | `{ ok, ask }`; `404` if that card no longer waits |
| `POST /chats/:id/settings` | `{ mode?, model?, effort? }` | the updated `ChatMeta`; mode and model apply to the running reply where the agent can, effort from the next message. `""` goes back to the agent's own choice. |
| `POST /chats/:id/title` | `{ title }` | the renamed `ChatMeta` |
| `POST /chats/:id/agent` | `{ agent }` | the updated `ChatMeta`; `409` once the chat has started |
| `POST /chats/:id/fork` | `{ at }` (index of an assistant message) | the new `ChatMeta`, holding the messages up to `at`; `409` when the agent can't fork or `at` isn't a reply |
| `POST /chats/:id/cancel` | `{}` | `{ ok: true }`; a real interrupt, then a kill if the agent does not stop |

### Shared files

Only paths matching the host app's `watch` globs, relative to the workspace.

| Route | Body | Answer |
|---|---|---|
| `GET /files?path=notes.json` | | `{ path, text, hash }` (`hash: ""` when the file doesn't exist) |
| `POST /files` | `{ path, text, baseHash? }` | `{ path, hash }`. With `baseHash` (the version read; `""` = must not exist yet) and a newer file on disk: `409 { error, conflict: true, current: { path, text, hash } }` and nothing is written. |

### The host app's tools (MCP)

`POST /mcp` is a stateless MCP server over the "Streamable HTTP" transport: one JSON-RPC message
(or batch) in, one JSON answer out (`202` with no body for notifications). It implements
`initialize`, `ping`, `tools/list` and `tools/call`. A tool that throws answers with
`isError: true` and the message, so the agent can react. The calling chat's id comes in the
`X-Skillframe-Chat` header. The core gives agents this server in each one's own way: Claude Code
`--mcp-config`, Codex `-c mcp_servers.*` with the token in `SKILLFRAME_MCP_TOKEN`, ACP agents in
`session/new`'s `mcpServers` (HTTP, or the stdio bridge `bin/mcp-bridge.js`).

## Events: `GET /events`

A server-sent event stream (`text/event-stream`). Every open page gets every event; chat events
carry `chat` (the chat id) and the page ignores other chats'. A comment line arrives every 20
seconds to keep the stream open.

| Event | Data | Meaning |
|---|---|---|
| `chat.start` | `{ chat, message, startedAt }` | a reply started for this user message |
| `chat.init` | `{ chat, model?, … }` | the agent's session is open |
| `chat.delta` | `{ chat, text, kind: "text" \| "thinking" }` | streamed text; append to the last block of that kind |
| `chat.tool` | `{ chat, tool }` | a tool step started or changed (replace by `id`) |
| `chat.ask` | `{ chat, ask }` | a card appeared or changed (replace by `id`) |
| `chat.block` | `{ chat, block }` | another block (a note) |
| `chat.queue` | `{ chat, queue }` | messages waiting behind the current reply |
| `chat.next` | `{ chat, message, queue, startedAt }` | a queued message went in; a new reply starts |
| `chat.reply` | `{ chat, error, queue }` | a reply is complete and saved (reload the chat) |
| `chat.done` | `{ chat, ok, error, cancelled, cost }` | the agent process ended; the chat is idle |
| `chat.tasks` | `{ chat, tasks }` | the agent's task list changed |
| `chat.meta` | `{ chat, meta }` | the chat's settings changed |
| `agent.info` | `{ agent, modes, models }` | an agent reported what it offers (ACP agents, in their first chat) |
| `agent.limits` | `{ agent, limits }` | the agent reported its plan's usage (Claude Code's `rate_limit_event`, Codex's `account/rateLimits/updated`) |
| `app.tool` | `{ name, args, chat }` | the agent called one of the host app's tools |
| `file.changed` | `{ path, hash, by: "agent" \| "outside" \| "app" }` | a watched file changed. `by` is a best guess: `agent` while a reply runs |
| `sf` | `{ name, data }` | the host app's own event (`sf.publish(name, data)`); the sidebar fires it as `sf:<name>` |

## Changes

- v0 (2026-11-01): first version, M1–M3.
- v0 (2026-11-03): `effort`, `modelUsed` and `context` on chats; `/agents/:id/options` answers everything the agent reports (models with effort levels, commands, account, limits); `POST /chats/:id/title`; `GET /health`; `POST /publish`; `GET /workspace/files`; the `agent.limits` event.
