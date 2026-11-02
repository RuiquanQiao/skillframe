// Grill Me: the `grilling` skill (github.com/mattpocock/skills) with a screen of its own.
//
// In a terminal, the skill asks its questions as text and the answers scroll away. Here the agent
// puts each round of questions on the page through the app's tools, the user answers in a form,
// and the design tree grows beside it. Everything lives in grill.json in the agent's working
// folder, which the page and the agent both read and write.
//
//   npm run grill        (from the repository root)
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
// APP_HOME puts the data somewhere else (the tests use it)
const home = process.env.APP_HOME ?? here;
const workspace = path.join(home, "workspace");
const GRILL = "grill.json";
const empty = () => ({ idea: "", questions: [], summary: null, confirmed: false });

mkdirSync(workspace, { recursive: true });
if (!existsSync(path.join(workspace, GRILL))) writeFileSync(path.join(workspace, GRILL), JSON.stringify(empty(), null, 2) + "\n");
// the skill goes where Claude Code looks for skills; the start message names the file for other agents
cpSync(path.join(here, "skill"), path.join(workspace, ".claude", "skills", "grilling"), { recursive: true });

const sf = createSkillframe({
  appName: "Grill Me",
  workspace,
  dataDir: path.join(home, ".data"),
  static: path.join(here, "public"),
  watch: [GRILL],

  context: ({ screen }) => {
    const g = grill();
    const open = g.questions.filter((q) => !q.decision);
    const looking = g.questions.find((q) => q.id === screen?.question);
    return [
      `This is the Grill Me app: the grilling skill (.claude/skills/grilling/SKILL.md in your working folder) with a screen. Ask questions with ask_round, never in the chat.`,
      g.idea ? `The idea being grilled: "${g.idea}". ${g.questions.length - open.length} of ${g.questions.length} questions are settled.` : "",
      looking ? `The user is looking at ${looking.id}, "${looking.title}".` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },

  tools: {
    get_grill: {
      description: "The whole design tree: the idea, every question with its parent, the user's answer and the settled decision.",
      run: () => grill(),
    },
    ask_round: {
      description:
        "Put the next round of questions on the user's screen (the whole frontier at once). Each question: a short title, a body, your recommended answer, options when it is a multiple choice, and parent: the id of the settled question it hangs off (leave it out for a top-level decision). Returns the new ids.",
      input: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              recommended: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              parent: { type: "string" },
            },
            required: ["title", "body", "recommended"],
          },
        },
      },
      run: ({ questions }) => {
        if (!Array.isArray(questions) || !questions.length) throw new Error("Give at least one question.");
        const ids = update((g) => {
          const round = Math.max(0, ...g.questions.map((q) => q.round)) + 1;
          let n = g.questions.length;
          return questions.map((q) => {
            const parent = q.parent && g.questions.some((p) => p.id === q.parent) ? q.parent : null;
            const id = `Q${++n}`;
            g.questions.push({
              id,
              round,
              parent,
              title: String(q.title),
              body: String(q.body ?? ""),
              recommended: String(q.recommended ?? ""),
              options: Array.isArray(q.options) ? q.options.map(String) : [],
              answer: null,
              decision: null,
            });
            return id;
          });
        });
        return `On the screen as ${ids.join(", ")}. Wait for the user's answers.`;
      },
    },
    settle: {
      description: "Record the decision the user's answer to a question makes, in one plain sentence in the user's terms.",
      input: { id: "string", decision: "string" },
      run: ({ id, decision }) => {
        update((g) => {
          const q = g.questions.find((q) => q.id === id);
          if (!q) throw new Error(`There is no question ${id}. Call get_grill to see the ids.`);
          q.decision = String(decision);
        });
        return `${id} is settled.`;
      },
    },
    finish: {
      description: "The frontier is empty: show the shared understanding (Markdown) for the user to confirm.",
      input: { summary: "string" },
      run: ({ summary }) => {
        update((g) => {
          g.summary = String(summary);
          g.confirmed = false;
        });
        return "On the screen. Wait for the user to confirm before acting on it.";
      },
    },
  },
});

function parse(text) {
  try {
    return { ...empty(), ...JSON.parse(text) };
  } catch {
    return empty();
  }
}

const grill = () => parse(sf.files.read(GRILL).text);

/** change grill.json on top of the version just read: if the page wrote it meanwhile, write() throws */
function update(change) {
  const { text, hash } = sf.files.read(GRILL);
  const g = parse(text);
  const result = change(g);
  sf.files.write(GRILL, JSON.stringify(g, null, 2) + "\n", { baseHash: hash });
  return result;
}

const { url } = await sf.listen({ port: Number(process.env.PORT ?? 4330) });
console.log(`Grill Me is running at ${url}`);
