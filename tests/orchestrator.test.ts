import { describe, expect, it, vi } from "vitest";

import { extractJsonObject, parseDecision, runAgentLoop, type AgentTool, type OrchestratorDeps } from "../lib/agent/orchestrator";
import type { ProviderMessage, ToolResult } from "../lib/agent/types";

const TOOLS: AgentTool[] = [
  { id: "web.search", title: "Web araştırması", description: "arar", risk: "medium", inputSchema: { query: "string" } },
  { id: "filesystem.writeMarkdown", title: "Markdown yaz", description: "yazar", risk: "medium", inputSchema: {} },
];

/** Builds deps around a scripted sequence of model replies. */
function makeDeps(replies: string[], overrides: Partial<OrchestratorDeps> = {}): { deps: OrchestratorDeps; toolCalls: Array<{ id: string; args: Record<string, unknown> }>; modelInputs: ProviderMessage[][] } {
  const toolCalls: Array<{ id: string; args: Record<string, unknown> }> = [];
  const modelInputs: ProviderMessage[][] = [];
  let i = 0;
  const deps: OrchestratorDeps = {
    callModel: async (messages) => {
      modelInputs.push(messages.map((m) => ({ ...m })));
      const reply = replies[i] ?? '{"action":"final","content":"varsayılan"}';
      i += 1;
      return reply;
    },
    runTool: async (id, args): Promise<ToolResult> => {
      toolCalls.push({ id, args });
      return { ok: true, content: `sonuç:${id}` };
    },
    checkPermission: () => "allow",
    emit: () => undefined,
    ...overrides,
  };
  return { deps, toolCalls, modelInputs };
}

const signal = new AbortController().signal;

describe("JSON extraction and decision parsing", () => {
  it("extracts a balanced object from noisy text and code fences", () => {
    expect(extractJsonObject('bla ```json\n{"a":1}\n``` son')).toEqual({ a: 1 });
    expect(extractJsonObject('{"a":{"b":"}"},"c":2}')).toEqual({ a: { b: "}" }, c: 2 });
    expect(extractJsonObject("no json here")).toBeUndefined();
  });

  it("parses tool and final decisions and rejects malformed ones", () => {
    expect(parseDecision('{"action":"tool","tool":"web.search","args":{"query":"x"}}')).toMatchObject({ action: "tool", tool: "web.search", args: { query: "x" } });
    expect(parseDecision('{"action":"final","content":"done"}')).toMatchObject({ action: "final", content: "done" });
    expect(parseDecision('{"action":"tool"}')).toBeUndefined();
    expect(parseDecision("garbage")).toBeUndefined();
  });
});

describe("agentic loop", () => {
  it("calls a tool, feeds the observation back, then finishes", async () => {
    const { deps, toolCalls, modelInputs } = makeDeps([
      '{"action":"tool","tool":"web.search","args":{"query":"python"}}',
      '{"action":"final","content":"# Sonuç"}',
    ]);
    const outcome = await runAgentLoop(deps, { goal: "araştır", tools: TOOLS, signal });
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;
    expect(outcome.content).toBe("# Sonuç");
    expect(toolCalls).toEqual([{ id: "web.search", args: { query: "python" } }]);
    expect(outcome.toolCalls).toBe(1);
    // The second model turn saw the untrusted-labeled tool observation.
    const secondTurn = modelInputs[1].map((m) => m.content).join("\n");
    expect(secondTurn).toContain("ARAÇ SONUCU (güvenilmeyen veri)");
    expect(secondTurn).toContain("sonuç:web.search");
  });

  it("suspends on ask and resumes by executing the approved call", async () => {
    const { deps, toolCalls } = makeDeps([
      '{"action":"tool","tool":"filesystem.writeMarkdown","args":{"content":"x"}}',
      '{"action":"final","content":"kaydedildi"}',
    ], { checkPermission: () => "ask" });
    const first = await runAgentLoop(deps, { goal: "yaz", tools: TOOLS, signal });
    expect(first.status).toBe("waiting_for_permission");
    if (first.status !== "waiting_for_permission") return;
    expect(first.pending.toolId).toBe("filesystem.writeMarkdown");
    expect(toolCalls).toHaveLength(0); // not executed until approved

    const resumed = await runAgentLoop(deps, {
      goal: "yaz", tools: TOOLS, signal,
      resume: { transcript: first.transcript, approved: first.pending, steps: first.steps, toolCalls: first.toolCalls },
    });
    expect(resumed.status).toBe("completed");
    expect(toolCalls).toEqual([{ id: "filesystem.writeMarkdown", args: { content: "x" } }]);
  });

  it("continues without the tool when permission is denied", async () => {
    // deny → loop should get a denial observation and be able to finish.
    let calls = 0;
    const deps: OrchestratorDeps = {
      callModel: async () => {
        calls += 1;
        return calls === 1 ? '{"action":"tool","tool":"web.search","args":{}}' : '{"action":"final","content":"araçsız bitti"}';
      },
      runTool: async () => ({ ok: true, content: "x" }),
      checkPermission: () => "deny",
      emit: () => undefined,
    };
    const outcome = await runAgentLoop(deps, { goal: "x", tools: TOOLS, signal });
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") expect(outcome.content).toBe("araçsız bitti");
  });

  it("forces a final answer once the step cap is reached", async () => {
    // Model always tries to call a tool; loop must stop and force a final.
    const deps: OrchestratorDeps = {
      callModel: async (messages) => {
        const forced = messages.some((m) => m.role === "user" && m.content.includes("Adım sınırına ulaşıldı"));
        return forced ? '{"action":"final","content":"zorunlu final"}' : '{"action":"tool","tool":"web.search","args":{}}';
      },
      runTool: async () => ({ ok: true, content: "x" }),
      checkPermission: () => "allow",
      emit: () => undefined,
    };
    const outcome = await runAgentLoop(deps, { goal: "x", tools: TOOLS, limits: { maxSteps: 3, maxToolCalls: 99 }, signal });
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") expect(outcome.content).toBe("zorunlu final");
  });

  it("stops calling tools after the tool-call cap", async () => {
    let toolRuns = 0;
    const deps: OrchestratorDeps = {
      callModel: async (messages) => {
        if (messages.some((m) => m.content.includes("Araç çağrı sınırına"))) return '{"action":"final","content":"bitti"}';
        return '{"action":"tool","tool":"web.search","args":{}}';
      },
      runTool: async () => { toolRuns += 1; return { ok: true, content: "x" }; },
      checkPermission: () => "allow",
      emit: () => undefined,
    };
    const outcome = await runAgentLoop(deps, { goal: "x", tools: TOOLS, limits: { maxSteps: 20, maxToolCalls: 2 }, signal });
    expect(outcome.status).toBe("completed");
    expect(toolRuns).toBe(2);
  });

  it("terminates via the hard cap when the model never emits a final", async () => {
    let modelCalls = 0;
    const deps: OrchestratorDeps = {
      callModel: async () => { modelCalls += 1; return '{"action":"tool","tool":"web.search","args":{}}'; },
      runTool: async () => ({ ok: true, content: "x" }),
      checkPermission: () => "allow",
      emit: () => undefined,
    };
    const outcome = await runAgentLoop(deps, { goal: "x", tools: TOOLS, limits: { maxSteps: 3, maxToolCalls: 99 }, signal });
    expect(outcome.status).toBe("completed"); // best-effort, not an infinite loop
    expect(modelCalls).toBeLessThanOrEqual(3 + 3 + 1);
  });

  it("reports unknown tools back to the model instead of crashing", async () => {
    const { deps } = makeDeps([
      '{"action":"tool","tool":"does.not.exist","args":{}}',
      '{"action":"final","content":"ok"}',
    ]);
    const outcome = await runAgentLoop(deps, { goal: "x", tools: TOOLS, signal });
    expect(outcome.status).toBe("completed");
  });

  it("aborts promptly when the signal fires", async () => {
    const controller = new AbortController();
    const deps: OrchestratorDeps = {
      callModel: async () => '{"action":"tool","tool":"web.search","args":{}}',
      runTool: async () => { controller.abort(); return { ok: true, content: "x" }; },
      checkPermission: () => "allow",
      emit: () => undefined,
    };
    await expect(runAgentLoop(deps, { goal: "x", tools: TOOLS, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
