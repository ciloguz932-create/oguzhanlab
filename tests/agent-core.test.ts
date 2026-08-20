import { describe, expect, it } from "vitest";

import { Planner } from "../lib/agent/planner";
import { ProviderRegistry } from "../lib/agent/providers";
import { sanitizeFileName } from "../lib/agent/security";
import { TaskGraphManager } from "../lib/agent/task-graph";
import { safeCalculate } from "../lib/agent/tools";
import type { AgentTask } from "../lib/agent/types";

const makeTask = (id: string, dependencies: string[] = []): AgentTask => ({
  id,
  title: id,
  kind: "analysis",
  status: "pending",
  priority: 1,
  dependencies,
  toolRequirements: [],
  input: "test",
  retryCount: 0,
  maxRetries: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("agent çekirdeği", () => {
  it("DAG görevlerini bağımlılık sırasına sokar ve döngüyü reddeder", () => {
    const manager = new TaskGraphManager();
    const graph = manager.create([makeTask("anla"), makeTask("uret", ["anla"]), makeTask("dogrula", ["uret"])]);
    expect(manager.topologicalOrder(graph).map((task) => task.id)).toEqual(["anla", "uret", "dogrula"]);
    expect(() => manager.create([makeTask("a", ["b"]), makeTask("b", ["a"])])).toThrow("döngü");
  });

  it("araştırma ve dosya talebinden doğrulanabilir bir çalışma planı üretir", () => {
    const graph = new Planner().createPlan("Python kaynaklarını internette araştır ve markdown dosyasına koy");
    expect(graph.tasks.some((task) => task.kind === "research" && task.toolRequirements.includes("web.search"))).toBe(true);
    expect(graph.tasks.some((task) => task.kind === "artifact" && task.toolRequirements.includes("filesystem.writeMarkdown"))).toBe(true);
    expect(graph.tasks.at(-1)?.kind).toBe("verification");
  });

  it("sağlayıcı anahtar biçimlerini merkezi olarak algılar", () => {
    const registry = new ProviderRegistry();
    expect(registry.detect("sk-proj-abcdEFGH1234567890")?.id).toBe("openai");
    expect(registry.detect("sk-ant-api03-abcdefgh123456789")?.id).toBe("anthropic");
    expect(registry.detect("sk-or-v1-abcdefgh123456789")?.id).toBe("openrouter");
    expect(registry.detect("not-a-key")).toBeUndefined();
  });

  it("yerel yardımcıları güvenli tutar", () => {
    expect(safeCalculate("(7 + 3) * 2")).toBe(20);
    expect(() => safeCalculate("7 + process.exit()" )).toThrow();
    expect(sanitizeFileName("../../gizli anahtar")).toBe("gizli-anahtar.md");
  });
});
