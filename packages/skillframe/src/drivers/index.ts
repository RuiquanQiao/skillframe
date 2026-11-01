import { ClaudeDriver } from "./claude.js";
import { CodexDriver } from "./codex.js";
import type { Driver } from "./driver.js";

export function driverFor(agentId: string): Driver {
  switch (agentId) {
    case "claude":
      return new ClaudeDriver();
    case "codex":
      return new CodexDriver();
    default:
      throw new Error(`no driver for agent ${agentId}`);
  }
}
