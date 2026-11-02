// Blank: skillframe's sidebar next to an empty main area, and nothing else. No tools, no shared
// files, no context: what you see in the sidebar is skillframe itself, so this is the place to
// try it out and look for its own problems.
//
//   npm run blank        (from the repository root)
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
// APP_HOME puts the data somewhere else (the tests use it)
const home = process.env.APP_HOME ?? here;
const workspace = path.join(home, "workspace");
mkdirSync(workspace, { recursive: true });

const sf = createSkillframe({
  appName: "skillframe",
  workspace,
  dataDir: path.join(home, ".data"),
  static: path.join(here, "public"),
});

const { url } = await sf.listen({ port: Number(process.env.PORT ?? 4340) });
console.log(`skillframe is running at ${url}`);
