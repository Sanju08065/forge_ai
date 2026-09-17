import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Project, AgentTask, WorkflowState, LedgerEvent } from '@forgeai/types';

const client = new DynamoDBClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = process.env['DYNAMODB_TABLE_NAME'] ?? '';

// ─── Key patterns (single-table design) ──────────────────────────────────────
export const K = {
  project:      (id: string) => ({ PK: `PROJECT#${id}`, SK: 'METADATA' }),
  workflow:     (id: string) => ({ PK: `PROJECT#${id}`, SK: 'WORKFLOW' }),
  task:         (pid: string, tid: string) => ({ PK: `PROJECT#${pid}`, SK: `TASK#${tid}` }),
  ledgerEvent:  (pid: string, eid: string) => ({ PK: `PROJECT#${pid}`, SK: `EVENT#${eid}` }),
  build:        (pid: string, bid: string) => ({ PK: `PROJECT#${pid}`, SK: `BUILD#${bid}` }),
  deployment:   (pid: string, did: string) => ({ PK: `PROJECT#${pid}`, SK: `DEPLOY#${did}` }),
  incident:     (pid: string, iid: string) => ({ PK: `PROJECT#${pid}`, SK: `INCIDENT#${iid}` }),
  repair:       (pid: string, rid: string) => ({ PK: `PROJECT#${pid}`, SK: `REPAIR#${rid}` }),
};

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export async function putProject(project: Project): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...K.project(project.projectId), ...project } }));
}

export async function getProject(projectId: string): Promise<Project | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: K.project(projectId) }));
  if (!r.Item) return null;
  const { PK: _pk, SK: _sk, ...rest } = r.Item;
  return rest as Project;
}

export async function updateProjectStatus(projectId: string, status: Project['status']): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: K.project(projectId),
    UpdateExpression: 'SET #s = :s, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':u': new Date().toISOString() },
  }));
}

export async function listProjects(): Promise<Project[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI1',  // GSI1PK = 'ALL_PROJECTS', GSI1SK = createdAt
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'ALL_PROJECTS' },
    ScanIndexForward: false,
    Limit: 50,
  }));
  return (r.Items ?? []) as Project[];
}

// ─── Workflow state ───────────────────────────────────────────────────────────

export async function putWorkflowState(state: WorkflowState): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...K.workflow(state.projectId), ...state } }));
}

export async function getWorkflowState(projectId: string): Promise<WorkflowState | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: K.workflow(projectId) }));
  if (!r.Item) return null;
  const { PK: _pk, SK: _sk, ...rest } = r.Item;
  return rest as WorkflowState;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export async function putTask(task: AgentTask): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...K.task(task.projectId, task.taskId), ...task } }));
}

export async function getProjectTasks(projectId: string): Promise<AgentTask[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': `PROJECT#${projectId}`, ':prefix': 'TASK#' },
  }));
  return (r.Items ?? []) as AgentTask[];
}

// ─── Ledger events ────────────────────────────────────────────────────────────

export async function appendLedgerEvent(event: LedgerEvent): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...K.ledgerEvent(event.projectId, event.eventId), ...event } }));
}

export async function getLedgerEvents(projectId: string): Promise<LedgerEvent[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': `PROJECT#${projectId}`, ':prefix': 'EVENT#' },
    ScanIndexForward: true,
  }));
  return (r.Items ?? []) as LedgerEvent[];
}
