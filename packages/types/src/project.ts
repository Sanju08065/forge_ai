import type { ISOTimestamp, ULID, AuditMeta } from './common';

// ─── Project ─────────────────────────────────────────────────────────────────

export type ProjectStatus =
  | 'pending'
  | 'requirements'
  | 'architecture'
  | 'coding'
  | 'testing'
  | 'building'
  | 'deploying'
  | 'running'
  | 'failed'
  | 'repairing'
  | 'repaired'
  | 'idle'
  | 'suspended'
  | 'completed';

export interface Project extends AuditMeta {
  projectId: ULID;
  name: string;
  description: string;
  originalPrompt: string;
  status: ProjectStatus;
  ownerId: string;
  repositoryUrl?: string;
  workspacePath?: string;
  deploymentUrl?: string;
  stepFunctionsExecutionArn?: string;
  ecsTaskArn?: string;
  tags: Record<string, string>;
}

// ─── Requirement ─────────────────────────────────────────────────────────────

export type RequirementPriority = 'must-have' | 'should-have' | 'nice-to-have';

export interface Requirement extends AuditMeta {
  requirementId: ULID;
  projectId: ULID;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: RequirementPriority;
  status: 'pending' | 'implemented' | 'tested' | 'verified';
  agentId: string;
}

// ─── Architecture Decision Record ────────────────────────────────────────────

export interface ArchitectureDecision extends AuditMeta {
  adrId: ULID;
  projectId: ULID;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  consequences: string[];
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
}

export interface ProjectArchitecture {
  projectId: ULID;
  stack: TechStack;
  dataModel: DataModel;
  apiDesign: ApiDesign;
  deploymentTopology: DeploymentTopology;
  securityModel: SecurityModel;
  decisions: ArchitectureDecision[];
}

export interface TechStack {
  language: string;
  framework: string;
  runtime: string;
  database: string;
  cacheLayer?: string;
  testFramework: string;
}

export interface DataModel {
  entities: EntityDefinition[];
}

export interface EntityDefinition {
  name: string;
  attributes: Record<string, string>;
  primaryKey: string;
  sortKey?: string;
  indexes?: string[];
}

export interface ApiDesign {
  baseUrl: string;
  version: string;
  endpoints: EndpointDefinition[];
  authType: 'jwt' | 'api-key' | 'none';
}

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  requiresAuth: boolean;
}

export interface DeploymentTopology {
  provider: 'aws';
  region: string;
  compute: 'ecs-fargate' | 'lambda' | 'app-runner';
  database: 'dynamodb' | 'rds-postgres';
  containerPort: number;
  healthCheckPath: string;
}

export interface SecurityModel {
  authenticationMethod: string;
  jwtExpirySeconds: number;
  rateLimiting: boolean;
  httpsOnly: boolean;
}

// ─── File Metadata ────────────────────────────────────────────────────────────

export interface FileMetadata extends AuditMeta {
  fileId: ULID;
  projectId: ULID;
  path: string;           // relative to workspace root e.g. "src/routes/tasks.ts"
  contentHash: string;    // SHA-256 of file content
  agentId: string;
  requirementIds: ULID[];
  testIds: ULID[];
  lastCommit?: string;    // git SHA
  sizeBytes: number;
}
