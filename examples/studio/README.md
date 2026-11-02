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
- **Projects with a dev server of their own** (Vite, Next…): type its address in the bar, or ask
  the agent to start it; it can show any `localhost` address with its `show_in_preview` tool.
- **Restart server** (in the window the .exe opens): builds skillframe again and restarts the
  studio's server in the same window. Use it when the code that runs the studio changed, for
  instance when the project you opened is skillframe itself. A reply being written at that moment
  stops, but the conversations go on: each message resumes the agent's session.

```
npm run studio -- E:\path\to\project        (from the repository root, after npm install)
```

On Windows, `npm run exe` also makes `skillframe Studio.exe`: double-click it, or drop a folder on
it. Each project keeps its own chats, in `.data/projects/`; the last folder opens again next time.

## Files

- `server.js`: the project's preview server, the folder picker, the tool, and what the agent is
  told with each message
- `public/index.html`: the start screen (open a folder, recent folders) and the studio
