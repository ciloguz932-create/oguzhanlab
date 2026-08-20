import { makeId } from "./security";
import { TaskGraphManager } from "./task-graph";
import type { AgentTask, TaskGraph } from "./types";

function task(input: Omit<AgentTask, "id" | "createdAt" | "updatedAt" | "status" | "retryCount" | "maxRetries">): AgentTask {
  const now = new Date().toISOString();
  return { ...input, id: makeId("task"), status: "pending", retryCount: 0, maxRetries: 2, createdAt: now, updatedAt: now };
}

export class Planner {
  private readonly graphManager = new TaskGraphManager();

  /**
   * Lightweight three-stage outline for the autonomous (agentic) executor. The real
   * plan is formed dynamically by the model at runtime; these stages give the UI a
   * stable, honest progress skeleton (understand → act with tools → produce & verify).
   */
  createOutline(instruction: string): TaskGraph {
    const understand = task({ title: "Hedefi anla ve planla", kind: "analysis", priority: 1, dependencies: [], toolRequirements: [], input: instruction });
    const act = task({ title: "Araçları kullanarak yürüt", kind: "research", priority: 2, dependencies: [understand.id], toolRequirements: [], input: instruction });
    const produce = task({ title: "Yanıtı üret ve doğrula", kind: "generation", priority: 3, dependencies: [act.id], modelRequirement: "reasoning", toolRequirements: [], input: instruction });
    return this.graphManager.create([understand, act, produce]);
  }

  createPlan(instruction: string): TaskGraph {
    const normalized = instruction.toLocaleLowerCase("tr-TR");
    const needsResearch = /(araştır|internette|kaynak|search|research|web|karşılaştır)/.test(normalized);
    const needsArtifact = /(markdown|\.md|rapor|pdf|dosya|kaydet|oluştur)/.test(normalized);
    const understand = task({ title: "Hedefi anla", kind: "analysis", priority: 1, dependencies: [], toolRequirements: [], input: instruction });
    const tasks = [understand];
    let previousId = understand.id;
    if (needsResearch) {
      const research = task({ title: "Güvenilir kaynakları araştır", kind: "research", priority: 2, dependencies: [previousId], toolRequirements: ["web.search"], input: instruction });
      tasks.push(research);
      previousId = research.id;
    }
    const synthesis = task({ title: "Sonucu yapılandır ve üret", kind: "generation", priority: 3, dependencies: [previousId], toolRequirements: [], modelRequirement: "reasoning", input: instruction });
    tasks.push(synthesis);
    previousId = synthesis.id;
    if (needsArtifact) {
      const artifact = task({ title: "Çıktıyı artifact olarak kaydet", kind: "artifact", priority: 4, dependencies: [previousId], toolRequirements: ["filesystem.writeMarkdown"], input: instruction });
      tasks.push(artifact);
      previousId = artifact.id;
    }
    tasks.push(task({ title: "Çıktıyı doğrula", kind: "verification", priority: 5, dependencies: [previousId], toolRequirements: [], input: instruction }));
    return this.graphManager.create(tasks);
  }
}
