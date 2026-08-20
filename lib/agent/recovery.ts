import type { AppState, RunStatus, TaskStatus } from "./types";

const INTERRUPTED_RUN_STATUSES: RunStatus[] = ["running", "planning", "waiting_for_permission"];
const INTERRUPTED_TASK_STATUSES: TaskStatus[] = ["running", "planning", "waiting_for_permission"];

/**
 * Marks runs that were mid-flight when the process died as recoverable failures and
 * resets their in-flight tasks to `pending`, so restarting the app never leaves a
 * run permanently stuck in `running` and the user can safely retry. Completed tasks
 * (and their side effects) are preserved and never re-executed.
 *
 * Pure and free of React Native imports so it is unit-testable in a plain Node env.
 */
export function recoverInterruptedRuns(state: AppState): AppState {
  let changed = false;
  const runs = state.runs.map((run) => {
    if (!INTERRUPTED_RUN_STATUSES.includes(run.status)) return run;
    changed = true;
    return {
      ...run,
      status: "failed" as RunStatus,
      completedAt: run.completedAt ?? new Date().toISOString(),
      error: "Uygulama yeniden başlatıldığı için görev yarıda kaldı. Yeniden deneyebilirsiniz.",
      graph: {
        ...run.graph,
        tasks: run.graph.tasks.map((task) => (INTERRUPTED_TASK_STATUSES.includes(task.status) ? { ...task, status: "pending" as TaskStatus, error: undefined } : task)),
      },
    };
  });
  return changed ? { ...state, runs, pendingPermission: undefined } : state;
}
