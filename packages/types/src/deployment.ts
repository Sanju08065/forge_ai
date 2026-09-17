import type { ISOTimestamp, ULID, HealthStatus } from './common';

// ─── Deployment ───────────────────────────────────────────────────────────────

export type DeploymentStatus =
  | 'pending'
  | 'in_progress'
  | 'succeeded'
  | 'failed'
  | 'rolled_back';

export interface Deployment {
  deploymentId: ULID;
  projectId: ULID;
  buildId: ULID;
  environment: string;
  version: string;
  imageUri: string;
  status: DeploymentStatus;
  ecsServiceArn?: string;
  ecsClusterArn?: string;
  loadBalancerUrl?: string;
  health: HealthStatus;
  healthCheckUrl?: string;
  startedAt: ISOTimestamp;
  completedAt?: ISOTimestamp;
  failureReason?: string;
  rollbackDeploymentId?: ULID;
}

// ─── Incident ─────────────────────────────────────────────────────────────────

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Incident {
  incidentId: ULID;
  projectId: ULID;
  deploymentId: ULID;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  evidence: IncidentEvidence;
  hypotheses: FailureHypothesis[];
  status: 'open' | 'diagnosing' | 'repairing' | 'resolved' | 'wont_fix';
  detectedAt: ISOTimestamp;
  resolvedAt?: ISOTimestamp;
}

export interface IncidentEvidence {
  errorMessages: string[];
  stackTraces: string[];
  logExcerpts: LogExcerpt[];
  metrics: MetricSnapshot[];
  deploymentEvents: string[];
  failingHealthChecks: string[];
  gitDiff?: string;
}

export interface LogExcerpt {
  timestamp: ISOTimestamp;
  logGroup: string;
  logStream: string;
  message: string;
  level: 'ERROR' | 'WARN' | 'INFO';
}

export interface MetricSnapshot {
  metricName: string;
  namespace: string;
  value: number;
  unit: string;
  timestamp: ISOTimestamp;
}

export interface FailureHypothesis {
  hypothesisId: ULID;
  description: string;
  confidence: number;        // 0.0 – 1.0
  evidence: string[];
  proposedFix: string;
  agentId: string;
}

// ─── Repair ───────────────────────────────────────────────────────────────────

export type RepairType =
  | 'env_var_missing'
  | 'env_var_wrong_value'
  | 'code_bug'
  | 'dependency_missing'
  | 'config_error'
  | 'iac_error'
  | 'permission_error'
  | 'resource_limit'
  | 'other';

export interface Repair {
  repairId: ULID;
  projectId: ULID;
  incidentId: ULID;
  repairType: RepairType;
  description: string;
  patchDetails: PatchDetail[];
  criticReview?: CriticReview;
  validationResults?: ValidationResult[];
  deploymentId?: ULID;        // deployment that applied this repair
  status: 'proposed' | 'approved' | 'rejected' | 'applied' | 'verified' | 'failed';
  proposedAt: ISOTimestamp;
  appliedAt?: ISOTimestamp;
  verifiedAt?: ISOTimestamp;
}

export interface PatchDetail {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'config';
  description: string;
  before?: string;
  after?: string;
}

export interface CriticReview {
  approved: boolean;
  concerns: string[];
  missingVerifications: string[];
  riskLevel: 'low' | 'medium' | 'high';
  reviewedAt: ISOTimestamp;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  message: string;
}
