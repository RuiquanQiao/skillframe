// {{title}}: a todo list on the right, the user's own coding agent on the left.
//
// The todos live in todos.json in the app's data folder. The agent can change them through the
// app's tools (add_todo, set_done) or by editing the file; the page redraws either way.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appDataDir, createSkillframe } from "skillframe";

// the user's data, outside this source folder (APP_HOME overrides it, e.g. for tests)
const home = process.env.APP_HOME ?? appDataDir("{{name}}");
const workspace = path.join(home, "workspace");
mkdirSync(workspace, { recursive: true });
const TODOS = "todos.json";
if (!existsSync(path.join(workspace, TODOS))) {
  writeFileSync(path.join(workspace, TODOS), JSON.stringify([{ id: 1, text: "Ask the agent to add a todo", done: false }], null, 2) + "\n");
}

const sf = createSkillframe({
  appName: "{{title}}",
  workspace,
  dataDir: path.join(home, "app"),
  static: path.join(path.dirname(fileURLToPath(import.meta.url)), "public"),
  watch: [TODOS],

  // what the user is looking at, told to the agent with every message
  context: ({ screen }) => {
    const open = todos().filter((t) => !t.done).length;
    const picked = todos().find((t) => t.id === screen?.selected);
    return [
      `${TODOS} in your working folder holds the user's todos (a JSON array of { id, text, done }); ${open} are open.`,
      picked ? `The user has todo #${picked.id} selected: "${picked.text}".` : "",
    ].join(" ");
  },

  // the app's own abilities, as tools the agent can call
  tools: {
    list_todos: {
      description: "List the user's todos.",
      run: () => todos(),
    },
    add_todo: {
      description: "Add a todo to the user's list.",
      input: { text: "string" },
      run: ({ text }) => {
        const id = update((list) => {
          const id = Math.max(0, ...list.map((t) => t.id)) + 1;
          list.push({ id, text: String(text), done: false });
          return id;
        });
        return `Added todo #${id}.`;
      },
    },
    set_done: {
      description: "Mark a todo done (or not done).",
      input: { id: "number", done: "boolean" },
      run: ({ id, done }) => {
        update((list) => {
          const todo = list.find((t) => t.id === id);
          if (!todo) throw new Error(`There is no todo #${id}.`);
          todo.done = done;
        });
        return `Todo #${id} is ${done ? "done" : "open"}.`;
      },
    },
  },
});

function todos() {
  try {
    return JSON.parse(sf.files.read(TODOS).text);
  } catch {
    return [];
  }
}

/** change the list on top of the version just read: if it changed meanwhile, write() throws */
function update(change) {
  const { text, hash } = sf.files.read(TODOS);
  const list = JSON.parse(text || "[]");
  const result = change(list);
  sf.files.write(TODOS, JSON.stringify(list, null, 2) + "\n", { baseHash: hash });
  return result;
}

const { url } = await sf.listen({ port: Number(process.env.PORT ?? 4320) });
console.log(`{{title}} is running at ${url}`);
console.log(`Its data is in ${home}`);
