import { makeId } from "./security";
import type { AgentTask, TaskGraph } from "./types";

export class TaskGraphManager {
  create(tasks: AgentTask[]): TaskGraph {
    if (!tasks.length) throw new Error("Görev grafiği boş olamaz.");
    const ids = new Set(tasks.map((task) => task.id));
    if (ids.size !== tasks.length) throw new Error("Görev kimlikleri benzersiz olmalıdır.");
    for (const task of tasks) {
      if (task.dependencies.some((dependency) => !ids.has(dependency))) {
        throw new Error(`Görev bağımlılığı bulunamadı: ${task.id}`);
      }
      if (task.dependencies.includes(task.id)) throw new Error("Bir görev kendisine bağımlı olamaz.");
    }
    const graph: TaskGraph = { id: makeId("graph"), rootTaskId: tasks[0].id, tasks, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.topologicalOrder(graph);
    return graph;
  }

  topologicalOrder(graph: TaskGraph): AgentTask[] {
    const byId = new Map(graph.tasks.map((task) => [task.id, task]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const sorted: AgentTask[] = [];
    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error("Görev grafiğinde döngü tespit edildi.");
      visiting.add(id);
      const task = byId.get(id);
      if (!task) throw new Error("Görev bulunamadı.");
      task.dependencies.forEach(visit);
      visiting.delete(id);
      visited.add(id);
      sorted.push(task);
    };
    graph.tasks.forEach((task) => visit(task.id));
    return sorted;
  }

  readyTasks(graph: TaskGraph): AgentTask[] {
    const completed = new Set(graph.tasks.filter((task) => task.status === "completed").map((task) => task.id));
    return graph.tasks.filter((task) => task.status === "pending" && task.dependencies.every((dependency) => completed.has(dependency)));
  }
}
