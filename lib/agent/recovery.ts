import type { AppState, RunStatus, TaskStatus } from "./types";

const ACTIVE_TASK_STATUSES: TaskStatus[] = ["running", "planning", "waiting_for_permission"];

/**
 * Reclassifies runs that were mid-flight when the process died so the app never
 * restarts with a run stuck in `running`, and so durable progress is not lost.
 *
 * - `running` / `planning` WITH a persisted transcript checkpoint → `queued`: the
 *   background manager auto-resumes these from the checkpoint on next foreground.
 * - `running` / `planning` WITHOUT a checkpoint → `failed` (retryable): there is
 *   nothing to resume, and re-running from scratch could repeat a side effect, so
 *   the user decides.
 * - `waiting_for_permission` is left untouched: its pending permission persists and
 *   the user resolves it later (which resumes the run).
 *
 * Completed tasks (and their side effects) are always preserved and never re-run.
 * Pure and free of React Native imports so it is unit-testable in a plain Node env.
 */
export function recoverInterruptedRuns(state: AppState): AppState {
  let changed = false;
  const runs = state.runs.map((run) => {
    if (run.status !== "running" && run.status !== "planning") return run;
    changed = true;
    const resumable = Boolean(run.transcript && run.transcript.length > 0);
    const tasks = run.graph.tasks.map((task) => (ACTIVE_TASK_STATUSES.includes(task.status) ? { ...task, status: "pending" as TaskStatus, error: undefined } : task));
    if (resumable) {
      return { ...run, status: "queued" as RunStatus, error: undefined, graph: { ...run.graph, tasks } };
    }
    return {
      ...run,
      status: "failed" as RunStatus,
      completedAt: run.completedAt ?? new Date().toISOString(),
      error: "Uygulama yeniden başlatıldığı için görev yarıda kaldı. Yeniden deneyebilirsiniz.",
      graph: { ...run.graph, tasks },
    };
  });
  return changed ? { ...state, runs } : state;
}

/** Returns the ids of runs waiting to be resumed (durable queue). */
export function queuedRunIds(state: AppState): string[] {
  return state.runs.filter((run) => run.status === "queued").map((run) => run.id);
}
