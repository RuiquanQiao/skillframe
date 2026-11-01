// The coding agents a chat can run on, as the user has them installed and signed in.
//
// skillframe never signs anyone in and never reads a credential: each agent is the user's own,
// unmodified command line tool, started the way its own SDK or editor integration starts it,
// with the login that tool keeps for itself.
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
}

export const AGENTS: AgentDef[] = [
  {
    id: "claude",
    name: "Claude Code",
    exe: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    login: "Open a terminal, run `claude`, type `/login` and finish signing in in the browser.",
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
    install: a.install,
    login: a.login,
  }));
}
