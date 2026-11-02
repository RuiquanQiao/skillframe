#!/usr/bin/env node
// npm create skillframe <folder> [--eject] [--skillframe <version or path>]
//
// Copies a small working app (a todo list the user and their coding agent share) into a new
// folder, then says how to start it and which agents this computer has. With --eject, skillframe
// itself is copied into the app too (./skillframe), for a developer who wants to change its core
// or sidebar, instead of being installed from npm.
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eject } from "skillframe/eject";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "template");
const AGENTS = [
  { exe: "claude", name: "Claude Code", install: "npm install -g @anthropic-ai/claude-code", login: "run `claude`, then `/login`" },
  { exe: "codex", name: "Codex", install: "npm install -g @openai/codex", login: "run `codex login`" },
  { exe: "qwen", name: "Qwen Code", install: "npm install -g @qwen-code/qwen-code", login: "run `qwen`, then `/auth`" },
];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function onPath(exe) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      try {
        if (statSync(path.join(dir, exe + ext)).isFile()) return true;
      } catch {
        /* not here */
      }
    }
  }
  return false;
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const skillframe = flag("--skillframe") ?? "^0.1.0";
// Windows PowerShell 5.1 drops the `--` in `npm create skillframe my-app -- --eject`, so npm
// takes --eject as its own setting and hands it over as npm_config_eject instead
const ejecting = args.includes("--eject") || process.env.npm_config_eject === "true";
if (args.includes("--eject")) args.splice(args.indexOf("--eject"), 1);
if (args.includes("--help") || args.includes("-h")) {
  console.log("\n  npm create skillframe <folder> [-- --eject] [-- --skillframe <version or file:path>]\n");
  console.log("  --eject  copy skillframe's core and sidebar into the app (./skillframe) to change them\n");
  process.exit(0);
}
const target = args[0];
if (!target) fail("Say which folder to create: npm create skillframe my-app");

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) fail(`skillframe needs Node 22 or newer; this is Node ${process.versions.node}.`);

const dir = path.resolve(target);
const name = path.basename(dir).toLowerCase().replace(/[^a-z0-9-._~]/g, "-").replace(/^[-._]+/, "") || "skillframe-app";
if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} already exists and isn't empty. Pick a new folder name.`);

cpSync(TEMPLATE, dir, { recursive: true });
// npm leaves .gitignore out of published packages, so the template carries it as "gitignore"
renameSync(path.join(dir, "gitignore"), path.join(dir, ".gitignore"));
const title = name.split(/[-._]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
// a path dependency is written relative to the new app, so the folder can move with it
const dep = skillframe.startsWith("file:") ? `file:${path.relative(dir, path.resolve(skillframe.slice(5))).split(path.sep).join("/")}` : skillframe;
const own = ejecting
  ? "- `skillframe/`: skillframe's core and sidebar, copied into this app so you can change any of it.\n  `skillframe/README.md` says which file does what."
  : "- skillframe itself comes from npm. To change its core or sidebar, copy it into this app with\n  `npx skillframe eject`.";
for (const file of ["package.json", "server.js", "public/index.html", "README.md"]) {
  const p = path.join(dir, file);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("{{name}}", name).replaceAll("{{title}}", title).replaceAll("{{skillframe}}", dep).replaceAll("{{own}}", own));
}
if (ejecting) {
  eject(path.join(dir, "skillframe"));
  const server = path.join(dir, "server.js");
  writeFileSync(server, readFileSync(server, "utf8").replace('from "skillframe";', 'from "./skillframe/index.js";'));
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  delete pkg.dependencies.skillframe;
  if (!Object.keys(pkg.dependencies).length) delete pkg.dependencies;
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

const found = AGENTS.filter((a) => onPath(a.exe));
const rel = path.relative(process.cwd(), dir) || ".";
console.log(`
  Created ${title} in ${dir}

  Next:
    cd ${rel.includes(" ") ? `"${rel}"` : rel}
    npm install
    npm start
`);
if (found.length) {
  console.log(`  Agents on this computer: ${found.map((a) => a.name).join(", ")}. If one isn't signed in yet: ${found.map((a) => `${a.name}: ${a.login}`).join("; ")}.\n`);
} else {
  console.log("  No coding agent found on this computer. The sidebar needs one, signed in with the user's own account:");
  for (const a of AGENTS) console.log(`    ${a.name}: ${a.install}, then ${a.login}`);
  console.log("");
}
