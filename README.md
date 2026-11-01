# skillframe

Give your app a sidebar that runs **your users' own coding agent** (Claude Code today; Codex and
others next), on **their own subscription**, wired both ways into your UI:

- your page tells the agent what the user is looking at, and your own buttons can start a task;
- the agent calls your app's abilities as tools (over MCP);
- you push updates back to the page when the agent changes something.

Status: **M1** (first working version). See [docs/DESIGN.md](docs/DESIGN.md) for the plan.

## How it stays within the rules

skillframe only starts the `claude` command the user installed and signed in to themselves,
unmodified. It never ships its own copy of an agent, never uses the Agent SDK, and never reads,
stores or forwards a sign-in. Anthropic's
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page allows an end
user to sign in to the unmodified Claude Code binary with their own subscription; if you ship a
commercial product, read that page yourself.

## Try the example

Needs Node 22+ and Claude Code installed and signed in (`claude`, then `/login`).

```bash
npm install
```

```bash
npm run hello
```

Open http://127.0.0.1:4317, and ask the agent to "add a note that says buy milk".

## Use it in your app

```ts
import { createSkillframe } from "skillframe";

const sf = createSkillframe({
  appName: "Hello Notes",
  workspace: "./workspace",     // the agent's working folder
  dataDir: "./.data",           // chats live here
  static: "./public",           // your page
  context: ({ screen }) => `The user has note ${screen?.selected} selected.`,
  tools: {
    add_note: {
      description: "Add a note to the list the user sees",
      input: { text: "string" },
      run: ({ text }) => { notes.push(text); sf.publish("notes", notes); return "Added."; },
    },
  },
});
await sf.listen({ port: 4317 });
```

```html
<script type="module" src="/sf/ui/skillframe-chat.js"></script>
<skillframe-chat endpoint="/sf"></skillframe-chat>
<script type="module">
  const chat = document.querySelector("skillframe-chat");
  chat.setScreen({ selected: 3 });                                  // what the user is looking at
  chat.addEventListener("sf:notes", (e) => draw(e.detail));          // sf.publish("notes", …)
  button.onclick = () => chat.ask({ prompt: "Summarize my notes", shown: "Summarize" });
</script>
```

Already have a server? Mount the handler instead of `listen()`:

```ts
http.createServer(async (req, res) => {
  if (await sf.handler(req, res)) return;
  // …your routes
});
sf.setOrigin("http://127.0.0.1:3000"); // so the agent can reach your tools
```

## Develop

```bash
npm test
```

Runs every test against a fake Claude Code that speaks the same stream-json protocol, so tests
cost no tokens. Prints one summary line, and the failures in full.

License: MIT.
