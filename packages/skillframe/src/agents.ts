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
  /** the command that installs it */
  install: string;
  /** how to sign in, for the user (markdown) */
  login: string;
  /** whether it looks signed in, from where the tool keeps its own login; absent: can't tell without asking it */
  signedIn?: (env: NodeJS.ProcessEnv) => boolean;
}

export const AGENTS: AgentDef[] = [
  {
    id: "claude",
    name: "Claude Code",
    exe: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    login: "Open a terminal, run `claude`, type `/login` and finish signing in in the browser.",
  },
  {
    id: "codex",
    name: "Codex",
    exe: "codex",
    install: "npm install -g @openai/codex",
    login: "Open a terminal and run `codex login` (a ChatGPT account or an API key).",
    // the file Codex keeps its own login in; skillframe only checks it exists, never reads it
    signedIn: (env) => existsSync(path.join(env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "auth.json")) || !!(env.OPENAI_API_KEY || env.CODEX_API_KEY),
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
  return AGENTS.filter((a) => ids.includes(a.id)).map((a) => ({
    id: a.id,
    name: a.name,
    installed: agentCommand(a, env) !== null,
    signedIn: env[`SKILLFRAME_${a.id.toUpperCase()}_CMD`] ? true : a.signedIn ? a.signedIn(env) : null,
    install: a.install,
    login: a.login,
  }));
}
