import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentError, backoffDelayMs, classifyError, httpError, sleep, withRetry } from "../lib/agent/errors";
import { classifyModel, selectModel } from "../lib/agent/model-router";
import { McpClient } from "../lib/agent/mcp";
import { ProviderRegistry } from "../lib/agent/providers";
import { queuedRunIds, recoverInterruptedRuns } from "../lib/agent/recovery";
import { addUsage, emptyTotals, estimateCostUsd } from "../lib/agent/usage";
import type { AppState, McpServerConfig, ProviderModel } from "../lib/agent/types";

const model = (id: string, capabilities: ProviderModel["capabilities"] = ["chat"]): ProviderModel => ({ id, label: id, capabilities });

describe("model router", () => {
  it("classifies models from ids and declared capabilities", () => {
    expect(classifyModel(model("gpt-4o-mini")).fast).toBe(true);
    expect(classifyModel(model("claude-sonnet-4-0")).reasoning).toBe(true);
    expect(classifyModel(model("o3-mini")).reasoning).toBe(true);
    expect(classifyModel(model("gpt-4o")).vision).toBe(true);
    expect(classifyModel(model("some-model", ["reasoning"])).reasoning).toBe(true);
  });

  it("routes each requirement to a suitable model and never blocks", () => {
    const models = [model("gpt-4o-mini"), model("gpt-4.1"), model("claude-opus-4")];
    expect(selectModel(models, "fast", "gpt-4.1")).toBe("gpt-4o-mini");
    expect(selectModel(models, "reasoning", "gpt-4o-mini")).not.toBe("gpt-4o-mini");
    // Unknown requirement match falls back to the provided default.
    expect(selectModel([model("only-basic")], "vision", "only-basic")).toBe("only-basic");
    // Empty model list returns the default rather than throwing.
    expect(selectModel([], "reasoning", "fallback")).toBe("fallback");
  });

  it("classifies and routes current-gen Anthropic models (incl. Fable)", () => {
    expect(classifyModel(model("claude-fable-5")).reasoning).toBe(true);
    expect(classifyModel(model("claude-fable-5")).vision).toBe(true);
    expect(classifyModel(model("claude-haiku-4-5")).fast).toBe(true);
    const models = [model("claude-haiku-4-5"), model("claude-sonnet-5"), model("claude-fable-5")];
    expect(selectModel(models, "fast", "claude-fable-5")).toBe("claude-haiku-4-5");
    expect(selectModel(models, "reasoning", "claude-haiku-4-5")).not.toBe("claude-haiku-4-5");
  });

  it("honors a valid user override and ignores an invalid one", () => {
    const models = [model("gpt-4o-mini"), model("gpt-4.1")];
    // Valid pin wins over heuristics.
    expect(selectModel(models, "fast", "gpt-4o-mini", "gpt-4.1")).toBe("gpt-4.1");
    // A pin for a model the connection lacks is ignored (falls back to heuristics).
    expect(selectModel(models, "fast", "gpt-4.1", "does-not-exist")).toBe("gpt-4o-mini");
  });
});

describe("usage and cost estimation", () => {
  it("estimates cost from token usage and known prices", () => {
    const cost = estimateCostUsd("openai", "gpt-4o-mini", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.75, 5);
    // Claude Fable 5 list price: $10 in / $50 out per 1M.
    expect(estimateCostUsd("anthropic", "claude-fable-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(60, 5);
  });

  it("returns undefined when the provider reports no usage", () => {
    expect(estimateCostUsd("anthropic", "claude-sonnet-4-0", undefined)).toBeUndefined();
    expect(estimateCostUsd("anthropic", "claude-sonnet-4-0", {})).toBeUndefined();
  });

  it("accumulates totals and tracks whether any cost is known", () => {
    let totals = emptyTotals();
    totals = addUsage(totals, { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.001 });
    totals = addUsage(totals, { inputTokens: 20, outputTokens: 7 });
    expect(totals.inputTokens).toBe(30);
    expect(totals.outputTokens).toBe(12);
    expect(totals.hasCost).toBe(true);
  });
});

describe("error classification and retry", () => {
  it("maps http status to structured, retryable-aware errors", () => {
    expect(httpError(401).retryable).toBe(false);
    expect(httpError(429).kind).toBe("rate_limit");
    expect(httpError(429).retryable).toBe(true);
    expect(httpError(503).kind).toBe("server");
  });

  it("classifies fetch network failures and aborts", () => {
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(classifyError(new TypeError("Failed to fetch")).retryable).toBe(true);
    expect(classifyError(new DOMException("Aborted", "AbortError")).retryable).toBe(false);
  });

  it("keeps backoff within a jittered exponential envelope", () => {
    expect(backoffDelayMs(0, 400, 8000, () => 0)).toBe(200);
    expect(backoffDelayMs(0, 400, 8000, () => 1)).toBe(400);
    expect(backoffDelayMs(10, 400, 8000, () => 1)).toBe(8000);
  });

  it("retries only transient errors and respects the budget", async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw httpError(503);
      return "ok";
    }, { retries: 3, random: () => 0, baseMs: 1 });
    expect(value).toBe("ok");
    expect(calls).toBe(3);

    let authCalls = 0;
    await expect(withRetry(async () => {
      authCalls += 1;
      throw httpError(401);
    }, { retries: 3, random: () => 0, baseMs: 1 })).rejects.toBeInstanceOf(AgentError);
    expect(authCalls).toBe(1);
  });

  it("aborts a sleep when the signal fires", async () => {
    const controller = new AbortController();
    const pending = sleep(1000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("provider detection incl. gemini", () => {
  it("detects Google API keys", () => {
    const registry = new ProviderRegistry();
    expect(registry.detect("AIzaSyA1234567890abcdefghijklmnopqrstuvwx")?.id).toBe("gemini");
    expect(registry.getSupported().map((p) => p.id)).toContain("gemini");
  });
});

describe("interrupted run recovery", () => {
  it("marks in-flight runs recoverable and preserves completed work", () => {
    const base: AppState = {
      version: 1, initialized: true, workspaces: [], connections: [], messages: [], events: [], artifacts: [], mcpServers: [], skills: [], integrations: [],
      permissionPolicies: {}, offlineMode: false, debugMode: false, notificationsEnabled: false,
      runs: [{
        id: "run1", workspaceId: "w1", instruction: "x", status: "running", startedAt: "t", artifactIds: [],
        graph: { id: "g", rootTaskId: "a", createdAt: "t", updatedAt: "t", tasks: [
          { id: "a", title: "a", kind: "analysis", status: "completed", priority: 1, dependencies: [], toolRequirements: [], input: "x", retryCount: 0, maxRetries: 2, createdAt: "t", updatedAt: "t" },
          { id: "b", title: "b", kind: "generation", status: "running", priority: 2, dependencies: ["a"], toolRequirements: [], input: "x", retryCount: 0, maxRetries: 2, createdAt: "t", updatedAt: "t" },
        ] },
      }],
    };
    // No checkpoint transcript → not resumable → failed (retryable), tasks reset.
    const recovered = recoverInterruptedRuns(base);
    expect(recovered.runs[0].status).toBe("failed");
    expect(recovered.runs[0].graph.tasks[0].status).toBe("completed");
    expect(recovered.runs[0].graph.tasks[1].status).toBe("pending");
    // A settled state is returned unchanged (referential identity preserved).
    const settled = { ...base, runs: [{ ...base.runs[0], status: "completed" as const }] };
    expect(recoverInterruptedRuns(settled)).toBe(settled);
  });

  it("queues checkpointed runs for resume and leaves waiting-for-permission alone", () => {
    const base: AppState = {
      version: 1, initialized: true, workspaces: [], connections: [], messages: [], events: [], artifacts: [], mcpServers: [], skills: [], integrations: [],
      permissionPolicies: {}, offlineMode: false, debugMode: false, notificationsEnabled: false,
      runs: [
        { id: "r1", workspaceId: "w", instruction: "x", status: "running", startedAt: "t", artifactIds: [], transcript: [{ role: "user", content: "x" }], graph: { id: "g1", rootTaskId: "a", createdAt: "t", updatedAt: "t", tasks: [] } },
        { id: "r2", workspaceId: "w", instruction: "y", status: "waiting_for_permission", startedAt: "t", artifactIds: [], transcript: [{ role: "user", content: "y" }], graph: { id: "g2", rootTaskId: "b", createdAt: "t", updatedAt: "t", tasks: [] } },
      ],
    };
    const recovered = recoverInterruptedRuns(base);
    expect(recovered.runs[0].status).toBe("queued");
    expect(recovered.runs[1].status).toBe("waiting_for_permission"); // untouched
    expect(queuedRunIds(recovered)).toEqual(["r1"]);
  });
});

describe("MCP client tool invocation", () => {
  afterEach(() => vi.unstubAllGlobals());

  const server: McpServerConfig = { id: "srv", name: "S", endpoint: "https://mcp.example.com/rpc", transport: "streamable-http", authType: "bearer", enabled: true, status: "connected", discoveredTools: [], createdAt: "t" };

  it("sends tools/call with arguments and parses a JSON result", async () => {
    const seen: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push(body);
      if (body.method === "initialize") return new Response("{}", { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "sess-1" } });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "hello world" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const result = await new McpClient().callTool(server, "tok", "echo", { value: 1 });
    expect(result.ok).toBe(true);
    expect(result.content).toBe("hello world");
    const call = seen.find((b) => b.method === "tools/call");
    expect(call.params).toEqual({ name: "echo", arguments: { value: 1 } });
  });

  it("parses an SSE-framed JSON-RPC result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "initialize") return new Response("", { status: 200, headers: { "content-type": "application/json" } });
      const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "search", description: "web" }] } })}\n\n`;
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const tools = await new McpClient().discoverTools(server, null);
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe("mcp.srv.search");
    expect(tools[0].source).toBe("mcp");
  });

  it("surfaces auth failures without leaking the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const result = await new McpClient().callTool(server, "secret-token", "echo", {});
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("secret-token");
  });
});
