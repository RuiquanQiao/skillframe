// `npm test`: every test file, one summary line, and only the failures in full.
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { run } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// the test files run side by side, so their scratch folders are cleared once, here, before any starts
rmSync(path.resolve(here, "../../.cache/test"), { recursive: true, force: true });

const files = readdirSync(here).filter((f) => f.endsWith(".test.js")).map((f) => path.join(here, f));

let passed = 0;
const failed: string[] = [];
const started = Date.now();

const stream = run({ files, concurrency: true, timeout: 120_000 });
stream.on("test:pass", (d) => {
  if (d.details.type !== "suite") passed++;
});
stream.on("test:fail", (d) => {
  if (d.details.type === "suite") return;
  const err = d.details.error as Error & { cause?: Error };
  const cause = err.cause ?? err;
  failed.push(`✗ ${d.name}\n    ${String(cause?.message ?? cause).split("\n").join("\n    ")}`);
});
stream.on("test:diagnostic", () => {});
stream.on("end", () => {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (failed.length) console.log(failed.join("\n"));
  console.log(`${failed.length ? "FAIL" : "ok"}: ${passed} passed, ${failed.length} failed (${secs}s)`);
  process.exitCode = failed.length ? 1 : 0;
});
// keep the stream flowing (its own TAP output is not printed)
stream.resume();
