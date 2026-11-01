import type { AgentDef } from "../agents.js";
import { AcpDriver } from "./acp.js";
import { ClaudeDriver } from "./claude.js";
import { CodexDriver } from "./codex.js";
import type { Driver } from "./driver.js";

export function driverFor(def: AgentDef): Driver {
  switch (def.protocol) {
    case "claude":
      return new ClaudeDriver();
    case "codex":
      return new CodexDriver();
    case "acp":
      return new AcpDriver(def.args ?? []);
  }
}
