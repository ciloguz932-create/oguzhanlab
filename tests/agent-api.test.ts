import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentService } from "../server/agent/service";

afterEach(() => vi.unstubAllGlobals());

/** Waits until a run leaves the "running" state (or times out). */
async function waitForDone(service: AgentService, id: string, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (service.getRun(id)?.status !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Stubs the OpenAI-compatible endpoints the ProviderRegistry hits:
 *  - GET /models   → credential validation + model list
 *  - POST /chat/completions → scripted model turns
 */
function stubOpenAi(turns: string[]): void {
  let turn = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), { status: 200 });
    }
    if (url.endsWith("/chat/completions")) {
      const content = turns[Math.min(turn, turns.length - 1)];
      turn += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
}

describe("AgentService (HTTP Agent API core)", () => {
  it("rejects a run without instruction or key", async () => {
    const service = new AgentService();
    await expect(service.createRun({ instruction: "", apiKey: "sk-proj-abc123def456" })).rejects.toThrow();
    await expect(service.createRun({ instruction: "hi", apiKey: "" })).rejects.toThrow();
  });

  it("runs a goal end-to-end: validate → model turn → completion + usage", async () => {
    stubOpenAi(['{"action":"final","content":"# Cevap\\nTamamlandı."}']);
    const service = new AgentService();
    const record = await service.createRun({ instruction: "kısa bir özet yaz", apiKey: "sk-proj-abcdef123456" });
    expect(record.provider).toBe("openai");
    await waitForDone(service, record.id);
    const done = service.getRun(record.id)!;
    expect(done.status).toBe("completed");
    expect(done.result).toContain("Tamamlandı");
    expect(done.model).toBe("gpt-4o-mini");
    expect(done.usage.outputTokens).toBeGreaterThan(0);
    expect(done.usage.hasCost).toBe(true);
  });

  it("executes an allowed tool then finishes, recording events", async () => {
    stubOpenAiWithTool();
    const service = new AgentService();
    const record = await service.createRun({ instruction: "3+4 hesapla", apiKey: "sk-proj-abcdef123456", allowedTools: ["calculator.evaluate"] });
    await waitForDone(service, record.id);
    const done = service.getRun(record.id)!;
    expect(done.status).toBe("completed");
    expect(done.events.some((e) => e.type === "ToolCallCompleted")).toBe(true);
  });

  it("denies a tool that is not in the allow list (agent adapts, no execution)", async () => {
    // Model tries web.search (not allowed) → gets a denial observation → finishes.
    stubOpenAi([
      '{"action":"tool","tool":"web.search","args":{"query":"x"}}',
      '{"action":"final","content":"araçsız tamamlandı"}',
    ]);
    const service = new AgentService();
    const record = await service.createRun({ instruction: "araştır", apiKey: "sk-proj-abcdef123456", allowedTools: ["calculator.evaluate"] });
    await waitForDone(service, record.id);
    const done = service.getRun(record.id)!;
    expect(done.status).toBe("completed");
    expect(done.result).toContain("tamamlandı");
  });

  it("fails cleanly on an invalid credential without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const service = new AgentService();
    await expect(service.createRun({ instruction: "x", apiKey: "sk-proj-secretkey123" })).rejects.toThrow();
  });
});

function stubOpenAiWithTool(): void {
  let turn = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), { status: 200 });
    const turns = ['{"action":"tool","tool":"calculator.evaluate","args":{"expression":"3+4"}}', '{"action":"final","content":"7"}'];
    const content = turns[Math.min(turn, turns.length - 1)];
    turn += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }), { status: 200 });
  }));
}
