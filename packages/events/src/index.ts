// ─── ForgeAI EventBridge Event Schemas ───────────────────────────────────────
// All events published to the ForgeAI event bus.
// Source: "forgeai.platform"
// EventBus: forgeai-events

import type { ULID, ISOTimestamp } from '@forgeai/types';

// ─── Base envelope ────────────────────────────────────────────────────────────

export interface ForgeAIEvent<T = Record<string, unknown>> {
  source: 'forgeai.platform';
  'detail-type': ForgeAIEventType;
  detail: T & {
    eventId: ULID;
    projectId: ULID;
    timestamp: ISOTimestamp;
  };
}

export type ForgeAIEventType =
  | 'ForgeAI.Project.Created'
  | 'ForgeAI.Project.StatusChanged'
  | 'ForgeAI.Workflow.PhaseChanged'
  | 'ForgeAI.Build.StateChanged'
  | 'ForgeAI.Deployment.StateChanged'
  | 'ForgeAI.HealthCheck.Failed'
  | 'ForgeAI.HealthCheck.Passed'
  | 'ForgeAI.Incident.Detected'
  | 'ForgeAI.Repair.Proposed'
  | 'ForgeAI.Repair.Applied'
  | 'ForgeAI.Repair.Verified'
  | 'ForgeAI.Lifecycle.Complete'
  | 'ForgeAI.Agent.TaskStarted'
  | 'ForgeAI.Agent.TaskCompleted'
  | 'ForgeAI.Agent.TaskFailed'
  | 'ForgeAI.Policy.ActionDenied'
  | 'ForgeAI.HumanApproval.Required';

// ─── Typed event detail shapes ────────────────────────────────────────────────

export interface ProjectCreatedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  name: string;
  ownerId: string;
  originalPrompt: string;
}

export interface BuildStateChangedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  buildId: ULID;
  codeBuildId: string;
  previousStatus: string;
  newStatus: string;
  imageUri?: string;
}

export interface DeploymentStateChangedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  deploymentId: ULID;
  previousStatus: string;
  newStatus: string;
  loadBalancerUrl?: string;
  failureReason?: string;
}

export interface IncidentDetectedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  incidentId: ULID;
  severity: string;
  title: string;
  deploymentId: ULID;
}

export interface RepairAppliedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  repairId: ULID;
  incidentId: ULID;
  repairType: string;
  description: string;
}

export interface PolicyActionDeniedDetail {
  eventId: ULID;
  projectId: ULID;
  timestamp: ISOTimestamp;
  agentId: string;
  action: string;
  reason: string;
  riskLevel: string;
}

// ─── EventBridge rule patterns ────────────────────────────────────────────────
// These are the filter patterns used when creating EventBridge rules via CDK.

export const EVENT_PATTERNS = {
  BUILD_FAILED: {
    source: ['forgeai.platform'],
    'detail-type': ['ForgeAI.Build.StateChanged'],
    detail: { newStatus: ['FAILED'] },
  },
  DEPLOYMENT_FAILED: {
    source: ['forgeai.platform'],
    'detail-type': ['ForgeAI.Deployment.StateChanged'],
    detail: { newStatus: ['failed'] },
  },
  HEALTH_CHECK_FAILED: {
    source: ['forgeai.platform'],
    'detail-type': ['ForgeAI.HealthCheck.Failed'],
  },
  REPAIR_COMPLETE: {
    source: ['forgeai.platform'],
    'detail-type': ['ForgeAI.Repair.Verified'],
  },
  HUMAN_APPROVAL_REQUIRED: {
    source: ['forgeai.platform'],
    'detail-type': ['ForgeAI.HumanApproval.Required'],
  },
} as const;
