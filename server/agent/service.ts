import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { withRetry } from "../../lib/agent/errors";
import { selectModel } from "../../lib/agent/model-router";
import { type AgentTool, type PermissionGate, runAgentLoop } from "../../lib/agent/orchestrator";
import { ProviderRegistry } from "../../lib/agent/providers";
import { safeErrorMessage, sanitizeFileName } from "../../lib/agent/security";
import { seedSkills, selectSkills, skillModelRequirement } from "../../lib/agent/skills";
import { isSubAgentRole, runSubAgent, SUBAGENT_ROLES } from "../../lib/agent/subagents";
import { executeWebExtractLinks, executeWebFetch, executeWebSearch, makeArtifactName, nativeTools, safeCalculate, sanitizeTextTransform } from "../../lib/agent/tools";
import { addUsage, emptyTotals, estimateCostUsd, type UsageTotals } from "../../lib/agent/usage";
import type { ProviderId, ProviderMessage, Skill, ToolResult } from "../../lib/agent/types";

const MAX_TRANSIENT_RETRIES = 2;
const MAX_SUBAGENTS = 4;
const MAX_EVENTS = 500;

// Tools the API allows by default: read-only native tools, workspace-scoped writes,
// and delegation. Callers widen this per-run via `allowedTools`.
const DEFAULT_ALLOWED = ["web.search", "web.fetch", "web.extractLinks", "calculator.evaluate", "text.transform", "filesystem.writeMarkdown", "agent.spawn"];

export type ServerRunStatus = "running" | "completed" | "failed";

export interface RunEvent {
  type: string;
  summary: string;
  level: "info" | "success" | "warning" | "error";
  at: string;
}

export interface RunArtifact {
  name: string;
  path: string;
  size: number;
}

export interface RunRecord {
  id: string;
  status: ServerRunStatus;
  instruction: string;
  provider: ProviderId;
  model?: string;
  skills: string[];
  events: RunEvent[];
  usage: UsageTotals;
  result?: string;
  error?: string;
  artifacts: RunArtifact[];
  createdAt: string;
  completedAt?: string;
}

export interface CreateRunInput {
  instruction: string;
  apiKey: string;
  provider?: ProviderId;
  model?: string;
  allowedTools?: string[];
  skills?: Skill[];
}

type Listener = (event: RunEvent | { type: "done"; record: RunRecord }) => void;

/** Public view of a run — never includes credentials. */
export function publicRun(record: RunRecord): Omit<RunRecord, never> {
  return { ...record, events: [...record.events], artifacts: [...record.artifacts] };
}

/**
 * Server-side agent runner. Reuses the same RN-free core the mobile app uses
 * (orchestrator, providers, tools, skills, sub-agents). Stateless w.r.t. credentials:
 * the API key is supplied per request and never stored. Runs are kept in memory for
 * the process lifetime (see AGENT_API.md for the durability roadmap).
 */
export class AgentService {
  private readonly registry = new ProviderRegistry();
  private readonly runs = new Map<string, RunRecord>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly artifactRoot: string;
  private readonly builtinSkills: Skill[];

  constructor(options?: { artifactRoot?: string; skills?: Skill[] }) {
    this.artifactRoot = options?.artifactRoot ?? path.join(process.cwd(), "artifacts");
    this.builtinSkills = options?.skills ?? seedSkills();
  }

  getRun(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  listRuns(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  subscribe(id: string, listener: Listener): () => void {
    const set = this.listeners.get(id) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(id, set);
    return () => set.delete(listener);
  }

  private emit(record: RunRecord, event: Omit<RunEvent, "at">): void {
    const full: RunEvent = { ...event, at: new Date().toISOString() };
    record.events.push(full);
    if (record.events.length > MAX_EVENTS) record.events.splice(0, record.events.length - MAX_EVENTS);
    this.listeners.get(record.id)?.forEach((listener) => listener(full));
  }

  private finish(record: RunRecord): void {
    this.listeners.get(record.id)?.forEach((listener) => listener({ type: "done", record: publicRun(record) }));
  }

  /** Validates the credential, then starts asynchronous execution. Returns the initial record. */
  async createRun(input: CreateRunInput): Promise<RunRecord> {
    const instruction = input.instruction?.trim();
    if (!instruction) throw new Error("instruction is required");
    if (!input.apiKey?.trim()) throw new Error("apiKey is required");
    const adapter = input.provider ? this.registry.get(input.provider) : this.registry.detect(input.apiKey.trim());
    if (!adapter) throw new Error("Provider could not be detected from the key; pass `provider` explicitly.");
    const validation = await adapter.validateCredential(input.apiKey.trim());
    if (!validation.valid) throw new Error(validation.reason ?? "Credential validation failed.");

    const skills = input.skills ?? this.builtinSkills;
    const activeSkills = selectSkills(skills, instruction);
    const record: RunRecord = {
      id: randomUUID(),
      status: "running",
      instruction,
      provider: adapter.id,
      skills: activeSkills.map((skill) => skill.name),
      events: [],
      usage: emptyTotals(),
      artifacts: [],
      createdAt: new Date().toISOString(),
    };
    this.runs.set(record.id, record);
    // Fire and forget; execution updates the record and notifies listeners.
    void this.execute(record, input, adapter, validation.models, activeSkills);
    return record;
  }

  private async execute(
    record: RunRecord,
    input: CreateRunInput,
    adapter: ReturnType<ProviderRegistry["get"]>,
    models: import("../../lib/agent/types").ProviderModel[],
    activeSkills: Skill[],
  ): Promise<void> {
    if (!adapter) return;
    const key = input.apiKey.trim();
    const allowed = new Set(input.allowedTools?.length ? input.allowedTools : DEFAULT_ALLOWED);
    const requirement = skillModelRequirement(activeSkills) ?? "reasoning";
    const defaultModel = models[0]?.id ?? "";
    const model = input.model && models.some((m) => m.id === input.model) ? input.model : selectModel(models, requirement, defaultModel);
    record.model = model;

    const controller = new AbortController();

    const accrue = (usage: import("../../lib/agent/types").ProviderUsage | undefined) => {
      if (!usage) return;
      record.usage = addUsage(record.usage, { ...usage, estimatedCostUsd: estimateCostUsd(record.provider, model, usage) });
    };

    const callModel = async (messages: ProviderMessage[], signal: AbortSignal): Promise<string> => {
      const response = await withRetry(() => adapter.generate({ key, model, messages, signal }), { retries: MAX_TRANSIENT_RETRIES, signal });
      accrue(response.usage);
      return response.content;
    };

    const dispatchBase = async (toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      try {
        if (toolId === "web.search") return await withRetry<ToolResult>(() => executeWebSearch(String(args.query ?? args.q ?? record.instruction), signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        if (toolId === "web.fetch") return await withRetry<ToolResult>(() => executeWebFetch(String(args.url ?? ""), signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        if (toolId === "web.extractLinks") return await withRetry<ToolResult>(() => executeWebExtractLinks(String(args.url ?? ""), signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        if (toolId === "calculator.evaluate") return { ok: true, content: String(safeCalculate(String(args.expression ?? ""))) };
        if (toolId === "text.transform") {
          const { title, filename } = sanitizeTextTransform(String(args.text ?? ""));
          return { ok: true, content: `title: ${title}\nfilename: ${filename}` };
        }
        if (toolId === "filesystem.writeMarkdown") {
          const content = String(args.content ?? "");
          if (!content.trim()) return { ok: false, content: "", error: "Content is empty." };
          const name = sanitizeFileName(String(args.filename ?? makeArtifactName(record.instruction)), "agent-output.md");
          const dir = path.join(this.artifactRoot, record.id);
          await mkdir(dir, { recursive: true });
          const filePath = path.join(dir, name);
          await writeFile(filePath, content, "utf8");
          const size = Buffer.byteLength(content, "utf8");
          record.artifacts.push({ name, path: filePath, size });
          this.emit(record, { type: "ArtifactCreated", summary: `${name} created.`, level: "success" });
          return { ok: true, content: `Artifact saved: ${name}`, metadata: { name } };
        }
        return { ok: false, content: "", error: `Unknown or unsupported tool: ${toolId}` };
      } catch (error) {
        return { ok: false, content: "", error: safeErrorMessage(error) };
      }
    };

    let subagentsUsed = 0;
    const runTool = async (toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      if (toolId !== "agent.spawn") return dispatchBase(toolId, args, signal);
      const role = String(args.role ?? "");
      const task = String(args.task ?? "");
      if (!isSubAgentRole(role)) return { ok: false, content: "", error: `Invalid role: ${role}.` };
      if (subagentsUsed >= MAX_SUBAGENTS) return { ok: false, content: "", error: "Sub-agent limit reached." };
      subagentsUsed += 1;
      this.emit(record, { type: "TaskStarted", summary: `${SUBAGENT_ROLES[role].name}: ${task.slice(0, 80)}`, level: "info" });
      const result = await runSubAgent(role, task, {
        catalog: this.catalog(allowed),
        signal,
        deps: { callModel, dispatchTool: dispatchBase, emit: (summary, level) => this.emit(record, { type: "ToolCallStarted", summary, level }) },
      });
      this.emit(record, { type: "TaskCompleted", summary: result.ok ? `${SUBAGENT_ROLES[role].name} done.` : `${SUBAGENT_ROLES[role].name} failed.`, level: result.ok ? "success" : "warning" });
      return result;
    };

    const checkPermission = (toolId: string): PermissionGate => (allowed.has(toolId) ? "allow" : "deny");

    try {
      this.emit(record, { type: "AgentStarted", summary: `Run started on ${record.provider} · ${model}.`, level: "info" });
      const outcome = await runAgentLoop(
        { callModel, runTool, checkPermission, emit: (event) => this.emit(record, { type: event.type, summary: event.summary, level: event.level }) },
        { goal: record.instruction, tools: this.catalog(allowed), skills: activeSkills.map((s) => ({ name: s.name, instructions: s.instructions })), signal: controller.signal },
      );
      if (outcome.status === "completed") {
        record.status = "completed";
        record.result = outcome.content;
        this.emit(record, { type: "VerificationCompleted", summary: "Run completed.", level: "success" });
      } else if (outcome.status === "waiting_for_permission") {
        // The stateless API cannot prompt; a disallowed tool is treated as denied upstream,
        // so this path only occurs if a caller-allowed tool still gates — surface it plainly.
        record.status = "failed";
        record.error = `Run paused for permission on ${outcome.pending.toolId}, which the API cannot grant interactively.`;
      } else {
        record.status = "failed";
        record.error = outcome.error;
      }
    } catch (error) {
      record.status = "failed";
      record.error = safeErrorMessage(error);
    } finally {
      record.completedAt = new Date().toISOString();
      this.finish(record);
    }
  }

  /** Builds the tool catalog for the API from native tools, filtered by the allow set. */
  private catalog(allowed: Set<string>): AgentTool[] {
    return nativeTools
      .filter((tool) => allowed.has(tool.id))
      .map((tool) => ({ id: tool.id, title: tool.title, description: tool.description, risk: tool.risk, inputSchema: tool.inputSchema }));
  }
}
