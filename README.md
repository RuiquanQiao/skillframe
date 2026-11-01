# skillframe

Give your app a sidebar that runs **your users' own coding agent** (Claude Code, Codex, or an agent
that speaks the [Agent Client Protocol](https://agentclientprotocol.com) such as Qwen Code), on
**their own subscription**, and wire it both ways into your UI.

Your users don't paste an API key, and you don't pay for their usage: the sidebar runs the agent
they already installed and signed in to.

```
┌──────────────────────────┬──────────────────────────────────────┐
│ <skillframe-chat>        │  your app (any HTML)                 │
│  the user's own agent    │                                      │
│                          │   ◀── the agent calls your tools      │
│  "add a todo: buy milk"  │   ◀── it edits a file you watch       │
│                          │   ──▶ you tell it what's on screen    │
└──────────────────────────┴──────────────────────────────────────┘
```

## Why

Claude Code and Codex can't show your app inside their own windows: Claude Code's mods draw fixed
components (no HTML), and MCP Apps (HTML in the chat) aren't drawn in Claude Code. skillframe turns
it around and puts the agent inside your app.

## Quick start

```bash
npm create skillframe my-app
```

```bash
cd my-app
npm install
npm start
```

Open the address it prints: a todo list on the right, the agent on the left. Ask it to "add a todo
to buy milk". You need Node 22+ and one agent installed and signed in on the computer:

| Agent | Install | Sign in |
|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | run `claude`, then `/login` |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Qwen Code (ACP) | `npm install -g @qwen-code/qwen-code` | run `qwen`, then `/auth` |

> Not on npm yet? Until the first release, clone this repository and run `npm install` then
> `npm run hello` for the example app.

## What the sidebar does

- Streams replies, thinking and tool steps; shows the agent's task list.
- Cards for the agent's permission requests, its questions, and its plans (allow, always allow,
  deny with a reason; pick answers; approve or keep planning).
- Pickers for the agent, permission mode and model; stop; messages queue while the agent works.
- Attachments: paste, drop or pick files. Images go to the agent as images, other files by path.
- Fork a chat from any reply (Claude Code and Codex).
- Light and dark, English and Chinese, from 320 px wide up. Its styles live in a shadow root, so
  they can't clash with yours; colors are CSS variables you can set.

## How it stays within the rules

skillframe only starts the agent command the user installed and signed in to themselves,
**unmodified**. It never ships its own copy of an agent, never uses the Claude Agent SDK, and never
reads, stores or forwards a sign-in; sign-in always happens in the agent's own flow. Anthropic's
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page says developers
building products should use API keys, and also that this does not prevent an end user from signing
in to the unmodified Claude Code binary with their own subscription. That page has changed several
times in 2026: if you ship a commercial product, read it yourself. Supporting several agents from
day one is skillframe's answer to that risk.

## Use it in your app

### Server (Node 22+)

```js
import { appDataDir, createSkillframe } from "skillframe";

const home = appDataDir("my-app"); // %APPDATA%\my-app, ~/Library/Application Support/my-app, ~/.local/share/my-app

const sf = createSkillframe({
  appName: "My App",
  workspace: `${home}/workspace`, // the agent's working folder
  dataDir: `${home}/app`,         // chats, attachments, history
  static: "./public",             // your page, served at /
  watch: ["todos.json"],          // files you and the agent both edit
  context: ({ screen }) => `The user has todo #${screen?.selected} open.`,
  tools: {
    add_todo: {
      description: "Add a todo to the user's list.",
      input: { text: "string" },
      run: ({ text }, { chatId }) => {
        const { text: raw, hash } = sf.files.read("todos.json");
        // on top of the version just read: throws Conflict if the agent changed the file meanwhile
        sf.files.write("todos.json", addTodo(raw, text), { baseHash: hash });
        return "Added.";
      },
    },
  },
});

await sf.listen({ port: 4320 });
```

Keep `workspace` out of your app's source repository: Claude Code keeps its memory per git
repository, so an agent working inside your repo would share memory with whoever develops it.

| Option | |
|---|---|
| `appName` | told to the agent; also names the tools' MCP server |
| `workspace` | the agent's working folder (its own CLAUDE.md, AGENTS.md, skills and settings load as usual) |
| `dataDir` | where chats, attachments and file history go |
| `agents` | which agents to offer, first is the default (default: every agent skillframe knows; missing ones show as not installed) |
| `context({ chatId, screen })` | what the user is looking at, in words; added to the agent's instructions with every message |
| `tools` | your app's abilities: `{ description, input, optional?, run(args, { chatId }) }`. `input` is JSON Schema properties or the shorthand `{ name: "string" }`. Offered to the agent over MCP and pre-approved. A thrown error goes back to the agent as a failed tool result. |
| `watch` | globs of shared files in `workspace` (`"todos.json"`, `"data/**/*.md"`) |
| `static` | a folder `listen()` serves at `/` |
| `basePath` | where the sidebar's routes live (default `/sf`) |
| `allowedTools` | more Claude Code permission rules that never ask (`"Bash(git status*)"`) |
| `allowedHosts` | Host names accepted besides the loopback ones |
| `env` | environment for the agent processes |

| On `sf` | |
|---|---|
| `listen({ port, host, routes })` | starts a local server; `routes(req, res)` answers your own requests first (return `true` when it did) |
| `handler(req, res)` | to mount skillframe in your own server; resolves `true` when it answered |
| `setOrigin(url)` | with `handler`: the address agents reach your tools at |
| `files.read(path)` / `files.write(path, text, { baseHash })` | the shared files, with versions (`hash`); see Conflict above |
| `publish(name, data)` | an event of your own to every open page (the element fires `sf:<name>`) |
| `send(chatId, { text, shown, screen, files })` | start a reply from the server |
| `on((event, data) => …)` | every event, in process |
| `close()` | stop agents, watchers and servers |

### Page (any framework, or none)

```html
<script type="module" src="/sf/ui/skillframe-chat.js"></script>
<skillframe-chat endpoint="/sf"></skillframe-chat>

<script type="module">
  const chat = document.querySelector("skillframe-chat");
  chat.setScreen({ selected: 3 });                                        // sent with every message
  chat.addEventListener("file-changed", (e) => reload(e.detail.path));    // the agent edited a watched file
  chat.addEventListener("sf:todos", (e) => draw(e.detail));               // your sf.publish("todos", …)
  button.onclick = () => chat.ask({ prompt: "Tidy up my todos", shown: "Tidy up" });
</script>
```

| | |
|---|---|
| attributes | `endpoint` (default `/sf`), `lang` (`en`, `zh`; default the browser's), `theme` (`light`, `dark`; default the system's) |
| `setScreen(obj)` | what the user is looking at; your `context()` receives it |
| `ask({ prompt, shown })` | start a reply from your own button; resolves `{ ok, error }` when it ends. `shown` is what the transcript displays. |
| `newChat()` | |
| events | `chat-done` (`{ ok, error, cancelled }`), `file-changed` (`{ path, hash, by }`), `sf:<name>` |
| CSS variables | `--sf-ink`, `--sf-muted`, `--sf-line`, `--sf-soft`, `--sf-accent`, `--sf-attention`, `--sf-danger`, `--sf-bg` |

Your page reads and writes the shared files too: `GET /sf/files?path=todos.json` gives
`{ text, hash }`; `POST /sf/files` with `{ path, text, baseHash }` answers 409 with the newer
version instead of overwriting the agent's edit.

### Already have a server, or a desktop shell

```js
http.createServer(async (req, res) => {
  if (await sf.handler(req, res)) return;
  // …your routes
}).listen(3000, "127.0.0.1");
sf.setOrigin("http://127.0.0.1:3000");
```

In Electron, start skillframe in the main process and load its URL in the window:
[examples/electron](examples/electron). Tauri and plain browser windows work the same way.

## How it works

The core starts each agent the way its own SDK or editor integration does: Claude Code with
`claude -p` and stream-json, Codex with `codex app-server`, ACP agents over the Agent Client Protocol.
Your tools reach every agent as one local MCP server that only processes skillframe started can call.
The page talks to the core over HTTP and server-sent events: [docs/PROTOCOL.md](docs/PROTOCOL.md)
describes it, so a backend in another language can drive the same sidebar.

The local server answers only its own page: loopback Host names, same-origin JSON requests, and a
token for the tools.

## Develop

```bash
npm install
npm test
```

Every test runs against a fake Claude Code, a fake Codex and a fake ACP agent that speak the same
protocols as the real ones, so the tests cost no tokens. The sidebar tests drive the Chrome or Edge
already on the machine, headless; without either they are skipped and say so.

- `packages/skillframe`: the library (no runtime dependencies)
- `packages/create-skillframe`: `npm create skillframe`
- `examples/hello`: notes, with TypeScript (`npm run hello`)
- `examples/electron`: the same sidebar in an Electron window (`cd examples/electron && npm install && npm start`)
- `docs/DESIGN.md`: the plan and the decisions behind it

## License

MIT
