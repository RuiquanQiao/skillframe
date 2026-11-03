# Studio

Build an app inside skillframe. Open a project folder: your coding agent (Claude Code, Codex or
Qwen Code) works in that folder in the sidebar, and the main area shows the project's page beside
it.

- **The page reloads by itself.** The folder is served as a website on a port of its own;
  `index.html` is the start page. When the agent (or you, in your editor) saves a file, the page
  reloads. Changes in `node_modules`, `.git` and other dot folders don't count.
- **The agent sees what you see.** With each message it hears which page you're on and the errors
  the page threw since it last loaded. When there are errors, a red button lists them, and "Ask the
  agent to fix these" sends them over.
- **Any stack.** Studio runs the project the way its own stack runs it and shows the page its dev
  server prints (`stacks.js`): a Node project's `dev` / `start` script (npm, pnpm, yarn or bun, by
  the lockfile; dependencies installed first when missing), Vite, Next.js, SvelteKit, Astro,
  Django, Flask, FastAPI, Streamlit, Gradio (with the project's own `.venv`), Go, Rust, Flutter
  web, .NET, Rails, Laravel and PHP. The button next to the address says how it is going
  (installing, starting, running, stopped) and opens its output; when it stops, its last output
  shows over the page with "Ask the agent to fix it".
- **Anything else** runs from one line in `.skillframe/run.json`, which you or the agent can write:
  `{ "command": "uvicorn api:app --reload --port {port}", "url": "http://127.0.0.1:{port}/" }`.
  `{port}` is a free port Studio picks (also in `PORT`); `url` is only needed when the server
  doesn't print its address. The agent has `app_logs` and `restart_app` tools, and hears with each
  message how the server is doing and, when it stopped, why.
- **Restart server** (in the window the .exe opens): builds skillframe again and restarts the
  studio's server in the same window. Use it when the code that runs the studio changed, for
  instance when the project you opened is skillframe itself. A reply being written at that moment
  stops, but the conversations go on: each message resumes the agent's session.

```
npm run studio -- E:\path\to\project        (from the repository root, after npm install)
```

On Windows, `npm run exe` also makes `demos\skillframe Studio.exe`: double-click it, or drop a folder on
it. Each project keeps its own chats, in `.data/projects/`; the last folder opens again next time.

## Files

- `server.js`: the project's preview server, the folder picker, the tool, and what the agent is
  told with each message
- `public/index.html`: the start screen (open a folder, recent folders) and the studio
