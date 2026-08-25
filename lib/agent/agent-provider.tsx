import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { AppState as RNAppState } from "react-native";

import { ArtifactStore } from "./artifacts";
import { AgentError, withRetry } from "./errors";
import { failureFromError } from "./failures";
import { getIntegrationDef, INTEGRATION_DEFS, integrationForToolId, validateIntegrationToken } from "./integrations";
import { McpClient } from "./mcp";
import { pickDefaultModel, selectModel } from "./model-router";
import { type AgentTool, DEFAULT_LIMITS, type PendingToolCall, type PermissionGate, runAgentLoop } from "./orchestrator";
import { Planner } from "./planner";
import { ProviderRegistry } from "./providers";
import { assertSafeRemoteUrl, makeId, safeErrorMessage } from "./security";
import { makeCustomSkill, selectSkills, skillModelRequirement, validateSkillInput } from "./skills";
import { isSubAgentRole, runSubAgent, SUBAGENT_ROLES } from "./subagents";
import { queuedRunIds, recoverInterruptedRuns } from "./recovery";
import { CredentialManager, initialAppState, LocalStateRepository } from "./storage";
import { executeWebExtractLinks, executeWebFetch, executeWebSearch, makeArtifactName, safeCalculate, sanitizeTextTransform, ToolRegistry } from "./tools";
import { addUsage, emptyTotals, estimateCostUsd } from "./usage";
import type { ActivityEvent, AgentRun, AgentTask, AppState, Artifact, ChatMessage, IntegrationId, McpAuthType, McpServerConfig, ModelRequirement, PermissionDecision, PermissionRequest, ProviderConnection, ProviderId, ProviderMessage, ProviderUsage, RunStatus, Skill, TaskGraph, TaskKind, TaskStatus, ToolResult, Workspace } from "./types";

// Safety bounds so a run can never spend unboundedly or loop forever.
const MAX_TRANSIENT_RETRIES = 2;

interface ConnectInput {
  key: string;
  provider?: ProviderId;
  label?: string;
  defaultModel?: string;
}

interface McpInput {
  name: string;
  endpoint: string;
  authType: McpAuthType;
  token?: string;
}

interface AgentContextValue {
  state: AppState;
  hydrated: boolean;
  supportedProviders: Array<{ id: ProviderId; label: string }>;
  activeWorkspace?: Workspace;
  connect: (input: ConnectInput) => Promise<ProviderConnection>;
  disconnect: (connectionId: string) => Promise<void>;
  setDefaultModel: (connectionId: string, modelId: string) => void;
  setModelOverride: (connectionId: string, requirement: ModelRequirement, modelId: string | undefined) => void;
  createWorkspace: (name: string, description?: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  submitInstruction: (instruction: string) => Promise<void>;
  resolvePermission: (decision: "allow_once" | "allow_project" | "deny") => Promise<void>;
  cancelRun: (runId: string) => void;
  retryRun: (runId: string) => Promise<void>;
  setOfflineMode: (value: boolean) => void;
  setDebugMode: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => Promise<void>;
  addMcpServer: (input: McpInput) => Promise<void>;
  discoverMcpTools: (serverId: string) => Promise<void>;
  invokeMcpTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;
  removeMcpServer: (serverId: string) => Promise<void>;
  setMcpServerEnabled: (serverId: string, enabled: boolean) => void;
  setSkillEnabled: (skillId: string, enabled: boolean) => void;
  addSkill: (input: { name: string; description?: string; instructions: string; keywords?: string[]; toolRequirements?: string[]; modelRequirement?: ModelRequirement }) => Skill;
  removeSkill: (skillId: string) => void;
  connectIntegration: (id: IntegrationId, token: string) => Promise<void>;
  disconnectIntegration: (id: IntegrationId) => Promise<void>;
  setIntegrationEnabled: (id: IntegrationId, enabled: boolean) => void;
  readArtifact: (artifact: Artifact) => Promise<string>;
  clearLocalData: () => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);
const now = () => new Date().toISOString();

function updateGraphTask(graph: TaskGraph, taskId: string, patch: Partial<AgentTask>): TaskGraph {
  return { ...graph, updatedAt: now(), tasks: graph.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: now() } : task)) };
}

export function AgentProvider({ children }: PropsWithChildren) {
  const repository = useMemo(() => new LocalStateRepository(), []);
  const credentials = useMemo(() => new CredentialManager(), []);
  const providers = useMemo(() => new ProviderRegistry(), []);
  const planner = useMemo(() => new Planner(), []);
  const tools = useMemo(() => new ToolRegistry(), []);
  const artifacts = useMemo(() => new ArtifactStore(), []);
  const mcp = useMemo(() => new McpClient(), []);
  const controllers = useRef(new Map<string, AbortController>());
  const oneTimeApprovals = useRef(new Set<string>());
  const [state, setState] = useState<AppState>(initialAppState);
  const stateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);

  const apply = useCallback((updater: (current: AppState) => AppState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    repository.load().then((raw) => {
      // Reclassify any run left mid-flight when the app died: resumable ones are queued
      // for auto-resume, the rest are marked failed. Without this a crashed/hung run stays
      // stuck at "running" forever across restarts.
      const loaded = recoverInterruptedRuns(raw);
      // Register the static integration tools so ids resolve for gating/dispatch;
      // exposure to the agent is decided by buildCatalog (enabled + connected only).
      INTEGRATION_DEFS.forEach((def) => def.tools.forEach((tool) => tools.register(tool)));
      // Rehydrate the in-memory tool registry with tools discovered in prior sessions
      // so MCP tools remain resolvable after a restart.
      for (const server of loaded.mcpServers) {
        if (server.enabled) server.discoveredTools.forEach((tool) => tools.register(tool));
      }
      stateRef.current = loaded;
      setState(loaded);
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, [repository, tools]);

  useEffect(() => {
    if (hydrated) repository.save(state).catch(() => undefined);
  }, [hydrated, repository, state]);

  // Keep the device awake only while a run is actively executing, so long tasks are
  // not killed by the screen locking while the app is foregrounded.
  useEffect(() => {
    const active = state.runs.some((run) => run.status === "running" || run.status === "planning");
    if (active) activateKeepAwakeAsync("oguzhanlab-run").catch(() => undefined);
    else deactivateKeepAwake("oguzhanlab-run").catch(() => undefined);
  }, [state.runs]);

  // Schedules a local notification, but only when enabled and the app is backgrounded
  // (foreground already shows live state). Best-effort; never throws into the runtime.
  const notify = useCallback(async (title: string, body: string) => {
    if (!stateRef.current.notificationsEnabled || RNAppState.currentState === "active") return;
    try {
      const perms = await Notifications.getPermissionsAsync();
      if (!perms.granted) return;
      await Notifications.scheduleNotificationAsync({ content: { title, body: body.slice(0, 180) }, trigger: null });
    } catch {
      // Notifications are a convenience; failure must never affect the run.
    }
  }, []);

  const addEvent = useCallback((input: Omit<ActivityEvent, "id" | "createdAt">) => {
    const event: ActivityEvent = { ...input, id: makeId("event"), createdAt: now() };
    apply((current) => ({ ...current, events: [...current.events, event].slice(-450) }));
    return event;
  }, [apply]);

  const updateRun = useCallback((runId: string, patch: Partial<AgentRun>) => {
    apply((current) => ({ ...current, runs: current.runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)) }));
  }, [apply]);

  const updateTask = useCallback((runId: string, taskId: string, patch: Partial<AgentTask>) => {
    apply((current) => ({ ...current, runs: current.runs.map((run) => (run.id === runId ? { ...run, graph: updateGraphTask(run.graph, taskId, patch) } : run)) }));
  }, [apply]);

  const addMessage = useCallback((message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage => {
    const item: ChatMessage = { ...message, id: makeId("message"), createdAt: now() };
    apply((current) => ({ ...current, messages: [...current.messages, item].slice(-600) }));
    return item;
  }, [apply]);

  const setRunStatus = useCallback((runId: string, status: RunStatus, error?: string) => {
    updateRun(runId, { status, ...(status === "completed" || status === "failed" || status === "cancelled" ? { completedAt: now() } : {}), ...(error ? { error } : {}) });
  }, [updateRun]);

  // Folds a single model call's token usage (plus an estimated cost) into the run total.
  const accrueUsage = useCallback((runId: string, provider: ProviderId, model: string, usage: ProviderUsage | undefined): ProviderUsage | undefined => {
    if (!usage) return undefined;
    const estimatedCostUsd = estimateCostUsd(provider, model, usage);
    const enriched: ProviderUsage = { ...usage, estimatedCostUsd };
    apply((current) => ({
      ...current,
      runs: current.runs.map((run) => (run.id === runId ? { ...run, usage: addUsage(run.usage ?? emptyTotals(), enriched) } : run)),
    }));
    return enriched;
  }, [apply]);

  const connect = useCallback(async ({ key, provider, label, defaultModel }: ConnectInput): Promise<ProviderConnection> => {
    const selected = provider ? providers.get(provider) : providers.detect(key);
    if (!selected) throw new Error("Sağlayıcı anahtar biçiminden algılanamadı. Lütfen sağlayıcıyı seçin.");
    if (!key.trim()) throw new Error("API anahtarı boş olamaz.");
    const result = await selected.validateCredential(key.trim());
    if (!result.valid) throw new Error(result.reason ?? "Bağlantı doğrulanamadı.");
    const credentialId = makeId("credential");
    const models = result.models;
    const connection: ProviderConnection = {
      id: makeId("connection"),
      provider: selected.id,
      label: label?.trim() || selected.label,
      credentialId,
      status: "connected",
      models,
      defaultModel: defaultModel && models.some((model) => model.id === defaultModel) ? defaultModel : pickDefaultModel(selected.id, models),
      createdAt: now(),
      lastValidatedAt: now(),
    };
    await credentials.saveCredential({ id: credentialId, provider: selected.id, label: connection.label, createdAt: connection.createdAt }, key.trim());
    apply((current) => ({ ...current, initialized: true, connections: [...current.connections, connection] }));
    return connection;
  }, [apply, credentials, providers]);

  const disconnect = useCallback(async (connectionId: string) => {
    const connection = stateRef.current.connections.find((item) => item.id === connectionId);
    if (!connection) return;
    await credentials.deleteCredential(connection.credentialId);
    apply((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== connectionId) }));
  }, [apply, credentials]);

  const setDefaultModel = useCallback((connectionId: string, modelId: string) => {
    apply((current) => ({ ...current, connections: current.connections.map((connection) => connection.id === connectionId ? { ...connection, defaultModel: modelId } : connection) }));
  }, [apply]);

  // Pins (or clears, when modelId is undefined) a specialist model for a requirement tier.
  const setModelOverride = useCallback((connectionId: string, requirement: ModelRequirement, modelId: string | undefined) => {
    apply((current) => ({
      ...current,
      connections: current.connections.map((connection) => {
        if (connection.id !== connectionId) return connection;
        const overrides = { ...(connection.modelOverrides ?? {}) };
        if (modelId) overrides[requirement] = modelId;
        else delete overrides[requirement];
        return { ...connection, modelOverrides: overrides };
      }),
    }));
  }, [apply]);

  const createWorkspace = useCallback((name: string, description?: string) => {
    const workspace: Workspace = { id: makeId("workspace"), name: name.trim() || "Yeni Workspace", description, createdAt: now(), updatedAt: now(), artifactIds: [], taskIds: [] };
    apply((current) => ({ ...current, activeWorkspaceId: workspace.id, workspaces: [...current.workspaces, workspace] }));
  }, [apply]);

  const selectWorkspace = useCallback((workspaceId: string) => apply((current) => ({ ...current, activeWorkspaceId: workspaceId })), [apply]);

  // Synchronous permission decision for a tool, honoring one-time and project-scoped grants.
  const gateFor = useCallback((runId: string, workspaceId: string, toolId: string): PermissionGate => {
    const definition = tools.get(toolId);
    if (!definition) return "deny";
    if (oneTimeApprovals.current.has(`${runId}:${toolId}`)) return "allow";
    const projectPolicy = stateRef.current.permissionPolicies[`${workspaceId}:${toolId}`];
    const globalPolicy = stateRef.current.permissionPolicies[`global:${toolId}`] ?? "ask";
    const policy = projectPolicy ?? globalPolicy;
    if (policy === "allow" && definition.risk !== "high" && definition.risk !== "critical") return "allow";
    if (policy === "deny") return "deny";
    return "ask";
  }, [tools]);

  // Builds the tool catalog offered to the agentic loop from the central registry.
  // Native, MCP and integration tools share one namespace; offline drops network
  // tools, and integration tools appear only when their integration is connected+enabled.
  const buildCatalog = useCallback((): AgentTool[] => {
    const offline = stateRef.current.offlineMode;
    const activeIntegrations = new Set(stateRef.current.integrations.filter((config) => config.enabled && config.connected).map((config) => config.id));
    // A discovered MCP tool is only offered while its server still exists and is enabled,
    // so a disabled or removed server can never leave callable tools in the catalog.
    const enabledMcpServers = new Set(stateRef.current.mcpServers.filter((server) => server.enabled).map((server) => server.id));
    const networkNative = new Set(["web.search", "web.fetch", "web.extractLinks", "agent.spawn"]);
    return tools.list()
      .filter((tool) => {
        if (offline && (networkNative.has(tool.id) || tool.source === "mcp" || tool.source === "integration")) return false;
        if (tool.source === "mcp") return enabledMcpServers.has(tool.id.split(".")[1] ?? "");
        if (tool.source === "integration") return activeIntegrations.has(tool.id.split(".")[0] as IntegrationId);
        return true;
      })
      .map((tool) => ({ id: tool.id, title: tool.title, description: tool.description, risk: tool.risk, inputSchema: tool.inputSchema }));
  }, [tools]);

  const outlineTask = useCallback((runId: string, kind: TaskKind): AgentTask | undefined => {
    return stateRef.current.runs.find((item) => item.id === runId)?.graph.tasks.find((task) => task.kind === kind);
  }, []);

  const executeRun = useCallback(async (runId: string) => {
    const run = stateRef.current.runs.find((item) => item.id === runId);
    if (!run) return;
    const connection = run.selectedConnectionId ? stateRef.current.connections.find((item) => item.id === run.selectedConnectionId) : undefined;
    if (!connection) {
      const message = "Bu görevi başlatmak için önce geçerli bir AI sağlayıcısı bağlayın.";
      setRunStatus(runId, "failed", message);
      addMessage({ workspaceId: run.workspaceId, runId, role: "agent", content: message, status: "error" });
      return;
    }
    const provider = providers.get(connection.provider);
    const key = await credentials.getCredential(connection.credentialId);
    if (!provider || !key) {
      setRunStatus(runId, "failed", "Sağlayıcı kimlik bilgisi bulunamadı. Bağlantıyı yeniden kurun.");
      return;
    }
    const controller = new AbortController();
    controllers.current.set(runId, controller);
    setRunStatus(runId, "running");

    const workspaceId = run.workspaceId;
    // Resolve the skills selected for this run; they inject expert instructions and can bias routing.
    const activeSkills = (run.activeSkillIds ?? []).map((id) => stateRef.current.skills.find((skill) => skill.id === id)).filter((skill): skill is Skill => Boolean(skill));
    // Only force a capability tier when an active skill needs it; a plain conversational
    // goal (no skill) uses the connection's chosen default model, which is fast/available
    // rather than an expensive reasoning model the key may not be able to run.
    const requirement: ModelRequirement | undefined = skillModelRequirement(activeSkills);
    const model = selectModel(connection.models, requirement, connection.defaultModel, requirement ? connection.modelOverrides?.[requirement] : undefined);
    if (model !== run.selectedModel) updateRun(runId, { selectedModel: model });

    // One reasoning turn: retried fully because a non-streaming model call has no side effects.
    // We emit a visible event before and after each call (with the model id) so a stalled
    // or failing provider is diagnosable from the activity feed instead of a silent "running".
    const callModel = async (messages: ProviderMessage[], signal: AbortSignal): Promise<string> => {
      addEvent({ runId, type: "ModelRequest", summary: `Model çağrılıyor: ${model}`, level: "info" });
      try {
        const response = await withRetry(() => provider.generate({ key, model, messages, signal }), {
          retries: MAX_TRANSIENT_RETRIES,
          signal,
          onRetry: (error, attempt, delay) => addEvent({ runId, type: "TaskRetried", summary: `Model isteği yeniden denenecek (${attempt}, ${Math.round(delay / 100) / 10}s): ${error.message}`, level: "warning" }),
        });
        accrueUsage(runId, connection.provider, model, response.usage);
        addEvent({ runId, type: "ModelResponse", summary: response.content.trim() ? `Model yanıtladı (${response.content.length} karakter).` : "Model boş yanıt döndürdü.", level: response.content.trim() ? "success" : "warning" });
        return response.content;
      } catch (error) {
        // Surface the classified reason so the failure is visible and actionable.
        const failure = failureFromError(error);
        addEvent({ runId, type: "TaskFailed", summary: `Model hatası: ${failure.message}`, level: "error" });
        throw error;
      }
    };

    // Executes a base (non-spawn) native/MCP/integration tool by id. Never throws for a normal tool error.
    const dispatchBase = async (toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      try {
        if (toolId === "web.search") {
          if (stateRef.current.offlineMode) return { ok: false, content: "", error: "Çevrimdışı modda web araştırması kullanılamaz." };
          const query = String(args.query ?? args.q ?? run.instruction);
          return await withRetry<ToolResult>(() => executeWebSearch(query, signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        }
        if (toolId === "web.fetch") {
          if (stateRef.current.offlineMode) return { ok: false, content: "", error: "Çevrimdışı modda web getirme kullanılamaz." };
          return await withRetry<ToolResult>(() => executeWebFetch(String(args.url ?? ""), signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        }
        if (toolId === "web.extractLinks") {
          if (stateRef.current.offlineMode) return { ok: false, content: "", error: "Çevrimdışı modda gezinme kullanılamaz." };
          return await withRetry<ToolResult>(() => executeWebExtractLinks(String(args.url ?? ""), signal), { retries: MAX_TRANSIENT_RETRIES, signal });
        }
        if (toolId === "calculator.evaluate") {
          return { ok: true, content: String(safeCalculate(String(args.expression ?? ""))) };
        }
        if (toolId === "text.transform") {
          const { title, filename } = sanitizeTextTransform(String(args.text ?? ""));
          return { ok: true, content: `title: ${title}\nfilename: ${filename}` };
        }
        if (toolId === "filesystem.writeMarkdown") {
          const content = String(args.content ?? "");
          if (!content.trim()) return { ok: false, content: "", error: "Yazılacak içerik boş olamaz." };
          const requested = String(args.filename ?? makeArtifactName(run.instruction));
          const artifact = await artifacts.writeMarkdown(workspaceId, runId, requested, content);
          apply((current) => ({
            ...current,
            artifacts: [...current.artifacts, artifact],
            workspaces: current.workspaces.map((workspace) => (workspace.id === workspaceId ? { ...workspace, updatedAt: now(), artifactIds: [...workspace.artifactIds, artifact.id] } : workspace)),
            runs: current.runs.map((item) => (item.id === runId ? { ...item, artifactIds: [...item.artifactIds, artifact.id] } : item)),
          }));
          addEvent({ runId, type: "ArtifactCreated", summary: `${artifact.name} oluşturuldu.`, level: "success" });
          return { ok: true, content: `Artifact kaydedildi: ${artifact.name}`, metadata: { artifactId: artifact.id } };
        }
        if (toolId.startsWith("mcp.")) {
          const rest = toolId.slice(4);
          const dot = rest.indexOf(".");
          const serverId = dot >= 0 ? rest.slice(0, dot) : rest;
          const toolName = dot >= 0 ? rest.slice(dot + 1) : "";
          const server = stateRef.current.mcpServers.find((item) => item.id === serverId);
          if (!server) return { ok: false, content: "", error: "MCP sunucusu bulunamadı." };
          if (!server.enabled) return { ok: false, content: "", error: "MCP sunucusu devre dışı." };
          const token = server.credentialId ? await credentials.getCredential(server.credentialId) : null;
          return await mcp.callTool(server, token, toolName, args);
        }
        const integration = integrationForToolId(toolId);
        if (integration) {
          if (stateRef.current.offlineMode) return { ok: false, content: "", error: "Çevrimdışı modda entegrasyon araçları kullanılamaz." };
          const config = stateRef.current.integrations.find((item) => item.id === integration.id);
          if (!config?.enabled || !config.connected) return { ok: false, content: "", error: `${integration.name} bağlı değil.` };
          const token = config.credentialId ? await credentials.getCredential(config.credentialId) : null;
          return await integration.execute(toolId, args, token, signal);
        }
        return { ok: false, content: "", error: `Bilinmeyen araç: ${toolId}` };
      } catch (error) {
        return { ok: false, content: "", error: safeErrorMessage(error) };
      }
    };

    // Bounded delegation to scoped, read-only sub-agents. Sub-agents reuse dispatchBase
    // (never runTool), so they structurally cannot spawn further sub-agents.
    const MAX_SUBAGENTS = 4;
    let subagentsUsed = 0;
    const spawnSubAgent = async (args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      if (stateRef.current.offlineMode) return { ok: false, content: "", error: "Çevrimdışı modda alt-agent çalıştırılamaz." };
      const role = String(args.role ?? "");
      const task = String(args.task ?? "");
      if (!isSubAgentRole(role)) return { ok: false, content: "", error: `Geçersiz rol: ${role}. Geçerli roller: ${Object.keys(SUBAGENT_ROLES).join(", ")}.` };
      if (subagentsUsed >= MAX_SUBAGENTS) return { ok: false, content: "", error: "Alt-agent sınırına ulaşıldı." };
      subagentsUsed += 1;
      updateRun(runId, { subagentCount: subagentsUsed });
      addEvent({ runId, type: "TaskStarted", summary: `${SUBAGENT_ROLES[role].name} başlatıldı: ${task.slice(0, 80)}`, level: "info", details: { role } });
      const result = await runSubAgent(role, task, {
        catalog: buildCatalog(),
        signal,
        deps: {
          callModel,
          dispatchTool: dispatchBase,
          emit: (summary, level) => addEvent({ runId, type: "ToolCallStarted", summary, level }),
        },
      });
      addEvent({ runId, type: "TaskCompleted", summary: result.ok ? `${SUBAGENT_ROLES[role].name} tamamlandı.` : `${SUBAGENT_ROLES[role].name} başarısız: ${result.error ?? ""}`, level: result.ok ? "success" : "warning" });
      return result;
    };

    // The tool the main agent actually calls: spawn is intercepted here; everything else
    // goes to dispatchBase. Sub-agents are given dispatchBase directly, so they never see this.
    const runTool = async (toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      if (toolId === "agent.spawn") return spawnSubAgent(args, signal);
      return dispatchBase(toolId, args, signal);
    };

    const deps = {
      callModel,
      runTool,
      checkPermission: (toolId: string): PermissionGate => gateFor(runId, workspaceId, toolId),
      emit: (event: { type: ActivityEvent["type"] | string; summary: string; level: ActivityEvent["level"]; details?: Record<string, unknown> }) =>
        addEvent({ runId, type: (event.type as ActivityEvent["type"]) ?? "ModelResponse", summary: event.summary, level: event.level, details: event.details }),
      // Durable checkpoint: persist transcript + counters at each clean boundary so a
      // run interrupted by app suspension resumes from here on next foreground.
      onProgress: (transcript: ProviderMessage[], steps: number, toolCalls: number) => updateRun(runId, { transcript, steps, toolCalls }),
    };

    // Mark the outline: understanding done, action stage active.
    const understand = outlineTask(runId, "analysis");
    const act = outlineTask(runId, "research");
    if (understand) updateTask(runId, understand.id, { status: "completed", output: "Hedef anlaşıldı." });
    if (act) updateTask(runId, act.id, { status: "running" });

    try {
      const resume = run.transcript?.length ? { transcript: run.transcript, approved: run.pendingToolCall, steps: run.steps ?? 0, toolCalls: run.toolCalls ?? 0 } : undefined;
      if (resume) updateRun(runId, { pendingToolCall: undefined });
      const skills = activeSkills.map((skill) => ({ name: skill.name, instructions: skill.instructions }));
      const outcome = await runAgentLoop(deps, { goal: run.instruction, tools: buildCatalog(), skills, limits: DEFAULT_LIMITS, signal: controller.signal, resume });

      if (outcome.status === "waiting_for_permission") {
        const definition = tools.get(outcome.pending.toolId);
        const request: PermissionRequest = { id: makeId("permission"), runId, workspaceId, taskId: act?.id ?? outcome.pending.toolId, toolId: outcome.pending.toolId, risk: definition?.risk ?? "medium", reason: outcome.pending.reason, createdAt: now() };
        updateRun(runId, { transcript: outcome.transcript, pendingToolCall: outcome.pending, steps: outcome.steps, toolCalls: outcome.toolCalls });
        if (act) updateTask(runId, act.id, { status: "waiting_for_permission" });
        apply((current) => ({ ...current, pendingPermission: request }));
        setRunStatus(runId, "waiting_for_permission");
        addEvent({ runId, taskId: act?.id, type: "PermissionRequested", summary: `${definition?.title ?? outcome.pending.toolId} için izin bekleniyor.`, level: "warning" });
        void notify("İzin gerekli", `${run.instruction.slice(0, 80)} — ${definition?.title ?? outcome.pending.toolId} için onay bekliyor.`);
        return;
      }

      const produce = outlineTask(runId, "generation");
      if (outcome.status === "completed") {
        addMessage({ workspaceId, runId, role: "agent", content: outcome.content, status: "complete" });
        updateRun(runId, { transcript: undefined, pendingToolCall: undefined, steps: outcome.steps, toolCalls: outcome.toolCalls });
        if (act) updateTask(runId, act.id, { status: "completed", output: `${outcome.toolCalls} araç çağrısı yapıldı.` });
        if (produce) updateTask(runId, produce.id, { status: "completed", output: outcome.content.slice(0, 400) });
        setRunStatus(runId, "completed");
        addEvent({ runId, type: "VerificationCompleted", summary: "Agent görevi tamamladı.", level: "success" });
        void notify("Görev tamamlandı", run.instruction);
      } else {
        const reason = outcome.error;
        if (act) updateTask(runId, act.id, { status: "failed", error: reason });
        setRunStatus(runId, "failed", reason);
        addEvent({ runId, type: "TaskFailed", summary: reason, level: "error" });
        addMessage({ workspaceId, runId, role: "agent", content: `Görev tamamlanamadı: ${reason}`, status: "error" });
        void notify("Görev başarısız", reason);
      }
    } catch (error) {
      const reason = safeErrorMessage(error);
      if (error instanceof DOMException && error.name === "AbortError") {
        if (act) updateTask(runId, act.id, { status: "failed", error: "Durduruldu." });
        setRunStatus(runId, "cancelled", reason);
        addEvent({ runId, type: "TaskFailed", summary: "Görev kullanıcı tarafından durduruldu.", level: "warning" });
      } else {
        if (act) updateTask(runId, act.id, { status: "failed", error: reason });
        setRunStatus(runId, "failed", reason);
        addEvent({ runId, type: "TaskFailed", summary: reason, level: "error" });
        addMessage({ workspaceId, runId, role: "agent", content: `Görev tamamlanamadı: ${reason}`, status: "error" });
        void notify("Görev başarısız", reason);
      }
    } finally {
      controllers.current.delete(runId);
    }
  }, [accrueUsage, addEvent, addMessage, apply, artifacts, buildCatalog, credentials, gateFor, mcp, notify, outlineTask, providers, setRunStatus, tools, updateRun, updateTask]);

  // Resumes durable runs left queued by app suspension. Skips any run already executing.
  const resumeQueuedRuns = useCallback(() => {
    for (const id of queuedRunIds(stateRef.current)) {
      if (controllers.current.has(id)) continue;
      setRunStatus(id, "planning");
      void executeRun(id);
    }
  }, [executeRun, setRunStatus]);

  // On cold start (once hydrated) and whenever the app returns to the foreground,
  // resume any queued runs. This is the honest "background" model: work is durable and
  // continues as soon as the app is active again (mobile OSes do not permit long-running
  // background JS — see BACKGROUND.md).
  useEffect(() => {
    if (!hydrated) return;
    resumeQueuedRuns();
    const subscription = RNAppState.addEventListener("change", (next) => {
      if (next === "active") resumeQueuedRuns();
    });
    return () => subscription.remove();
  }, [hydrated, resumeQueuedRuns]);

  const submitInstruction = useCallback(async (instruction: string) => {
    const text = instruction.trim();
    if (!text) throw new Error("Görev açıklaması boş olamaz.");
    let workspace = stateRef.current.workspaces.find((item) => item.id === stateRef.current.activeWorkspaceId);
    if (!workspace) {
      workspace = { id: makeId("workspace"), name: "İlk Workspace", description: "Agent çalışma alanı", createdAt: now(), updatedAt: now(), artifactIds: [], taskIds: [] };
      apply((current) => ({ ...current, activeWorkspaceId: workspace!.id, workspaces: [...current.workspaces, workspace!] }));
    }
    const graph = planner.createOutline(text);
    const connection = stateRef.current.connections.find((item) => item.status === "connected");
    // Auto-select the most relevant enabled skills for this goal.
    const activeSkills = selectSkills(stateRef.current.skills, text);
    const run: AgentRun = { id: makeId("run"), workspaceId: workspace.id, instruction: text, graph, status: "planning", selectedConnectionId: connection?.id, activeSkillIds: activeSkills.map((skill) => skill.id), startedAt: now(), artifactIds: [] };
    apply((current) => ({ ...current, runs: [...current.runs, run], workspaces: current.workspaces.map((item) => item.id === workspace!.id ? { ...item, updatedAt: now(), taskIds: [...item.taskIds, ...graph.tasks.map((task) => task.id)] } : item) }));
    addMessage({ workspaceId: workspace.id, runId: run.id, role: "user", content: text, status: "complete" });
    addEvent({ runId: run.id, type: "AgentStarted", summary: "Agent hedefi alındı.", level: "info" });
    if (activeSkills.length) addEvent({ runId: run.id, type: "PlanCreated", summary: `Yetenekler etkin: ${activeSkills.map((skill) => skill.name).join(", ")}.`, level: "info" });
    void executeRun(run.id);
  }, [addEvent, addMessage, apply, executeRun, planner]);

  const resolvePermission = useCallback(async (decision: "allow_once" | "allow_project" | "deny") => {
    const pending = stateRef.current.pendingPermission;
    if (!pending) return;
    apply((current) => ({ ...current, pendingPermission: undefined, ...(decision === "allow_project" ? { permissionPolicies: { ...current.permissionPolicies, [`${pending.workspaceId}:${pending.toolId}`]: "allow" as PermissionDecision } } : {}) }));
    if (decision === "deny") {
      // Let the agent adapt: append a denial observation and resume the loop without the tool.
      const run = stateRef.current.runs.find((item) => item.id === pending.runId);
      const deniedTranscript: ProviderMessage[] = [
        ...(run?.transcript ?? []),
        { role: "user", content: `ARAÇ SONUCU (güvenilmeyen veri):\n"${pending.toolId}" için kullanıcı iznini reddetti. Bu araç olmadan devam et ya da bitir.` },
      ];
      updateRun(pending.runId, { transcript: deniedTranscript, pendingToolCall: undefined });
      addEvent({ runId: pending.runId, taskId: pending.taskId, type: "PermissionRequested", summary: "İzin reddedildi; agent araçsız devam ediyor.", level: "warning" });
      setRunStatus(pending.runId, "planning");
      void executeRun(pending.runId);
      return;
    }
    if (decision === "allow_once") {
      oneTimeApprovals.current.add(`${pending.runId}:${pending.toolId}`);
    }
    setRunStatus(pending.runId, "planning");
    void executeRun(pending.runId);
  }, [addEvent, apply, executeRun, setRunStatus, updateRun]);

  const cancelRun = useCallback((runId: string) => controllers.current.get(runId)?.abort(), []);
  const retryRun = useCallback(async (runId: string) => {
    const run = stateRef.current.runs.find((item) => item.id === runId);
    if (!run || !["failed", "cancelled"].includes(run.status)) return;
    apply((current) => ({ ...current, runs: current.runs.map((item) => item.id === runId ? { ...item, status: "planning", error: undefined, completedAt: undefined, transcript: undefined, pendingToolCall: undefined, steps: undefined, toolCalls: undefined, graph: { ...item.graph, tasks: item.graph.tasks.map((task) => ({ ...task, status: "pending" as TaskStatus, error: undefined })) } } : item) }));
    void executeRun(runId);
  }, [apply, executeRun]);
  const setOfflineMode = useCallback((value: boolean) => apply((current) => ({ ...current, offlineMode: value })), [apply]);
  const setDebugMode = useCallback((value: boolean) => apply((current) => ({ ...current, debugMode: value })), [apply]);
  const setNotificationsEnabled = useCallback(async (value: boolean) => {
    if (value) {
      try {
        const result = await Notifications.requestPermissionsAsync();
        if (!result.granted) throw new Error("Bildirim izni verilmedi. Cihaz ayarlarından etkinleştirin.");
      } catch (error) {
        // Surface a permission failure but still record intent so the toggle reflects the OS state next time.
        apply((current) => ({ ...current, notificationsEnabled: false }));
        throw error instanceof Error ? error : new Error("Bildirim izni alınamadı.");
      }
    }
    apply((current) => ({ ...current, notificationsEnabled: value }));
  }, [apply]);

  const addMcpServer = useCallback(async ({ name, endpoint, authType, token }: McpInput) => {
    // Reject unsafe endpoints (non-HTTPS, private ranges, embedded credentials) before storing anything.
    assertSafeRemoteUrl(endpoint.trim());
    let credentialId: string | undefined;
    if (token?.trim()) {
      credentialId = makeId("mcpcredential");
      await credentials.saveCredential({ id: credentialId, provider: "local", label: `${name} MCP token`, createdAt: now() }, token.trim());
    }
    const server: McpServerConfig = { id: makeId("mcp"), name: name.trim() || "MCP Server", endpoint: endpoint.trim(), transport: "streamable-http", authType, credentialId, enabled: true, status: "disconnected", discoveredTools: [], createdAt: now() };
    apply((current) => ({ ...current, mcpServers: [...current.mcpServers, server] }));
  }, [apply, credentials]);

  const discoverMcpTools = useCallback(async (serverId: string) => {
    const server = stateRef.current.mcpServers.find((item) => item.id === serverId);
    if (!server) return;
    try {
      const token = server.credentialId ? await credentials.getCredential(server.credentialId) : null;
      const discoveredTools = await mcp.discoverTools(server, token);
      // Replace (not accumulate) this server's registered tools so a re-discovery that
      // drops or renames tools cannot leave stale ids behind.
      tools.replaceMcpServerTools(serverId, discoveredTools);
      apply((current) => ({ ...current, mcpServers: current.mcpServers.map((item) => item.id === serverId ? { ...item, status: "connected", discoveredTools, lastConnectedAt: now(), lastError: undefined } : item) }));
    } catch (error) {
      apply((current) => ({ ...current, mcpServers: current.mcpServers.map((item) => item.id === serverId ? { ...item, status: "error", lastError: mcp.safeError(error) } : item) }));
    }
  }, [apply, credentials, mcp, tools]);

  // Invokes a discovered MCP tool. This is a user-initiated action (explicit consent);
  // the returned content is treated as untrusted data and never executed as instructions.
  const invokeMcpTool = useCallback(async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const server = stateRef.current.mcpServers.find((item) => item.id === serverId);
    if (!server) return { ok: false, content: "", error: "MCP sunucusu bulunamadı." };
    if (!server.enabled) return { ok: false, content: "", error: "MCP sunucusu devre dışı." };
    const token = server.credentialId ? await credentials.getCredential(server.credentialId) : null;
    return mcp.callTool(server, token, toolName, args);
  }, [credentials, mcp]);

  const removeMcpServer = useCallback(async (serverId: string) => {
    const server = stateRef.current.mcpServers.find((item) => item.id === serverId);
    if (server?.credentialId) await credentials.deleteCredential(server.credentialId);
    // Drop the server's tools from the live registry so they can't be offered/called
    // after removal, then clear its config and stored credential.
    tools.replaceMcpServerTools(serverId, []);
    apply((current) => ({ ...current, mcpServers: current.mcpServers.filter((item) => item.id !== serverId) }));
  }, [apply, credentials, tools]);

  // Per-server enable/disable policy. A disabled server's tools are dropped from the
  // catalog (buildCatalog) and refused at dispatch, without deleting its config/token.
  const setMcpServerEnabled = useCallback((serverId: string, enabled: boolean) => {
    apply((current) => ({ ...current, mcpServers: current.mcpServers.map((item) => (item.id === serverId ? { ...item, enabled } : item)) }));
  }, [apply]);

  const setSkillEnabled = useCallback((skillId: string, enabled: boolean) => {
    apply((current) => ({ ...current, skills: current.skills.map((skill) => (skill.id === skillId ? { ...skill, enabled } : skill)) }));
  }, [apply]);

  const addSkill = useCallback((input: { name: string; description?: string; instructions: string; keywords?: string[]; toolRequirements?: string[]; modelRequirement?: ModelRequirement }): Skill => {
    // Reject an invalid/oversized manifest with a clear reason before installing it.
    const validation = validateSkillInput(input);
    if (!validation.ok) throw new AgentError(validation.reason, "client", { retryable: false });
    const skill = makeCustomSkill(input);
    apply((current) => ({ ...current, skills: [...current.skills, skill] }));
    return skill;
  }, [apply]);

  const removeSkill = useCallback((skillId: string) => {
    // Built-in skills can be disabled but not deleted, so they can always return.
    apply((current) => ({ ...current, skills: current.skills.filter((skill) => skill.id !== skillId || skill.builtin) }));
  }, [apply]);

  // Connects a native integration: validates the token where possible, stores it in the
  // secure credential layer (never in app state), and enables its tools.
  const connectIntegration = useCallback(async (id: IntegrationId, token: string) => {
    const def = getIntegrationDef(id);
    if (!def) throw new Error("Bilinmeyen entegrasyon.");
    if (def.requiresToken && !token.trim()) throw new Error("Token boş olamaz.");
    const check = await validateIntegrationToken(id, token.trim());
    if (!check.ok) throw new Error(check.reason ?? "Kimlik doğrulaması başarısız.");
    const existing = stateRef.current.integrations.find((item) => item.id === id);
    if (existing?.credentialId) await credentials.deleteCredential(existing.credentialId);
    const credentialId = makeId("integration");
    await credentials.saveCredential({ id: credentialId, provider: "local", label: `${def.name} token`, createdAt: now() }, token.trim());
    apply((current) => ({ ...current, integrations: current.integrations.map((item) => (item.id === id ? { ...item, connected: true, enabled: true, credentialId, lastError: undefined } : item)) }));
  }, [apply, credentials]);

  const disconnectIntegration = useCallback(async (id: IntegrationId) => {
    const config = stateRef.current.integrations.find((item) => item.id === id);
    if (config?.credentialId) await credentials.deleteCredential(config.credentialId);
    apply((current) => ({ ...current, integrations: current.integrations.map((item) => (item.id === id ? { ...item, connected: false, enabled: false, credentialId: undefined, lastError: undefined } : item)) }));
  }, [apply, credentials]);

  const setIntegrationEnabled = useCallback((id: IntegrationId, enabled: boolean) => {
    apply((current) => ({ ...current, integrations: current.integrations.map((item) => (item.id === id ? { ...item, enabled: enabled && item.connected } : item)) }));
  }, [apply]);

  const clearLocalData = useCallback(async () => {
    const credentialIndex = await credentials.listCredentials();
    await Promise.all(credentialIndex.map((item) => credentials.deleteCredential(item.id)));
    await repository.clear();
    const fresh = initialAppState();
    stateRef.current = fresh;
    setState(fresh);
  }, [credentials, repository]);

  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
  const value = useMemo<AgentContextValue>(() => ({ state, hydrated, supportedProviders: providers.getSupported(), activeWorkspace, connect, disconnect, setDefaultModel, setModelOverride, createWorkspace, selectWorkspace, submitInstruction, resolvePermission, cancelRun, retryRun, setOfflineMode, setDebugMode, setNotificationsEnabled, addMcpServer, discoverMcpTools, invokeMcpTool, removeMcpServer, setMcpServerEnabled, setSkillEnabled, addSkill, removeSkill, connectIntegration, disconnectIntegration, setIntegrationEnabled, readArtifact: (artifact) => artifacts.read(artifact), clearLocalData }), [activeWorkspace, addMcpServer, addSkill, artifacts, cancelRun, clearLocalData, connect, connectIntegration, createWorkspace, disconnect, disconnectIntegration, discoverMcpTools, hydrated, invokeMcpTool, providers, removeMcpServer, setMcpServerEnabled, removeSkill, resolvePermission, retryRun, selectWorkspace, setDebugMode, setDefaultModel, setIntegrationEnabled, setModelOverride, setNotificationsEnabled, setOfflineMode, setSkillEnabled, state, submitInstruction]);
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) throw new Error("useAgent AgentProvider içinde kullanılmalıdır.");
  return context;
}
