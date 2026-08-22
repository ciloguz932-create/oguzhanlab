export const PROVIDERS = ["openai", "anthropic", "openrouter", "gemini", "local"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type ConnectionState = "unconfigured" | "connected" | "error";
export type TaskStatus =
  | "pending"
  | "planning"
  | "running"
  | "waiting_for_permission"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";
export type TaskKind = "analysis" | "research" | "generation" | "artifact" | "verification";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ModelRequirement = "fast" | "reasoning" | "coding" | "vision";
export type PermissionDecision = "ask" | "allow" | "deny";
export type RunStatus = "idle" | "queued" | "planning" | "running" | "waiting_for_permission" | "completed" | "failed" | "cancelled";
export type ArtifactKind = "markdown" | "text" | "json" | "code" | "report";
export type McpTransport = "streamable-http" | "stdio";
export type McpAuthType = "none" | "bearer" | "oauth-pkce";

export interface ProviderModel {
  id: string;
  label: string;
  capabilities: Array<"chat" | "streaming" | "tools" | "vision" | "reasoning" | "structured-output">;
}

export interface ProviderConnection {
  id: string;
  provider: ProviderId;
  label: string;
  credentialId: string;
  status: ConnectionState;
  models: ProviderModel[];
  defaultModel: string;
  // User-pinned specialist model per requirement tier; overrides router heuristics.
  modelOverrides?: Partial<Record<ModelRequirement, string>>;
  createdAt: string;
  lastValidatedAt?: string;
  lastError?: string;
}

export interface CredentialMetadata {
  id: string;
  provider: ProviderId;
  label: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  artifactIds: string[];
  taskIds: string[];
}

export interface AgentTask {
  id: string;
  parentId?: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: number;
  dependencies: string[];
  toolRequirements: string[];
  modelRequirement?: ModelRequirement;
  input: string;
  output?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskGraph {
  id: string;
  rootTaskId: string;
  tasks: AgentTask[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  runId: string;
  taskId?: string;
  type:
    | "AgentStarted"
    | "PlanCreated"
    | "TaskStarted"
    | "ToolCallStarted"
    | "ToolCallCompleted"
    | "ModelRequest"
    | "ModelResponse"
    | "PermissionRequested"
    | "TaskFailed"
    | "TaskRetried"
    | "TaskCompleted"
    | "ArtifactCreated"
    | "VerificationCompleted";
  summary: string;
  level: "info" | "success" | "warning" | "error";
  createdAt: string;
  details?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  workspaceId: string;
  taskId?: string;
  name: string;
  kind: ArtifactKind;
  uri?: string;
  preview: string;
  size: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  workspaceId: string;
  runId?: string;
  role: "user" | "agent" | "system";
  content: string;
  status?: "streaming" | "complete" | "error";
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  keywords: string[];
  toolRequirements: string[];
  modelRequirement?: ModelRequirement;
  builtin: boolean;
  enabled: boolean;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  hasCost: boolean;
}

export interface AgentRun {
  id: string;
  workspaceId: string;
  instruction: string;
  graph: TaskGraph;
  status: RunStatus;
  selectedConnectionId?: string;
  selectedModel?: string;
  activeSkillIds?: string[];
  subagentCount?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  artifactIds: string[];
  usage?: RunUsage;
  // Agentic-loop state persisted for permission suspend/resume and restart recovery.
  transcript?: ProviderMessage[];
  pendingToolCall?: { toolId: string; args: Record<string, unknown>; reason: string };
  steps?: number;
  toolCalls?: number;
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  source: "native" | "mcp" | "plugin" | "provider" | "integration";
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
}

export type IntegrationId = "github" | "email";

export interface IntegrationConfig {
  id: IntegrationId;
  enabled: boolean;
  connected: boolean;
  credentialId?: string;
  createdAt: string;
  lastError?: string;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PermissionRequest {
  id: string;
  runId: string;
  workspaceId: string;
  taskId: string;
  toolId: string;
  risk: RiskLevel;
  reason: string;
  createdAt: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  endpoint?: string;
  transport: McpTransport;
  authType: McpAuthType;
  credentialId?: string;
  enabled: boolean;
  status: "disconnected" | "connected" | "error";
  discoveredTools: ToolDefinition[];
  createdAt: string;
  lastConnectedAt?: string;
  lastError?: string;
}

export interface AppState {
  version: 1;
  initialized: boolean;
  activeWorkspaceId?: string;
  workspaces: Workspace[];
  connections: ProviderConnection[];
  runs: AgentRun[];
  messages: ChatMessage[];
  events: ActivityEvent[];
  artifacts: Artifact[];
  mcpServers: McpServerConfig[];
  skills: Skill[];
  integrations: IntegrationConfig[];
  permissionPolicies: Record<string, PermissionDecision>;
  pendingPermission?: PermissionRequest;
  offlineMode: boolean;
  debugMode: boolean;
  notificationsEnabled: boolean;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface ProviderResponse {
  content: string;
  usage?: ProviderUsage;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  detectKey(key: string): boolean;
  listModels(key: string): Promise<ProviderModel[]>;
  validateCredential(key: string): Promise<{ valid: boolean; reason?: string; models: ProviderModel[] }>;
  generate(input: { key: string; model: string; messages: ProviderMessage[]; signal?: AbortSignal }): Promise<ProviderResponse>;
  stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined>;
}
