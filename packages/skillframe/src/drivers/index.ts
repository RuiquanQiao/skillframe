import { ClaudeDriver } from "./claude.js";
import type { Driver } from "./driver.js";

export function driverFor(agentId: string): Driver {
  switch (agentId) {
    case "claude":
      return new ClaudeDriver();
    default:
      throw new Error(`no driver for agent ${agentId}`);
  }
}
