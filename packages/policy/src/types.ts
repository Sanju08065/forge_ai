import type { AgentId, ToolName } from '@forgeai/types';

// ─── Policy types ─────────────────────────────────────────────────────────────

export type PolicyDecision = 'allow' | 'deny' | 'require_human_approval';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyRequest {
  requestId: string;
  agentId: AgentId;
  projectId: string;
  toolName: ToolName;
  toolInput: Record<string, unknown>;
  environment: 'development' | 'staging' | 'production';
  timestamp: string;
}

export interface PolicyResponse {
  requestId: string;
  decision: PolicyDecision;
  riskLevel: RiskLevel;
  reason: string;
  matchedRuleId?: string;
  requiresApprovalFrom?: string;  // e.g. "project-owner"
}

export interface PolicyRule {
  ruleId: string;
  description: string;
  priority: number;               // lower = higher priority
  condition: PolicyCondition;
  decision: PolicyDecision;
  riskLevel: RiskLevel;
  reason: string;
}

export interface PolicyCondition {
  agents?: AgentId[];             // match these agents (undefined = all)
  tools?: ToolName[];             // match these tools (undefined = all)
  environments?: string[];        // match these environments
  inputMatchers?: InputMatcher[];
}

export interface InputMatcher {
  field: string;                  // dot-path into toolInput e.g. "tableName"
  operator: 'equals' | 'contains' | 'startsWith' | 'matches';
  value: string;
}
