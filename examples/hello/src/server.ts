// The smallest skillframe app: a notes list on the right, the user's own coding agent (Claude
// Code or Codex) on the left. The notes live in workspace/notes.json, a file the app and the agent
// share: the agent can edit it directly or through the app's tools, and the page redraws either way.
//
//   npm run hello        (from the repository root)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const workspace = path.join(root, "workspace");

type Note = { id: number; text: string };

// a first run starts with one note
mkdirSync(workspace, { recursive: true });
if (!existsSync(path.join(workspace, "notes.json"))) {
  writeFileSync(path.join(workspace, "notes.json"), JSON.stringify([{ id: 1, text: "Try asking the agent to add a note." }], null, 2) + "\n");
}

const sf = createSkillframe({
  appName: "Hello Notes",
  workspace,
  dataDir: path.join(root, ".data"),
  static: path.join(root, "public"),
  watch: ["notes.json"],

  context: ({ screen }) => {
    const s = screen as { selected?: number } | null;
    const picked = readNotes().find((n) => n.id === s?.selected);
    const where = picked ? `The user has note #${picked.id} selected: "${picked.text}".` : "The user is looking at the notes list.";
    return `${where} The notes are stored in notes.json in your working folder (a JSON array of { id, text }).`;
  },

  tools: {
    list_notes: {
      description: "List the notes shown in the app, with their ids.",
      run: () => readNotes(),
    },
    add_note: {
      description: "Add a note to the list the user sees in the app.",
      input: { text: "string" },
      run: ({ text }) => {
        const { text: raw, hash } = sf.files!.read("notes.json");
        const notes = parse(raw);
        const note = { id: Math.max(0, ...notes.map((n) => n.id)) + 1, text: String(text) };
        // written on top of the version just read: if the file changed meanwhile, this throws
        sf.files!.write("notes.json", JSON.stringify([...notes, note], null, 2) + "\n", { baseHash: hash });
        return `Added note #${note.id}.`;
      },
    },
  },
});

function parse(text: string): Note[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function readNotes(): Note[] {
  return parse(sf.files!.read("notes.json").text);
}

const { url } = await sf.listen({ port: Number(process.env.PORT) || 4317 });
console.log(`Hello Notes is running at ${url}`);
