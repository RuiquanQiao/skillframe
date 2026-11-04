// Copies skillframe into an app so the app's developer can change any of it: the core (the
// JavaScript npm ships, built from src/), the sidebar, and the MCP bridge. The copy runs as it is;
// the app imports it by path instead of from node_modules, and stops getting updates from npm.
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Copies skillframe into `dest` (a new or empty folder). Returns the version copied. */
export function eject(dest) {
  const core = path.join(PKG, "dist", "src");
  if (!existsSync(path.join(core, "index.js"))) throw new Error(`skillframe isn't built: ${core} has no index.js`);
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} already exists and isn't empty`);
  const { version } = JSON.parse(readFileSync(path.join(PKG, "package.json"), "utf8"));

  // .d.ts and .map files describe src/ as it was; they'd be wrong after the first edit
  cpSync(core, path.join(dest, "core"), { recursive: true, filter: (p) => !/\.(d\.ts|map)$/.test(p) });
  cpSync(path.join(PKG, "ui"), path.join(dest, "ui"), { recursive: true });
  cpSync(path.join(PKG, "bin", "mcp-bridge.js"), path.join(dest, "bin", "mcp-bridge.js"));
  cpSync(path.join(PKG, "LICENSE"), path.join(dest, "LICENSE"));
  // its own package.json, so the copy is ES modules even inside an app that isn't
  writeFileSync(path.join(dest, "package.json"), JSON.stringify({ private: true, type: "module", description: `skillframe ${version}, copied into this app` }, null, 2) + "\n");
  writeFileSync(path.join(dest, "index.js"), 'export * from "./core/index.js";\n');
  writeFileSync(path.join(dest, "README.md"), readme(version));
  return version;
}

const readme = (version) => `# skillframe (your copy)

Copied from skillframe ${version} by \`npx skillframe eject\`. This folder is now part of your app:
change any file. Your app imports it by path (\`./skillframe/index.js\`), so \`npm update\` no longer
touches it. To see what changed upstream since, read the
[changelog](https://github.com/RuiquanQiao/skillframe/blob/main/CHANGELOG.md).

| File | What it does | Change it to |
|---|---|---|
| \`ui/skillframe-chat.js\` | The whole sidebar: one Web Component, styles in its shadow root | change how the sidebar looks or behaves |
| \`ui/skillframe-titlebar.js\` | The title bar: the app's logo and name, the settings, the window's buttons | change the header or what the settings offer |
| \`ui/skillframe-prefs.js\` | The user's language and theme, shared by the sidebar and the title bar | add a language or a setting |
| \`core/index.js\` | \`createSkillframe()\`: options, \`listen()\`, \`handler()\`, \`send()\` | change the server API |
| \`core/http.js\` | The routes the sidebar calls under \`/sf\`, and the local-only checks | add a route; change who may call it |
| \`core/chat/runner.js\` | One agent process per reply, its output turned into blocks, the queue | change how replies run |
| \`core/chat/store.js\` | Chats saved in \`dataDir\` | store chats elsewhere |
| \`core/drivers/claude.js\`, \`codex.js\`, \`acp.js\` | How each agent is started and spoken to | change an agent's flags, or add an agent |
| \`core/agents.js\` | The list of agents, their commands and install hints | add or remove agents |
| \`core/mcp.js\` | Your \`tools\`, served to the agent as an MCP server | change how tools are described or called |
| \`core/files.js\` | Watched shared files, versions (\`hash\`), \`Conflict\` | change the conflict rules |
| \`core/spawn.js\` | Finding and starting the agent's command on each system | |
| \`bin/mcp-bridge.js\` | stdio-to-HTTP bridge for agents that can't call an HTTP MCP server | |

Keep \`ui/\` and \`bin/\` next to \`core/\`: the core finds them by looking upward from its own folder
for \`ui/skillframe-chat.js\`.

The core is the JavaScript npm ships, built from TypeScript. The TypeScript of this version is in
the npm package's \`src/\` folder (\`npm pack skillframe@${version}\`), if you'd rather keep your copy
in TypeScript.
`;
