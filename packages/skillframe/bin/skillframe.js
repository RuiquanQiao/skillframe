#!/usr/bin/env node
// npx skillframe serve [skillframe.json] [--port N] [--app http://127.0.0.1:N] [--workspace DIR] [--data-dir DIR] [--parent PID]
//   skillframe for an app in any language: see src/serve.ts for the file it reads
// npx skillframe eject [folder]
//   copies skillframe into your app (default folder: ./skillframe) so you can change its core and
//   sidebar, then says which import to change.
import path from "node:path";
import { eject } from "./eject.js";

const [command, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = rest.splice(i, 2);
  return value;
};

if (command === "serve") {
  const port = flag("--port");
  const parent = flag("--parent");
  const app = flag("--app");
  const workspace = flag("--workspace");
  const dataDir = flag("--data-dir");
  const file = path.resolve(rest[0] ?? "skillframe.json");
  const { serve } = await import("../dist/src/serve.js");
  try {
    const { url } = await serve(file, { port: port === undefined ? undefined : Number(port), parent: parent ? Number(parent) : undefined, app, workspace, dataDir });
    // the last line an app starting skillframe waits for
    console.log(`skillframe is running at ${url}`);
  } catch (e) {
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
} else if (command === "eject") {
  const dest = path.resolve(rest[0] ?? "skillframe");
  let version;
  try {
    version = eject(dest);
  } catch (e) {
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
  const rel = "./" + path.relative(process.cwd(), dest).split(path.sep).join("/");
  console.log(`
  Copied skillframe ${version} into ${dest}

  Next, in your server code:
    import { createSkillframe } from "skillframe";
  becomes
    import { createSkillframe } from "${rel}/index.js";

  (adjust the path if that file isn't in ${process.cwd()})
  Then you can remove skillframe from your package.json: npm uninstall skillframe
  ${rel}/README.md says which file does what.
`);
} else {
  console.log(`
  npx skillframe serve [skillframe.json]   the sidebar for an app in any language (Python, Go, Rust…)
  npx skillframe eject [folder]            copy skillframe into your app, to change any of it
`);
  process.exit(command === undefined || command === "--help" || command === "-h" ? 0 : 1);
}
