// Stands in for the Edge window scripts/window.mjs opens: loads the --app address once, writes
// "<status> <address>" as a line to FAKE_WINDOW_LOG, holds the page's event stream open
// FAKE_WINDOW_MS (as the sidebar does), then closes.
// FAKE_WINDOW_HANDOFF=1 behaves like Edge with Startup boost: the process that was started hands
// the window to another one and ends at once, while the window stays open.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.FAKE_WINDOW_HANDOFF === "1") {
  spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, FAKE_WINDOW_HANDOFF: "0" },
    stdio: "ignore",
    detached: true,
  }).unref();
  process.exit(0);
}

const url = process.argv.find((a) => a.startsWith("--app="))?.slice(6);
let status = "error";
try { status = String((await fetch(url)).status); } catch {}
appendFileSync(process.env.FAKE_WINDOW_LOG, `${status} ${url}\n`);
const page = new AbortController();
fetch(url + "sf/events", { signal: page.signal }).then((r) => r.body?.pipeTo(new WritableStream())).catch(() => {});
setTimeout(() => { page.abort(); process.exit(0); }, Number(process.env.FAKE_WINDOW_MS ?? 0));
