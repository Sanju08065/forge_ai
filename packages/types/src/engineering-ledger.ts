import type { ISOTimestamp, ULID } from './common';
import type { AgentId } from './agent';

// ─── Engineering Ledger ───────────────────────────────────────────────────────
// The full traceable record of every significant event in a project's lifecycle.

export type LedgerEventType =
  | 'PROJECT_CREATED'
  | 'REQUIREMENT_EXTRACTED'
  | 'ARCHITECTURE_DESIGNED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'FILE_CREATED'
  | 'FILE_MODIFIED'
  | 'AGENT_DECISION'
  | 'BUILD_STARTED'
  | 'BUILD_SUCCEEDED'
  | 'BUILD_FAILED'
  | 'DEPLOYMENT_STARTED'
  | 'DEPLOYMENT_SUCCEEDED'
  | 'DEPLOYMENT_FAILED'
  | 'HEALTH_CHECK_PASSED'
  | 'HEALTH_CHECK_FAILED'
  | 'INCIDENT_DETECTED'
  | 'DIAGNOSIS_COMPLETE'
  | 'REPAIR_PROPOSED'
  | 'REPAIR_APPROVED'
  | 'REPAIR_REJECTED'
  | 'REPAIR_APPLIED'
  | 'REPAIR_VERIFIED'
  | 'LIFECYCLE_COMPLETE'
  | 'HUMAN_INTERVENTION_REQUIRED';

export interface LedgerEvent {
  eventId: ULID;
  projectId: ULID;
  type: LedgerEventType;
  timestamp: ISOTimestamp;
  agentId?: AgentId;
  actorId: string;               // agentId or 'user' or 'system'
  summary: string;               // one-line human-readable description
  detail: Record<string, unknown>; // structured payload specific to event type
  linkedEntityId?: ULID;         // ID of requirement, task, build, deployment, etc.
  linkedEntityType?: string;
  parentEventId?: ULID;          // for sub-events in a chain
}

export interface EngineeringLedger {
  projectId: ULID;
  events: LedgerEvent[];
  lastUpdated: ISOTimestamp;
  totalEvents: number;
  summary: LedgerSummary;
}

export interface LedgerSummary {
  requirementsExtracted: number;
  filesGenerated: number;
  buildsRun: number;
  buildsSucceeded: number;
  deployments: number;
  incidentsDetected: number;
  repairsApplied: number;
  repairsSucceeded: number;
  totalAgentTokensUsed: number;
  totalCostUsd: number;
  lifecycleCompletedAt?: ISOTimestamp;
}
