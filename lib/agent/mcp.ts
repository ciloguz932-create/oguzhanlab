import { assertSafeRemoteUrl, makeId, safeErrorMessage } from "./security";
import type { McpServerConfig, ToolDefinition } from "./types";

interface JsonRpcResponse { jsonrpc: "2.0"; id: string | number; result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }; error?: { message?: string } }

export class McpClient {
  async discoverTools(server: McpServerConfig, token?: string | null): Promise<ToolDefinition[]> {
    if (server.transport !== "streamable-http" || !server.endpoint) throw new Error("Bu sürüm yalnızca Streamable HTTP MCP sunucularını keşfedebilir.");
    const endpoint = assertSafeRemoteUrl(server.endpoint);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: makeId("mcp"), method: "tools/list", params: {} }),
    });
    if (response.status === 401) throw new Error("MCP sunucusu yetkilendirme istiyor. Token ekleyin veya OAuth bağlantısını başlatın.");
    if (!response.ok) throw new Error("MCP araç keşfi başarısız oldu.");
    const body = (await response.json()) as JsonRpcResponse;
    if (body.error) throw new Error(body.error.message ?? "MCP sunucusu hata döndürdü.");
    return (body.result?.tools ?? []).map((tool) => ({ id: `mcp.${server.id}.${tool.name}`, title: tool.name, description: tool.description ?? "MCP aracı", source: "mcp", risk: "medium", inputSchema: tool.inputSchema ?? {} }));
  }

  safeError(error: unknown): string {
    return safeErrorMessage(error);
  }
}
