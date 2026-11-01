// The coding agents a chat can run on, as the user has them installed and signed in.
//
// skillframe never signs anyone in and never reads a credential: each agent is the user's own,
// unmodified command line tool, started the way its own SDK or editor integration starts it,
// with the login that tool keeps for itself.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCommand, type Command } from "./spawn.js";

export interface AgentDef {
  id: string;
  /** "Claude Code": menus and messages */
  name: string;
  /** the command on PATH */
  exe: string;
  /** which driver speaks to it */
  protocol: "claude" | "codex" | "acp";
  /** what puts the command in its machine mode (ACP agents) */
  args?: string[];
  /** the command that installs it */
  install: string;
  /** how to sign in, for the user (markdown) */
  login: string;
  /** whether it looks signed in, from where the tool keeps its own login; absent: can't tell without asking it */
  signedIn?: (env: NodeJS.ProcessEnv) => boolean;
  /** a chat can branch from an earlier reply */
  fork: boolean;
  /** permission modes and models known without asking (ACP agents report theirs in the first chat) */
  modes: { id: string; name: string; desc?: string }[];
  models: { id: string; name: string; desc?: string }[];
}

const home = (env: NodeJS.ProcessEnv, variable: string, folder: string) => env[variable] ?? path.join(os.homedir(), folder);

export const AGENTS: AgentDef[] = [
  {
    id: "claude",
    name: "Claude Code",
    exe: "claude",
    protocol: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    login: "Open a terminal, run `claude`, type `/login` and finish signing in in the browser.",
    fork: true,
    modes: [
      { id: "default", name: "Ask before edits", desc: "Asks before editing files or running commands" },
      { id: "acceptEdits", name: "Accept edits", desc: "Edits files directly; still asks before risky commands" },
      { id: "plan", name: "Plan", desc: "Read-only; proposes a plan and acts once you approve" },
    ],
    // aliases Claude Code resolves to its current models
    models: [
      { id: "opus", name: "Opus" },
      { id: "sonnet", name: "Sonnet" },
      { id: "haiku", name: "Haiku" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    exe: "codex",
    protocol: "codex",
    install: "npm install -g @openai/codex",
    login: "Open a terminal and run `codex login` (a ChatGPT account or an API key).",
    // the file Codex keeps its own login in; skillframe only checks it exists, never reads it
    signedIn: (env) => existsSync(path.join(home(env, "CODEX_HOME", ".codex"), "auth.json")) || !!(env.OPENAI_API_KEY || env.CODEX_API_KEY),
    fork: true,
    modes: [
      { id: "default", name: "Ask before edits", desc: "Asks before running anything it doesn't trust" },
      { id: "acceptEdits", name: "Accept edits", desc: "Works in the folder; asks when it needs more" },
      { id: "plan", name: "Read only", desc: "Can look but not change anything" },
    ],
    models: [], // asked from `codex app-server` (model/list)
  },
  {
    id: "qwen",
    name: "Qwen Code",
    exe: "qwen",
    protocol: "acp",
    args: ["--acp"],
    install: "npm install -g @qwen-code/qwen-code",
    login: "Open a terminal, run `qwen` and pick how to sign in (`/auth`).",
    signedIn: (env) => existsSync(path.join(home(env, "QWEN_HOME", ".qwen"), "settings.json")) || existsSync(path.join(home(env, "QWEN_HOME", ".qwen"), "oauth_creds.json")),
    fork: false,
    modes: [],
    models: [],
  },
];

export const DEFAULT_AGENT = "claude";

export function agentDef(id: string | undefined): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS.find((a) => a.id === DEFAULT_AGENT)!;
}

export function agentCommand(def: AgentDef, env: NodeJS.ProcessEnv = process.env): Command | null {
  return resolveCommand(def.id, def.exe, env);
}

export function listAgents(ids: string[], env: NodeJS.ProcessEnv = process.env) {
  return ids
    .map((id) => AGENTS.find((a) => a.id === id))
    .filter((a): a is AgentDef => !!a)
    .map((a) => ({
      id: a.id,
      name: a.name,
      installed: agentCommand(a, env) !== null,
      signedIn: env[`SKILLFRAME_${a.id.toUpperCase()}_CMD`] ? true : a.signedIn ? a.signedIn(env) : null,
      install: a.install,
      login: a.login,
      fork: a.fork,
    }));
}
