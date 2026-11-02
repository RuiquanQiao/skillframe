# {{title}}

A todo list with your coding agent beside it, made with skillframe.

```bash
npm install
npm start
```

Open the address it prints. The sidebar runs the coding agent installed on this computer (Claude
Code, Codex or Qwen Code), signed in with its user's own account. Ask it to "add a todo to buy
milk", or to "tick off everything about groceries".

- `server.js`: the app's data, the agent's tools (`add_todo`, `set_done`, `list_todos`) and what it
  is told about the screen.
- `public/index.html`: the page; the sidebar is the `<skillframe-chat>` element.
- The todos live in `todos.json` in the app's data folder (printed at start), outside this source
  folder: Claude Code keeps its memory per git repository, so the agent's working folder shouldn't
  be inside yours.
{{own}}
