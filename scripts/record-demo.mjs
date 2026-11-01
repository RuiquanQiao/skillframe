// Records the 60-second demo (docs/DEMO.md) against the real agents on this computer.
//
//   node scripts/record-demo.mjs <app made by create-skillframe, installed> <output folder>
//
// It starts the app with its data in <output>/home, plays the shot list in headless Chrome with a
// video running, and notes when each shot starts and ends. Then ffmpeg keeps only the shots, plays
// the waits for the agent faster (labelled on screen), and writes <output>/skillframe-demo.mp4.
// Every reply in the video is the agent's real one; it uses a few messages of the user's plan.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { resolveCommand } from "../packages/skillframe/dist/src/spawn.js";

const [appDir, outDir] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!appDir || !outDir) {
  console.error("usage: node scripts/record-demo.mjs <app folder> <output folder>");
  process.exit(1);
}
const home = path.join(outDir, "home");
const rawDir = path.join(outDir, "raw");
rmSync(home, { recursive: true, force: true });
rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

// ---- the app ---------------------------------------------------------------------------------
// Claude Code with only the app's MCP server: the recording machine's own servers (and their
// sign-in notices) stay out of the video
const claude = resolveCommand("claude", "claude");
const env = { ...process.env, PORT: "0", APP_HOME: home };
if (claude) env.SKILLFRAME_CLAUDE_CMD = JSON.stringify([claude.file, ...claude.args, "--strict-mcp-config"]);
const server = spawn(process.execPath, ["server.js"], { cwd: appDir, env });
const url = await new Promise((resolve, reject) => {
  let out = "";
  server.stdout.on("data", (d) => {
    out += d;
    const m = out.match(/running at (http:\/\/\S+?)\/?\s/);
    if (m) resolve(m[1]);
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  server.on("exit", (code) => reject(new Error(`the app exited (${code}): ${out}`)));
});

// ---- the camera --------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  // the page at 150%, so the sidebar's text reads on a phone; scaled to 1920×1080 at the end
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  locale: "en-US",
  colorScheme: "light",
  recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.setDefaultTimeout(240_000);
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const shots = []; // { start, end, wait } in seconds of the raw video
let open = null;
const shot = (wait = false) => {
  if (open) open.end = now();
  open = { start: now(), wait };
  shots.push(open);
};
const cut = () => {
  if (open) open.end = now();
  open = null;
};
const hold = (s) => page.waitForTimeout(s * 1000);

const FONT = `'Segoe UI', system-ui, sans-serif`; // single quotes: it goes inside style="…"
const card = (html) =>
  page.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:600 44px/1.35 ${FONT};text-align:center"><div>${html}</div></body>`);

/** a caption over the app side of the page, out of the sidebar's way */
const caption = (text) =>
  page.evaluate((text) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.style.cssText = `position:fixed;left:380px;right:0;bottom:48px;display:flex;justify-content:center;pointer-events:none;z-index:9`;
      document.body.append(el);
    }
    el.innerHTML = `<span style="background:rgba(0,0,0,.82);color:#fff;font:600 24px/1.4 'Segoe UI',system-ui,sans-serif;padding:10px 20px;border-radius:8px;max-width:80%;text-align:center">${text}</span>`;
  }, text);

const sidebar = page.locator("skillframe-chat");
const idle = () => sidebar.locator("button.send", { hasText: "Send" }).waitFor();
async function say(text) {
  const box = sidebar.locator("textarea");
  await box.click();
  await box.pressSequentially(text, { delay: 45 });
  await hold(0.4);
  await box.press("Enter");
  await sidebar.locator("button.send", { hasText: "Stop" }).waitFor();
}
const todoCount = (n) => page.waitForFunction((n) => document.querySelectorAll("#todos li").length >= n, n);

try {
  // the first frames can come at the wrong size: let the capture settle on a black page, unused
  await page.setContent(`<body style="margin:0;background:#000"></body>`);
  await hold(2);

  // 0–5 s: the promise
  await card(`Your app. Your users' own Claude Code.<br><span style="color:#9aa">No API key.</span>`);
  shot();
  await hold(4.5);
  cut();

  // 5–15 s: making an app
  await page.setContent(terminalPage());
  shot();
  await page.waitForFunction(() => window.done === true);
  await hold(1.5);
  cut();

  // 15–30 s: left side talks, right side changes
  await page.goto(url + "/");
  await sidebar.locator("textarea").waitFor();
  await page.locator("#todos li").first().waitFor();
  await caption("The sidebar runs the agent already on the user's computer, signed in with their own plan.");
  shot();
  await hold(1.5);
  await say("add todos for a trip to Tokyo: passport, yen, JR pass");
  shot(true);
  await todoCount(4);
  await idle();
  shot();
  await hold(3);

  // 30–40 s: it sees what you see
  await caption("It sees what you see.");
  await hold(0.8);
  await page.locator("#todos li", { hasText: /passport/i }).locator("input").click();
  await hold(1.2);
  await say("what's left?");
  shot(true);
  await idle();
  shot();
  await hold(4);
  cut();

  // 40–50 s: the code
  await page.setContent(codePage());
  shot();
  await hold(7);
  cut();

  // 50–55 s: another agent
  await page.goto(url + "/");
  await sidebar.locator("textarea").waitFor();
  await page.locator("#todos li").first().waitFor();
  await caption("Claude Code, Codex, or any ACP agent.");
  shot();
  await hold(1);
  await sidebar.locator("select.pick").selectOption("codex");
  await sidebar.locator("textarea[placeholder='Message Codex…']").waitFor();
  await hold(1);
  await say("add: buy an umbrella");
  shot(true);
  await page.locator("#todos li", { hasText: /umbrella/i }).waitFor();
  await idle();
  shot();
  await hold(2.5);
  cut();

  // 55–60 s: where to get it
  await card(`skillframe<div style="font:500 30px/1.6 ${FONT};margin-top:18px;color:#ccd"><code style="font-family:Consolas,monospace">npm create skillframe</code><br>github.com/RuiquanQiao/skillframe &nbsp;·&nbsp; MIT</div>`);
  shot();
  await hold(4);
  cut();
} finally {
  await context.close(); // writes the video
  await browser.close();
  server.kill();
}

writeFileSync(path.join(outDir, "shots.json"), JSON.stringify(shots, null, 2));
const raw = path.join(rawDir, readdirSync(rawDir).find((f) => f.endsWith(".webm")));

// ---- the edit ------------------------------------------------------------------------------------
// each shot trimmed out of the raw video; a wait is played at the speed that makes it ~2.5 s
const parts = shots.map((s, i) => {
  const speed = s.wait ? Math.max(2, (s.end - s.start) / 2.5) : 1;
  let f = `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=(PTS-STARTPTS)/${speed.toFixed(3)}`;
  if (s.wait) {
    f += `,drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='Sped up ${Math.round(speed)}×':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=10:x=w-tw-28:y=24`;
  }
  return `${f},fps=30,scale=1920:1080:flags=lanczos[v${i}]`;
});
const filter = `${parts.join(";")};${shots.map((_, i) => `[v${i}]`).join("")}concat=n=${shots.length}:v=1:a=0[out]`;
const mp4 = path.join(outDir, "skillframe-demo.mp4");
const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { encoding: "utf8" });
if (ff.status !== 0) throw new Error(ff.stderr);
const total = shots.reduce((t, s) => t + (s.end - s.start) / (s.wait ? Math.max(2, (s.end - s.start) / 2.5) : 1), 0);
console.log(`${mp4} (${total.toFixed(1)} s)`);

// ---- the pages that aren't the app ------------------------------------------------------------
function terminalPage() {
  // what create-skillframe and the app print, typed out
  const steps = [
    ["cmd", "npm create skillframe my-app"],
    ["out", "  Created My App in ~/my-app\n\n  Next:\n    cd my-app\n    npm install\n    npm start\n\n  Agents on this computer: Claude Code, Codex."],
    ["cmd", "cd my-app && npm install"],
    ["out", "added 1 package in 2s"],
    ["cmd", "npm start"],
    ["out", "My App is running at http://localhost:4320/"],
  ];
  return `<body style="margin:0;height:100vh;background:#1e1f22;color:#dfe1e5;font:20px/1.45 Consolas,'Cascadia Mono',monospace;padding:40px 64px;box-sizing:border-box">
<pre id="t" style="margin:0;white-space:pre-wrap;font:inherit"></pre>
<div style="position:fixed;left:0;right:0;bottom:56px;text-align:center"><span style="background:#fff;color:#000;font:600 26px/1.4 ${FONT};padding:10px 20px;border-radius:8px">Create, install, start.</span></div>
<script>
const steps = ${JSON.stringify(steps)};
const t = document.getElementById("t");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await wait(400);
  for (const [kind, text] of steps) {
    if (kind === "cmd") {
      t.append(Object.assign(document.createElement("span"), { textContent: "$ ", style: "color:#7ec27e" }));
      for (const ch of text) { t.append(ch); await wait(55); }
      await wait(350);
      t.append("\\n");
    } else {
      await wait(250);
      t.append(Object.assign(document.createElement("span"), { textContent: text + "\\n\\n", style: "color:#a9b0ba" }));
      await wait(700);
    }
  }
  window.done = true;
})();
</script></body>`;
}

function codePage() {
  const code = `const sf = createSkillframe({
  appName: "My App",
  workspace,

  // what the user is looking at, told to the agent with every message
  context: ({ screen }) => \`todos.json holds the user's todos; \${open()} are open.\`,

  // the app's own abilities, as tools the agent can call
  tools: {
    list_todos: {
      description: "List the user's todos.",
      run: () => todos(),
    },
    add_todo: {
      description: "Add a todo to the user's list.",
      input: { text: "string" },
      run: ({ text }) => addTodo(text),
    },
  },
});

await sf.listen();`;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // one pass, so no colour lands inside another's markup
  const html = esc(code).replace(/(\/\/.*)|("[^"\n]*"|`[^`]*`)|\b(const|await)\b|\b(context|tools)\b/g, (m, comment, str, kw, key) =>
    comment ? `<i style="color:#8a919c">${m}</i>`
      : str ? `<span style="color:#9fd18b">${m}</span>`
      : kw ? `<span style="color:#d6a8ff">${m}</span>`
      : `<b style="color:#ffd27a;font-weight:600">${m}</b>`);
  return `<body style="margin:0;height:100vh;background:#1e1f22;color:#dfe1e5;display:grid;justify-content:center;align-content:start;padding-top:24px;box-sizing:border-box">
<div><div style="font:600 18px ${FONT};color:#8a919c;margin-bottom:14px">server.js (shortened)</div>
<pre style="margin:0;font:18px/1.45 Consolas,'Cascadia Mono',monospace">${html}</pre></div>
<div style="position:fixed;left:0;right:0;bottom:20px;text-align:center"><span style="background:#fff;color:#000;font:600 24px/1.4 ${FONT};padding:8px 18px;border-radius:8px">Your app's abilities become the agent's tools.</span></div>
</body>`;
}
