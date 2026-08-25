import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidMcpToolName, McpClient } from "../lib/agent/mcp";
import { ToolRegistry, nativeTools } from "../lib/agent/tools";
import { makeCustomSkill, validateSkillInput, SKILL_LIMITS } from "../lib/agent/skills";
import { assertSafeRemoteUrl } from "../lib/agent/security";
import type { McpServerConfig, ToolDefinition } from "../lib/agent/types";

const server: McpServerConfig = { id: "srv", name: "S", endpoint: "https://mcp.example.com/rpc", transport: "streamable-http", authType: "none", enabled: true, status: "connected", discoveredTools: [], createdAt: "t" };

function mcpTool(id: string): ToolDefinition {
  return { id, title: id, description: "d", source: "mcp", risk: "medium", inputSchema: {} };
}

describe("MCP discovery hardening", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("validates tool names as bounded safe identifiers", () => {
    expect(isValidMcpToolName("search")).toBe(true);
    expect(isValidMcpToolName("a.b-c_1")).toBe(true);
    expect(isValidMcpToolName("")).toBe(false);
    expect(isValidMcpToolName("has space")).toBe(false);
    expect(isValidMcpToolName("bad/../name")).toBe(false);
    expect(isValidMcpToolName("x".repeat(65))).toBe(false);
    expect(isValidMcpToolName(42)).toBe(false);
    expect(isValidMcpToolName(undefined)).toBe(false);
  });

  it("drops invalid-named tools, dedupes, and caps the discovered list", async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ name: `tool_${i}`, description: "x" }));
    const tools = [
      { name: "good", description: "ok" },
      { name: "good", description: "dupe" }, // duplicate name -> dropped
      { name: "bad name", description: "unsafe" }, // invalid -> dropped
      { name: "", description: "empty" }, // invalid -> dropped
      ...many,
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "initialize") return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools } }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const discovered = await new McpClient().discoverTools(server, null);
    expect(discovered.length).toBeLessThanOrEqual(100); // capped
    const ids = discovered.map((t) => t.id);
    expect(ids.filter((id) => id === "mcp.srv.good")).toHaveLength(1); // deduped
    expect(ids).not.toContain("mcp.srv.bad name");
    expect(discovered.every((t) => t.id.startsWith("mcp.srv."))).toBe(true);
  });

  it("rejects an oversized JSON body (fail closed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "initialize") return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": String(5_000_000) } });
    }));
    await expect(new McpClient().discoverTools(server, null)).rejects.toThrow(/çok büyük/i);
  });

  it("rejects malformed (non-JSON) responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "initialize") return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } });
    }));
    await expect(new McpClient().discoverTools(server, null)).rejects.toThrow(/JSON/i);
  });
});

describe("ToolRegistry MCP lifecycle", () => {
  it("replaces a server's tools and drops stale ids on re-discovery and removal", () => {
    const registry = new ToolRegistry();
    registry.replaceMcpServerTools("srv", [mcpTool("mcp.srv.a"), mcpTool("mcp.srv.b")]);
    expect(registry.get("mcp.srv.a")).toBeDefined();
    // Re-discovery drops a removed tool (b) and keeps native tools untouched.
    registry.replaceMcpServerTools("srv", [mcpTool("mcp.srv.a")]);
    expect(registry.get("mcp.srv.b")).toBeUndefined();
    expect(registry.get(nativeTools[0].id)).toBeDefined();
    // Removal clears all of the server's tools.
    registry.replaceMcpServerTools("srv", []);
    expect(registry.get("mcp.srv.a")).toBeUndefined();
    expect(registry.list().some((t) => t.id.startsWith("mcp.srv."))).toBe(false);
  });

  it("only clears the targeted server's tools", () => {
    const registry = new ToolRegistry();
    registry.replaceMcpServerTools("srv1", [mcpTool("mcp.srv1.a")]);
    registry.replaceMcpServerTools("srv2", [mcpTool("mcp.srv2.a")]);
    registry.replaceMcpServerTools("srv1", []);
    expect(registry.get("mcp.srv1.a")).toBeUndefined();
    expect(registry.get("mcp.srv2.a")).toBeDefined();
  });
});

describe("skill manifest validation", () => {
  it("accepts a well-formed manifest and stamps versioned metadata", () => {
    expect(validateSkillInput({ name: "X", instructions: "do the thing" })).toEqual({ ok: true });
    const skill = makeCustomSkill({ name: "X", instructions: "do the thing", keywords: ["a", "b"] });
    expect(skill.source).toBe("user");
    expect(skill.version).toBe("1.0.0");
    expect(skill.installedAt).toBeTruthy();
    expect(skill.builtin).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(validateSkillInput({ name: "", instructions: "x" })).toMatchObject({ ok: false });
    expect(validateSkillInput({ name: "X", instructions: "  " })).toMatchObject({ ok: false });
  });

  it("rejects oversized content", () => {
    const big = "a".repeat(SKILL_LIMITS.instructions + 1);
    expect(validateSkillInput({ name: "X", instructions: big })).toMatchObject({ ok: false });
    expect(validateSkillInput({ name: "y".repeat(SKILL_LIMITS.name + 1), instructions: "x" })).toMatchObject({ ok: false });
  });

  it("clamps fields as defense in depth even past validation", () => {
    const skill = makeCustomSkill({ name: "X", instructions: "z".repeat(SKILL_LIMITS.instructions + 500), keywords: Array.from({ length: 50 }, (_, i) => `k${i}`) });
    expect(skill.instructions.length).toBe(SKILL_LIMITS.instructions);
    expect(skill.keywords.length).toBeLessThanOrEqual(SKILL_LIMITS.keywords);
  });
});

describe("SSRF guard hardening", () => {
  it("allows ordinary HTTPS hosts", () => {
    expect(() => assertSafeRemoteUrl("https://api.example.com/mcp")).not.toThrow();
  });

  it("blocks loopback, private, CGNAT, metadata, and IPv4-mapped IPv6", () => {
    for (const bad of [
      "https://localhost/mcp",
      "https://127.0.0.1/mcp",
      "https://10.1.2.3/mcp",
      "https://192.168.0.1/mcp",
      "https://172.16.5.5/mcp",
      "https://100.100.0.1/mcp", // CGNAT 100.64/10
      "https://metadata.google.internal/",
      "https://[::ffff:127.0.0.1]/mcp",
      "https://foo.local/mcp",
    ]) {
      expect(() => assertSafeRemoteUrl(bad), bad).toThrow();
    }
  });

  it("blocks non-HTTPS and embedded credentials", () => {
    expect(() => assertSafeRemoteUrl("http://api.example.com/mcp")).toThrow();
    expect(() => assertSafeRemoteUrl("https://user:pass@api.example.com/mcp")).toThrow();
  });
});
