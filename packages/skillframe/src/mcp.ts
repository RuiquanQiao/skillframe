// The host app's tools, offered to the agent as an MCP server (Model Context Protocol, the
// open tool protocol Claude Code, Codex and Qwen Code all speak).
//
// It is the smallest server the "Streamable HTTP" transport allows: stateless, one JSON-RPC
// POST in, one JSON reply out, no sessions and no server-to-client stream. Only the agent
// process we started knows the bearer token, so nothing else on the machine can call the tools.
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/** A tool's input: JSON Schema properties, or the shorthand { name: "string" | "number" | "boolean" }. */
export type ToolInput = Record<string, string | Record<string, unknown>>;

export interface ToolContext {
  /** the chat whose agent called the tool */
  chatId?: string;
}

export interface ToolSpec {
  description: string;
  input?: ToolInput;
  /** properties that may be left out (all others are required) */
  optional?: string[];
  run(args: Record<string, any>, ctx: ToolContext): unknown | Promise<unknown>;
}

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function schemaOf(spec: ToolSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(spec.input ?? {})) properties[name] = typeof t === "string" ? { type: t } : t;
  const optional = new Set(spec.optional ?? []);
  return { type: "object", properties, required: Object.keys(properties).filter((n) => !optional.has(n)) };
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return "Done.";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export class McpTools {
  readonly token = randomBytes(24).toString("hex");

  constructor(
    readonly name: string,
    readonly version: string,
    readonly tools: Record<string, ToolSpec>,
    private onCall?: (name: string, args: unknown, ctx: ToolContext) => void,
  ) {}

  /** The names Claude Code knows these tools by, to pre-approve them. */
  get allowRule(): string {
    return `mcp__${this.name}`;
  }

  /** The `--mcp-config` content for a chat's agent. */
  config(url: string, chatId: string): Record<string, unknown> {
    return {
      mcpServers: {
        [this.name]: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${this.token}`, "X-Skillframe-Chat": chatId },
        },
      },
    };
  }

  async handle(req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    const send = (status: number, payload?: unknown) => {
      res.writeHead(status, payload === undefined ? {} : { "Content-Type": "application/json" });
      res.end(payload === undefined ? undefined : JSON.stringify(payload));
    };
    if (req.headers.authorization !== `Bearer ${this.token}`) return send(401, { error: "unauthorized" });
    if (req.method !== "POST") return send(405, { error: "this server only takes POST" });
    let msg: unknown;
    try {
      msg = JSON.parse(body);
    } catch {
      return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const ctx: ToolContext = { chatId: String(req.headers["x-skillframe-chat"] ?? "") || undefined };
    const batch = Array.isArray(msg);
    const items: unknown[] = Array.isArray(msg) ? msg : [msg];
    const replies = (await Promise.all(items.map((m) => this.rpc(m, ctx)))).filter((r) => r !== null);
    if (replies.length === 0) return send(202); // only notifications
    send(200, batch ? replies : replies[0]);
  }

  private async rpc(m: any, ctx: ToolContext): Promise<unknown> {
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") {
      return { jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32600, message: "Invalid request" } };
    }
    if (m.id === undefined) return null; // a notification (notifications/initialized, cancelled…)
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    switch (m.method) {
      case "initialize": {
        const asked = m.params?.protocolVersion;
        return ok({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.name, version: this.version },
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({
          tools: Object.entries(this.tools).map(([name, spec]) => ({ name, description: spec.description, inputSchema: schemaOf(spec) })),
        });
      case "tools/call": {
        const name = m.params?.name;
        const spec = this.tools[name];
        if (!spec) return fail(-32602, `Unknown tool: ${name}`);
        const args = m.params?.arguments ?? {};
        this.onCall?.(name, args, ctx);
        try {
          return ok({ content: [{ type: "text", text: asText(await spec.run(args, ctx)) }] });
        } catch (e) {
          // a tool's failure goes back to the agent as a result it can read and react to
          return ok({ content: [{ type: "text", text: (e as Error).message || String(e) }], isError: true });
        }
      }
      default:
        return fail(-32601, `Method not found: ${m.method}`);
    }
  }
}
