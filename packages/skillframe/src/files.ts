// Integration channel ③: the files the agent and the host app both edit.
//
//   - watch: when a watched file changes on disk (the agent edited it, or anything else did),
//     every page gets a `file.changed` event and redraws;
//   - read / write with a version (`hash`): writing on top of a version that is no longer the
//     file's raises a Conflict instead of overwriting what the agent (or another tab) just wrote;
//   - every write by the app first keeps the old content under <dataDir>/history.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import path from "node:path";
import type { EventBus } from "./events.js";

export interface FileVersion {
  path: string;
  text: string;
  /** "" when the file does not exist */
  hash: string;
}

export class Conflict extends Error {
  constructor(readonly current: FileVersion) {
    super(`${current.path} changed since it was read`);
  }
}

export class OutsideWatch extends Error {}

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** A glob ("data/**\/*.json", "notes.json") as a RegExp over "/"-separated relative paths. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  const g = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      const slash = g[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, process.platform === "win32" ? "i" : "");
}

export class FileChannel {
  private known = new Map<string, string>(); // relative path -> last hash we saw or wrote
  private timers = new Map<string, NodeJS.Timeout>();
  private watcher?: FSWatcher;
  private patterns: RegExp[];

  constructor(
    readonly root: string,
    patterns: string[],
    private bus: EventBus,
    private historyDir: string,
    /** who most likely changed a file nobody in the app wrote: "agent" while a reply runs */
    private guessAuthor: () => "agent" | "outside",
  ) {
    this.patterns = patterns.map(globToRegExp);
  }

  /** the path relative to the root, "/"-separated; throws if it isn't one of the watched files */
  rel(p: string): string {
    const abs = path.resolve(this.root, p);
    const rel = path.relative(this.root, abs).split(path.sep).join("/");
    if (!rel || rel.startsWith("../") || path.isAbsolute(rel) || !this.watches(rel)) {
      throw new OutsideWatch(`${p} is not one of the files this app shares with the agent`);
    }
    return rel;
  }

  watches(rel: string): boolean {
    return this.patterns.some((re) => re.test(rel));
  }

  start(): void {
    if (this.watcher || !this.patterns.length) return;
    mkdirSync(this.root, { recursive: true });
    this.watcher = watch(this.root, { recursive: true }, (_event, name) => {
      if (!name) return;
      const rel = String(name).split(path.sep).join("/");
      if (!this.watches(rel)) return;
      // editors and agents often write in several steps: settle first
      clearTimeout(this.timers.get(rel));
      this.timers.set(rel, setTimeout(() => this.check(rel), 120));
    });
    this.watcher.on("error", () => {}); // a deleted root etc.: stop quietly rather than crash the app
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.timers.forEach(clearTimeout);
  }

  private check(rel: string): void {
    this.timers.delete(rel);
    const { hash } = this.load(rel);
    if (this.known.get(rel) === hash) return; // our own write, or touched without a change
    this.known.set(rel, hash);
    this.bus.publish("file.changed", { path: rel, hash, by: this.guessAuthor() });
  }

  private load(rel: string): FileVersion {
    const abs = path.join(this.root, rel);
    if (!existsSync(abs)) return { path: rel, text: "", hash: "" };
    const text = readFileSync(abs, "utf8");
    return { path: rel, text, hash: hashOf(text) };
  }

  read(p: string): FileVersion {
    const v = this.load(this.rel(p));
    this.known.set(v.path, v.hash);
    return v;
  }

  /**
   * Write a watched file. With `baseHash` (the version it was read at, "" for "must not exist
   * yet"), a newer version on disk raises Conflict carrying it, and nothing is written.
   */
  write(p: string, text: string, opts: { baseHash?: string } = {}): FileVersion {
    const rel = this.rel(p);
    const current = this.load(rel);
    if (opts.baseHash !== undefined && opts.baseHash !== current.hash) throw new Conflict(current);
    if (current.hash === hashOf(text)) return current;
    const abs = path.join(this.root, rel);
    if (current.hash) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const keep = path.join(this.historyDir, `${rel}.${stamp}`);
      mkdirSync(path.dirname(keep), { recursive: true });
      writeFileSync(keep, current.text, "utf8");
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${process.pid}.tmp`;
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, abs);
    const v = { path: rel, text, hash: hashOf(text) };
    this.known.set(rel, v.hash);
    this.bus.publish("file.changed", { path: rel, hash: v.hash, by: "app" });
    return v;
  }
}
