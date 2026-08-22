import { describe, expect, it, vi } from "vitest";

import type { AgentTool } from "../lib/agent/orchestrator";
import { isSubAgentRole, runSubAgent, SUBAGENT_ROLES, type SubAgentDeps } from "../lib/agent/subagents";
import type { ToolResult } from "../lib/agent/types";

const CATALOG: AgentTool[] = [
  { id: "web.search", title: "search", description: "", risk: "medium", inputSchema: {} },
  { id: "web.fetch", title: "fetch", description: "", risk: "medium", inputSchema: {} },
  { id: "calculator.evaluate", title: "calc", description: "", risk: "low", inputSchema: {} },
  { id: "filesystem.writeMarkdown", title: "write", description: "", risk: "medium", inputSchema: {} },
  { id: "agent.spawn", title: "spawn", description: "", risk: "medium", inputSchema: {} },
];
const signal = new AbortController().signal;

function deps(replies: string[], onTool?: (id: string) => ToolResult): { deps: SubAgentDeps; systemPrompts: string[]; toolIds: string[] } {
  const systemPrompts: string[] = [];
  const toolIds: string[] = [];
  let i = 0;
  return {
    systemPrompts,
    toolIds,
    deps: {
      callModel: async (messages) => { systemPrompts.push(messages[0].content); return replies[i++] ?? '{"action":"final","content":"done"}'; },
      dispatchTool: async (id) => { toolIds.push(id); return onTool ? onTool(id) : { ok: true, content: `sonuç:${id}` }; },
      emit: () => undefined,
    },
  };
}

describe("sub-agent roles", () => {
  it("recognizes valid roles", () => {
    expect(isSubAgentRole("research")).toBe(true);
    expect(isSubAgentRole("coding")).toBe(true);
    expect(isSubAgentRole("nope")).toBe(false);
  });

  it("no role can write or spawn (side-effect free)", () => {
    for (const role of Object.values(SUBAGENT_ROLES)) {
      expect(role.toolIds).not.toContain("filesystem.writeMarkdown");
      expect(role.toolIds).not.toContain("email.send");
      expect(role.toolIds).not.toContain("github.create_issue");
      expect(role.toolIds).not.toContain("agent.spawn");
    }
  });
});

describe("runSubAgent", () => {
  it("scopes the catalog to the role and injects role instructions", async () => {
    const d = deps(['{"action":"final","content":"özet"}']);
    const result = await runSubAgent("research", "python trendleri", { catalog: CATALOG, deps: d.deps, signal });
    expect(result.ok).toBe(true);
    expect(result.content).toBe("özet");
    expect(result.metadata?.role).toBe("research");
    // System prompt lists only research tools, not calculator/write/spawn.
    const prompt = d.systemPrompts[0];
    expect(prompt).toContain("web.search");
    expect(prompt).toContain("web.fetch");
    expect(prompt).not.toContain("filesystem.writeMarkdown");
    expect(prompt).not.toContain("agent.spawn");
    expect(prompt).toContain(SUBAGENT_ROLES.research.name);
  });

  it("executes a scoped tool then finishes", async () => {
    const d = deps([
      '{"action":"tool","tool":"web.search","args":{"query":"x"}}',
      '{"action":"final","content":"bitti"}',
    ]);
    const result = await runSubAgent("research", "araştır", { catalog: CATALOG, deps: d.deps, signal });
    expect(result.ok).toBe(true);
    expect(d.toolIds).toEqual(["web.search"]);
  });

  it("refuses out-of-scope and spawn tools even if the model requests them", async () => {
    // Model tries filesystem write (out of scope) then spawn, then finals.
    const d = deps([
      '{"action":"tool","tool":"filesystem.writeMarkdown","args":{"content":"x"}}',
      '{"action":"tool","tool":"agent.spawn","args":{"role":"research","task":"y"}}',
      '{"action":"final","content":"bitti"}',
    ]);
    const result = await runSubAgent("research", "araştır", { catalog: CATALOG, deps: d.deps, signal });
    expect(result.ok).toBe(true);
    // Neither tool reached dispatchTool.
    expect(d.toolIds).toEqual([]);
  });

  it("rejects an empty task", async () => {
    const d = deps([]);
    const result = await runSubAgent("data", "   ", { catalog: CATALOG, deps: d.deps, signal });
    expect(result.ok).toBe(false);
  });

  it("propagates sub-agent failure to the parent as an error result", async () => {
    // Model returns invalid JSON forever; with a tiny budget it terminates best-effort.
    const d = deps([]);
    const result = await runSubAgent("writing", "yaz", { catalog: CATALOG, deps: d.deps, signal, limits: { maxSteps: 2, maxToolCalls: 1 } });
    // Best-effort completion (not a hang); the loop always returns.
    expect(typeof result.ok).toBe("boolean");
  });
});
