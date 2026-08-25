import { AgentError } from "./errors";
import { assertSafeRemoteUrl, makeId, safeErrorMessage } from "./security";
import type { McpServerConfig, ToolDefinition, ToolResult } from "./types";

const PROTOCOL_VERSION = "2025-06-18";

// Fail-closed limits applied to everything a (untrusted) MCP server returns.
const MAX_MCP_BODY_BYTES = 1_000_000; // reject oversized JSON-RPC / SSE bodies
const MAX_DISCOVERED_TOOLS = 100; // cap tool-list size from one server
const MAX_TOOL_NAME = 64;
const MAX_TOOL_DESC = 500;
// A server-side tool name must be a bounded, safe identifier. Anything else is
// dropped during discovery so it can never become an addressable tool id.
const SAFE_TOOL_NAME = /^[A-Za-z0-9._-]{1,64}$/;

/** True when a discovered tool name is a safe, bounded identifier. */
export function isValidMcpToolName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= MAX_TOOL_NAME && SAFE_TOOL_NAME.test(name);
}

interface JsonRpcResult {
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: JsonRpcResult;
  error?: { message?: string; code?: number };
}

/**
 * Minimal MCP client over the Streamable HTTP transport. Handles both plain JSON
 * and text/event-stream responses, performs a best-effort initialize handshake,
 * and exposes tool discovery plus tool invocation. All external content is treated
 * as untrusted by callers.
 */
export class McpClient {
  private baseHeaders(token?: string | null): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private assertEndpoint(server: McpServerConfig): URL {
    if (server.transport !== "streamable-http" || !server.endpoint) {
      throw new AgentError("Bu sürüm yalnızca Streamable HTTP MCP sunucularını keşfedebilir.", "client", { retryable: false });
    }
    return assertSafeRemoteUrl(server.endpoint);
  }

  private async parseRpc(response: Response): Promise<JsonRpcResponse> {
    if (response.status === 401) throw new AgentError("MCP sunucusu yetkilendirme istiyor. Token ekleyin veya OAuth bağlantısını başlatın.", "auth", { status: 401, retryable: false });
    if (!response.ok) throw new AgentError("MCP isteği başarısız oldu.", response.status >= 500 ? "server" : "client", { status: response.status });
    // Fail closed on an oversized response before reading the whole body into memory.
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_MCP_BODY_BYTES) throw new AgentError("MCP yanıtı çok büyük.", "server", { retryable: false });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      // Read the SSE body and return the last JSON-RPC response frame.
      const text = (await response.text()).slice(0, MAX_MCP_BODY_BYTES);
      let parsed: JsonRpcResponse | undefined;
      for (const line of text.split("\n")) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const frame = JSON.parse(payload) as JsonRpcResponse;
          if (frame && typeof frame === "object" && "id" in frame) parsed = frame;
        } catch {
          // Skip non-JSON keep-alive comments.
        }
      }
      if (!parsed) throw new AgentError("MCP akış yanıtı çözümlenemedi.", "server");
      return parsed;
    }
    const raw = (await response.text()).slice(0, MAX_MCP_BODY_BYTES);
    try {
      return JSON.parse(raw) as JsonRpcResponse;
    } catch {
      throw new AgentError("MCP yanıtı geçerli JSON değil.", "server", { retryable: false });
    }
  }

  /** Best-effort initialize handshake; returns a session id header when the server issues one. */
  private async initialize(endpoint: URL, token?: string | null): Promise<Record<string, string>> {
    try {
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: this.baseHeaders(token),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: makeId("mcp"),
          method: "initialize",
          params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "OguzhanLab Agent", version: "1.0.0" } },
        }),
      });
      const sessionId = response.headers.get("mcp-session-id");
      // Drain the body so the connection can be reused.
      await response.text().catch(() => undefined);
      return sessionId ? { "Mcp-Session-Id": sessionId } : {};
    } catch {
      // Servers that do not require initialization still answer tools/list directly.
      return {};
    }
  }

  private async call(server: McpServerConfig, token: string | null | undefined, method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    const endpoint = this.assertEndpoint(server);
    const sessionHeaders = await this.initialize(endpoint, token);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { ...this.baseHeaders(token), ...sessionHeaders },
      body: JSON.stringify({ jsonrpc: "2.0", id: makeId("mcp"), method, params }),
    });
    const body = await this.parseRpc(response);
    if (body.error) throw new AgentError(body.error.message ?? "MCP sunucusu hata döndürdü.", "server");
    return body.result ?? {};
  }

  async discoverTools(server: McpServerConfig, token?: string | null): Promise<ToolDefinition[]> {
    const result = await this.call(server, token, "tools/list", {});
    const seen = new Set<string>();
    const tools: ToolDefinition[] = [];
    for (const tool of result.tools ?? []) {
      if (tools.length >= MAX_DISCOVERED_TOOLS) break; // cap list size from one server
      // Fail closed: skip tools whose name isn't a safe, bounded identifier, and
      // dedupe within the server so a name can't map to two addressable ids.
      if (!isValidMcpToolName(tool?.name) || seen.has(tool.name)) continue;
      seen.add(tool.name);
      const description = typeof tool.description === "string" ? tool.description.slice(0, MAX_TOOL_DESC) : "MCP aracı";
      const inputSchema = tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema) ? tool.inputSchema : {};
      tools.push({
        // Namespaced id prevents cross-server and native collisions: mcp.<serverId>.<name>.
        id: `mcp.${server.id}.${tool.name}`,
        title: tool.name,
        // Tool titles/descriptions are untrusted server content; the runtime never
        // executes them as instructions. Risk defaults to medium and is gated.
        description,
        source: "mcp" as const,
        risk: "medium" as const,
        inputSchema,
      });
    }
    return tools;
  }

  /** Invokes a discovered MCP tool. `toolName` is the bare server-side tool name. */
  async callTool(server: McpServerConfig, token: string | null | undefined, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.call(server, token, "tools/call", { name: toolName, arguments: args });
      const text = (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").slice(0, 20_000);
      if (result.isError) return { ok: false, content: "", error: text || "MCP aracı hata döndürdü." };
      return { ok: true, content: text || "MCP aracı içerik döndürmedi.", metadata: { blocks: result.content?.length ?? 0 } };
    } catch (error) {
      return { ok: false, content: "", error: safeErrorMessage(error) };
    }
  }

  safeError(error: unknown): string {
    return safeErrorMessage(error);
  }
}
