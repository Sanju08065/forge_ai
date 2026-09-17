import type { ISOTimestamp, ULID } from './common';

// ─── Step Functions workflow state ───────────────────────────────────────────

export type WorkflowPhase =
  | 'INIT'
  | 'EXTRACT_REQUIREMENTS'
  | 'DESIGN_ARCHITECTURE'
  | 'CREATE_TASK_GRAPH'
  | 'START_WORKSPACE'
  | 'GENERATE_CODE'
  | 'GENERATE_TESTS'
  | 'VALIDATE_CODE'
  | 'TRIGGER_BUILD'
  | 'WAIT_FOR_BUILD'
  | 'GENERATE_INFRASTRUCTURE'
  | 'DEPLOY'
  | 'WAIT_FOR_DEPLOYMENT'
  | 'RUN_HEALTH_CHECK'
  | 'COLLECT_EVIDENCE'
  | 'DIAGNOSE_FAILURE'
  | 'GENERATE_REPAIR'
  | 'CRITIQUE_REPAIR'
  | 'APPLY_REPAIR'
  | 'VERIFY_REPAIR'
  | 'COMPLETE'
  | 'FAILED'
  | 'AWAITING_HUMAN';

export interface WorkflowState {
  executionArn: string;
  projectId: ULID;
  phase: WorkflowPhase;
  previousPhase?: WorkflowPhase;
  repairAttempts: number;
  maxRepairAttempts: number;
  startedAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  completedAt?: ISOTimestamp;
  error?: WorkflowError;
  taskToken?: string;           // Step Functions callback token
}

export interface WorkflowError {
  phase: WorkflowPhase;
  errorCode: string;
  errorMessage: string;
  timestamp: ISOTimestamp;
  recoverable: boolean;
}

// ─── Build ────────────────────────────────────────────────────────────────────

export type BuildStatus = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'STOPPED' | 'TIMED_OUT';

export interface Build {
  buildId: ULID;
  projectId: ULID;
  codeBuildId: string;
  commitSha?: string;
  branch: string;
  status: BuildStatus;
  phases: BuildPhaseResult[];
  testResults?: TestSummary;
  artifactUri?: string;
  imageUri?: string;
  startedAt: ISOTimestamp;
  completedAt?: ISOTimestamp;
  durationSeconds?: number;
  logs: string;                 // CloudWatch Logs URL
}

export interface BuildPhaseResult {
  phaseName: string;
  status: 'SUCCEEDED' | 'FAILED' | 'IN_PROGRESS' | 'QUEUED';
  durationSeconds?: number;
  exitCode?: number;
  contexts?: BuildPhaseContext[];
}

export interface BuildPhaseContext {
  message: string;
  statusCode: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coveragePercent?: number;
  failedTests?: string[];
}
