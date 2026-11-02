# create-skillframe

Start an app with a sidebar that runs your users' own coding agent (Claude Code, Codex, Qwen
Code), on their own subscription:

```bash
npm create skillframe my-app
```

```bash
cd my-app
npm install
npm start
```

You get a small working app: a todo list on the right, the agent on the left, and three tools the
agent uses to change the list (`add_todo`, `set_done`, `list_todos`). Change `server.js` and
`public/index.html` to make it yours. See the `skillframe` package for the full API.

To change skillframe's own core or sidebar too, copy it into the new app:

```bash
npm create skillframe my-app -- --eject
```

The app then imports `./skillframe/index.js` instead of the npm package, and `skillframe/README.md`
says which file does what.

Needs Node 22 or newer, and a coding agent installed and signed in on the computer that runs the
app.
