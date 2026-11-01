// The smallest skillframe app: a notes list on the right, the user's own Claude Code on the
// left, and two tools that let the agent read and add notes in the app itself.
//
//   npm run hello        (from the repository root)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const notes: { id: number; text: string }[] = [{ id: 1, text: "Try asking the agent to add a note." }];

const sf = createSkillframe({
  appName: "Hello Notes",
  workspace: path.join(root, "workspace"),
  dataDir: path.join(root, ".data"),
  static: path.join(root, "public"),

  context: ({ screen }) => {
    const s = screen as { selected?: number } | null;
    const picked = notes.find((n) => n.id === s?.selected);
    return picked ? `The user has note #${picked.id} selected: "${picked.text}".` : "The user is looking at the notes list.";
  },

  tools: {
    list_notes: {
      description: "List the notes shown in the app, with their ids.",
      run: () => notes,
    },
    add_note: {
      description: "Add a note to the list the user sees in the app.",
      input: { text: "string" },
      run: ({ text }) => {
        const note = { id: Math.max(0, ...notes.map((n) => n.id)) + 1, text: String(text) };
        notes.push(note);
        sf.publish("notes", notes); // the page redraws the list
        return `Added note #${note.id}.`;
      },
    },
  },
});

const { url } = await sf.listen({
  port: Number(process.env.PORT) || 4317,
  // the app's own API: the page loads the list from here
  routes: (req, res) => {
    if (req.method !== "GET" || req.url !== "/api/notes") return false;
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(notes));
    return true;
  },
});
console.log(`Hello Notes is running at ${url}`);
