import type { ISOTimestamp, ULID } from './common';

// ─── Agent identity ───────────────────────────────────────────────────────────

export type AgentId =
  | 'supervisor'
  | 'product'
  | 'architect'
  | 'coding'
  | 'testing'
  | 'devops'
  | 'security'
  | 'sre'
  | 'repair'
  | 'critic';

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed';

export interface AgentContext {
  projectId: ULID;
  taskId: ULID;
  agentId: AgentId;
  sessionId: string;
  workspaceRoot: string;
  maxTokens: number;
  temperature: number;
  modelId: string;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AgentTask {
  taskId: ULID;
  projectId: ULID;
  agentId: AgentId;
  title: string;
  description: string;
  status: TaskStatus;
  dependencies: ULID[];        // taskIds that must complete first
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startedAt?: ISOTimestamp;
  completedAt?: ISOTimestamp;
  failedAt?: ISOTimestamp;
  failureReason?: string;
  retryCount: number;
  maxRetries: number;
}

// ─── Agent decision ───────────────────────────────────────────────────────────

export interface AgentDecision {
  decisionId: ULID;
  projectId: ULID;
  taskId: ULID;
  agentId: AgentId;
  timestamp: ISOTimestamp;
  reasoning: string;
  selectedOption: string;
  alternatives: string[];
  confidence: number;           // 0.0 – 1.0
  evidenceSources: string[];    // paths, URLs, log references
}

// ─── Tool call ────────────────────────────────────────────────────────────────

export type ToolName =
  | 'write_file'
  | 'read_file'
  | 'delete_file'
  | 'list_files'
  | 'run_command'
  | 'git_commit'
  | 'git_push'
  | 'query_cloudwatch_logs'
  | 'get_cloudwatch_metrics'
  | 'trigger_codebuild'
  | 'get_build_status'
  | 'update_ecs_service'
  | 'get_ecs_service_health'
  | 'get_task_output'
  | 'store_decision'
  | 'update_task_status';

export interface ToolCall {
  toolCallId: string;
  toolName: ToolName;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  timestamp: ISOTimestamp;
}

// ─── Agent run ────────────────────────────────────────────────────────────────

export interface AgentRun {
  runId: ULID;
  projectId: ULID;
  taskId: ULID;
  agentId: AgentId;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: ToolCall[];
  startedAt: ISOTimestamp;
  completedAt?: ISOTimestamp;
  status: 'running' | 'completed' | 'failed';
  costUsd: number;
}

// ─── Bedrock model config ─────────────────────────────────────────────────────

export interface ModelConfig {
  modelId: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
  systemPrompt: string;
}

export const AGENT_MODEL_CONFIG: Record<AgentId, Omit<ModelConfig, 'systemPrompt'>> = {
  supervisor:  { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 4096,  temperature: 0.2 },
  product:     { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 8192,  temperature: 0.3 },
  architect:   { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 8192,  temperature: 0.1 },
  coding:      { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 16384, temperature: 0.0 },
  testing:     { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 8192,  temperature: 0.0 },
  devops:      { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 8192,  temperature: 0.0 },
  security:    { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 4096,  temperature: 0.0 },
  sre:         { modelId: 'anthropic.claude-sonnet-5-20260630-v1:0', maxTokens: 4096,  temperature: 0.1 },
  repair:      { modelId: 'anthropic.claude-opus-4-6-20260801-v1:0', maxTokens: 8192,  temperature: 0.0 },
  critic:      { modelId: 'anthropic.claude-opus-4-6-20260801-v1:0', maxTokens: 4096,  temperature: 0.2 },
};
