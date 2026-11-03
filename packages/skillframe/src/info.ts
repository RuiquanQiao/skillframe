// What each agent says about itself, for the sidebar's pickers and its usage panel: models (each
// with the effort levels it supports), slash commands and skills, the account's plan, and the plan's
// usage limits. Asked from the agent's own machine interface without a model call, so it costs
// nothing:
//   Claude Code  the `initialize` control request on its stream-json channel (what its SDK asks)
//   Codex        `codex app-server`: account/read, model/list, account/rateLimits/read
//   ACP agents   report models and modes when a session opens (drivers/acp.ts calls runner.learn)
// The last answer is kept in <dataDir>/agents/<id>.json, so the pickers are right at once on the
// next start while a fresh answer is asked for in the background.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { kill, start, type Command } from "./spawn.js";

export interface ModelInfo {
  /** what goes to the agent (`--model`, Codex's `model`) */
  id: string;
  name: string;
  desc?: string;
  /** effort levels it supports, weakest first; empty: it has none */
  efforts: string[];
  /** listed under "More models" */
  more?: boolean;
}

export interface UsageWindow {
  /** 0..1 of the window used */
  utilization: number;
  /** Unix seconds */
  resetsAt?: number;
  /** the window's length */
  minutes?: number;
}

/** a plan's usage limits: `five_hour`, `seven_day`, or `m<minutes>` for other windows */
export interface Limits {
  windows: Record<string, UsageWindow>;
  /** "allowed", "allowed_warning", "rejected" */
  status?: string;
  at: number;
}

export interface SlashCommand {
  name: string;
  desc: string;
  hint: string;
}

export interface AgentInfo {
  models: ModelInfo[];
  /** the model a chat gets with none picked */
  defaultModel?: string;
  modes: { id: string; name: string; desc?: string }[];
  commands: SlashCommand[];
  account?: { email?: string; plan?: string };
  limits?: Limits;
  /** what the agent itself said about its sign-in, when it said anything */
  signedIn?: boolean;
}

type Obj = Record<string, any>;
const now = () => Date.now() / 1000;
const DESC_CAP = 220;

/** Claude Code's `initialize` answer, in the sidebar's shape. */
export function claudeInfo(raw: Obj): Partial<AgentInfo> {
  const models: ModelInfo[] = [];
  let defaultModel: string | undefined;
  for (const m of (raw.models ?? []) as Obj[]) {
    const efforts: string[] = m.supportedEffortLevels ?? [];
    if (m.value === "default") {
      // "Sonnet 5.5 · Efficient for routine tasks": the name is what "default" stands for today
      defaultModel = String(m.description ?? "").split(" · ")[0] || undefined;
      continue;
    }
    // aliases (opus, sonnet) follow the newest model; full ids pin an older one
    const alias = /^[a-z]+$/.test(m.value);
    models.push({ id: m.value, name: m.displayName ?? m.value, desc: m.description || undefined, efforts, ...(alias ? {} : { more: true }) });
  }
  const commands = ((raw.commands ?? []) as Obj[]).map((c) => {
    const desc = String(c.description ?? "").replace(/\s\((user|project|plugin|bundled|managed)\)$/, "");
    return { name: String(c.name), desc: desc.length > DESC_CAP ? desc.slice(0, DESC_CAP - 1) + "…" : desc, hint: String(c.argumentHint ?? "") };
  });
  const acct = raw.account ?? {};
  return {
    models,
    defaultModel,
    commands,
    account: { email: acct.email || undefined, plan: acct.subscriptionType || undefined },
    signedIn: acct.email || acct.apiProvider ? true : undefined,
  };
}

/** Codex's usage windows in the same shape as Claude Code's. */
export function codexLimits(rl: Obj): Limits {
  const windows: Record<string, UsageWindow> = {};
  for (const slot of ["primary", "secondary"]) {
    const w = rl?.[slot];
    if (!w || w.usedPercent === undefined || w.usedPercent === null) continue;
    const minutes = Number(w.windowDurationMins ?? 0);
    const key = minutes === 300 ? "five_hour" : minutes === 10080 ? "seven_day" : `m${minutes}`;
    windows[key] = { utilization: Number(w.usedPercent) / 100, resetsAt: w.resetsAt ?? undefined, minutes };
  }
  return { windows, status: rl?.rateLimitReachedType ? "rejected" : "allowed", at: now() };
}

/** Claude Code's `rate_limit_event`, in the same shape. */
export function claudeLimits(info: Obj): Limits {
  const windows: Record<string, UsageWindow> = {};
  for (const [key, w] of Object.entries((info?.unifiedWindows ?? {}) as Obj)) {
    if (w && typeof w.utilization === "number") windows[key] = { utilization: w.utilization, resetsAt: w.resetsAt ?? undefined };
  }
  return { windows, status: info?.status, at: now() };
}

/** Codex's answers, in the sidebar's shape. */
export function codexInfo(answers: Obj): Partial<AgentInfo> {
  const acct = answers["account/read"] ?? {};
  const account = acct.account ?? {};
  const list = ((answers["model/list"]?.data ?? []) as Obj[]).filter((m) => !m.hidden);
  const def = list.find((m) => m.isDefault);
  const models = list.map((m) => ({
    id: String(m.id ?? m.model),
    name: String(m.displayName ?? m.id),
    desc: m.description || undefined,
    efforts: ((m.supportedReasoningEfforts ?? []) as Obj[]).map((e) => e.reasoningEffort).filter(Boolean),
  }));
  const rl = answers["account/rateLimits/read"]?.rateLimits;
  return {
    models,
    defaultModel: def ? String(def.displayName ?? def.id) : undefined,
    account: { email: account.email || undefined, plan: account.planType || undefined },
    signedIn: account.type || acct.requiresOpenaiAuth === false ? true : acct.requiresOpenaiAuth ? false : undefined,
    ...(rl ? { limits: codexLimits(rl) } : {}),
  };
}

/** One short-lived agent process: write lines, read JSON lines until `done` returns a value. */
function converse<T>(cmd: Command, args: string[], o: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }, open: (write: (m: Obj) => void) => void, onLine: (msg: Obj, write: (m: Obj) => void) => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof start>;
    try {
      proc = start(cmd, args, { cwd: o.cwd, env: o.env, stdio: ["pipe", "pipe", "ignore"] });
    } catch (e) {
      return reject(e);
    }
    let settled = false;
    const end = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.stdin?.end();
      kill(proc);
      fn();
    };
    const timer = setTimeout(() => end(() => reject(new Error("The agent didn't answer in time"))), o.timeoutMs);
    proc.on("error", (e) => end(() => reject(e)));
    proc.on("close", () => end(() => reject(new Error("The agent ended without answering"))));
    proc.stdin?.on("error", () => {});
    const write = (m: Obj) => proc.stdin?.write(JSON.stringify(m) + "\n");
    createInterface({ input: proc.stdout! }).on("line", (line) => {
      let msg: Obj;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      try {
        const out = onLine(msg, write);
        if (out !== undefined) end(() => resolve(out));
      } catch (e) {
        end(() => reject(e));
      }
    });
    open(write);
  });
}

export function probeClaude(cmd: Command, o: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<Partial<AgentInfo>> {
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"];
  return converse(cmd, args, { ...o, timeoutMs: o.timeoutMs ?? 20_000 },
    (write) => write({ type: "control_request", request_id: "sf-init", request: { subtype: "initialize" } }),
    (msg) => {
      const r = msg.response;
      if (msg.type !== "control_response" || r?.request_id !== "sf-init") return undefined;
      if (r.subtype !== "success") throw new Error(r.error || "Claude Code refused initialize");
      return claudeInfo(r.response ?? {});
    });
}

export function probeCodex(cmd: Command, o: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<Partial<AgentInfo>> {
  // asked one after another; an error answer to anything but initialize leaves that part empty
  const steps: [string, Obj | undefined][] = [["account/read", {}], ["model/list", {}], ["account/rateLimits/read", undefined]];
  const answers: Obj = {};
  let n = 1;
  return converse(cmd, ["app-server"], { ...o, timeoutMs: o.timeoutMs ?? 20_000 },
    (write) => write({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "skillframe", version: "0" } } }),
    (msg, write) => {
      if (msg.id !== n || "method" in msg) return undefined;
      if (n === 1) {
        if (msg.error) throw new Error(msg.error.message ?? "Codex refused initialize");
        write({ jsonrpc: "2.0", method: "initialized" });
      } else answers[steps[n - 2][0]] = msg.result;
      if (n - 1 >= steps.length) return codexInfo(answers);
      const [method, params] = steps[n - 1];
      n++;
      write({ jsonrpc: "2.0", id: n, method, ...(params ? { params } : {}) });
      return undefined;
    });
}

/** Kept per agent: the last answer (memory and disk) and the one being asked. */
export class InfoCache {
  private data = new Map<string, { info: Partial<AgentInfo>; at: number }>();
  private asking = new Map<string, Promise<void>>();

  constructor(private dir: string) {}

  get(id: string): Partial<AgentInfo> | undefined {
    let hit = this.data.get(id);
    if (!hit) {
      try {
        hit = JSON.parse(readFileSync(path.join(this.dir, `${id}.json`), "utf8"));
        if (hit) this.data.set(id, hit);
      } catch {
        /* never asked yet */
      }
    }
    return hit?.info;
  }

  age(id: string): number {
    this.get(id);
    const hit = this.data.get(id);
    return hit ? now() - hit.at : Infinity;
  }

  set(id: string, info: Partial<AgentInfo>): void {
    const merged = { ...this.get(id), ...info };
    this.data.set(id, { info: merged, at: now() });
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(path.join(this.dir, `${id}.json`), JSON.stringify(this.data.get(id)), "utf8");
    } catch {
      /* kept in memory */
    }
  }

  /** ask the agent once at a time; a failure keeps the last answer */
  refresh(id: string, ask: () => Promise<Partial<AgentInfo>>): Promise<void> {
    let p = this.asking.get(id);
    if (!p) {
      p = ask().then((info) => this.set(id, info), () => {}).finally(() => this.asking.delete(id));
      this.asking.set(id, p);
    }
    return p;
  }
}
