// Stands in for the Edge window scripts/window.mjs opens: loads the --app address once, writes
// "<status> <address>" as a line to FAKE_WINDOW_LOG, stays open FAKE_WINDOW_MS, then closes.
import { appendFileSync } from "node:fs";

const url = process.argv.find((a) => a.startsWith("--app="))?.slice(6);
let status = "error";
try { status = String((await fetch(url)).status); } catch {}
appendFileSync(process.env.FAKE_WINDOW_LOG, `${status} ${url}\n`);
setTimeout(() => process.exit(0), Number(process.env.FAKE_WINDOW_MS ?? 0));
