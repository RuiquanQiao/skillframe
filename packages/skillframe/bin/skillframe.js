#!/usr/bin/env node
// npx skillframe eject [folder]
//
// Copies skillframe into your app (default folder: ./skillframe) so you can change its core and
// sidebar, then says which import to change.
import path from "node:path";
import { eject } from "./eject.js";

const [command, folder = "skillframe"] = process.argv.slice(2);
if (command !== "eject") {
  console.log("\n  npx skillframe eject [folder]   copy skillframe into your app, to change any of it\n");
  process.exit(command === undefined || command === "--help" || command === "-h" ? 0 : 1);
}

const dest = path.resolve(folder);
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
