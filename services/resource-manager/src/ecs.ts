import {
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  DescribeTasksCommand,
  UpdateServiceCommand,
  DescribeServicesCommand,
  RegisterTaskDefinitionCommand,
  type ContainerOverride,
} from '@aws-sdk/client-ecs';

const ecs = new ECSClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

const CLUSTER_ARN        = process.env['ECS_CLUSTER_ARN'] ?? '';
const DEVELOPER_TASK_DEF = process.env['ECS_DEV_TASK_DEFINITION'] ?? 'forgeai-dev-runtime';
const APP_SERVICE_NAME   = process.env['ECS_APP_SERVICE_NAME'] ?? 'forgeai-app';
const SUBNET_IDS         = (process.env['VPC_PRIVATE_SUBNET_IDS'] ?? '').split(',');
const SECURITY_GROUP_ID  = process.env['ECS_SECURITY_GROUP_ID'] ?? '';
const EFS_ACCESS_POINT   = process.env['EFS_ACCESS_POINT_ID'] ?? '';

// ─── Start a developer workspace task ────────────────────────────────────────

export async function startWorkspaceTask(
  projectId: string,
  overrides?: ContainerOverride[]
): Promise<string> {
  const result = await ecs.send(
    new RunTaskCommand({
      cluster: CLUSTER_ARN,
      taskDefinition: DEVELOPER_TASK_DEF,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: SUBNET_IDS,
          securityGroups: [SECURITY_GROUP_ID],
          assignPublicIp: 'DISABLED',
        },
      },
      overrides: {
        containerOverrides: overrides ?? [
          {
            name: 'dev-runtime',
            environment: [{ name: 'PROJECT_ID', value: projectId }],
          },
        ],
      },
      tags: [
        { key: 'forgeai:projectId', value: projectId },
        { key: 'forgeai:type', value: 'dev-workspace' },
      ],
    })
  );

  const taskArn = result.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error('Failed to start workspace task — no taskArn returned');
  return taskArn;
}

// ─── Stop workspace task ──────────────────────────────────────────────────────

export async function stopWorkspaceTask(taskArn: string, reason: string): Promise<void> {
  await ecs.send(new StopTaskCommand({ cluster: CLUSTER_ARN, task: taskArn, reason }));
}

// ─── Get workspace task status ────────────────────────────────────────────────

export async function getTaskStatus(taskArn: string): Promise<{
  status: string;
  healthStatus?: string;
  stoppedReason?: string;
}> {
  const result = await ecs.send(
    new DescribeTasksCommand({ cluster: CLUSTER_ARN, tasks: [taskArn] })
  );
  const task = result.tasks?.[0];
  if (!task) throw new Error(`Task ${taskArn} not found`);
  return {
    status: task.lastStatus ?? 'UNKNOWN',
    healthStatus: task.healthStatus,
    stoppedReason: task.stoppedReason,
  };
}

// ─── Deploy new app image to ECS service ─────────────────────────────────────

export async function deployAppImage(
  imageUri: string,
  environment: 'development' | 'staging' | 'production',
  envVars: Record<string, string>
): Promise<void> {
  const serviceName = `${APP_SERVICE_NAME}-${environment}`;

  // Register a new task definition revision with the updated image + env vars
  const newTaskDef = await ecs.send(
    new RegisterTaskDefinitionCommand({
      family: `forgeai-app-${environment}`,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: '512',
      memory: '1024',
      executionRoleArn: process.env['ECS_EXECUTION_ROLE_ARN'],
      taskRoleArn: process.env['ECS_TASK_ROLE_ARN'],
      containerDefinitions: [
        {
          name: 'app',
          image: imageUri,
          portMappings: [{ containerPort: 3000, protocol: 'tcp' }],
          environment: Object.entries(envVars).map(([name, value]) => ({ name, value })),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': `/ecs/forgeai-app-${environment}`,
              'awslogs-region': process.env['AWS_REGION'] ?? 'us-east-1',
              'awslogs-stream-prefix': 'app',
            },
          },
          healthCheck: {
            command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 60,
          },
        },
      ],
    })
  );

  const newRevision = newTaskDef.taskDefinition?.taskDefinitionArn;
  if (!newRevision) throw new Error('Failed to register new task definition');

  // Force new deployment on the service
  await ecs.send(
    new UpdateServiceCommand({
      cluster: CLUSTER_ARN,
      service: serviceName,
      taskDefinition: newRevision,
      forceNewDeployment: true,
      deploymentConfiguration: {
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
    })
  );
}

// ─── Get ECS service health ───────────────────────────────────────────────────

export async function getServiceHealth(
  environment: 'development' | 'staging' | 'production'
): Promise<{ running: number; pending: number; desired: number; status: string }> {
  const serviceName = `${APP_SERVICE_NAME}-${environment}`;
  const result = await ecs.send(
    new DescribeServicesCommand({ cluster: CLUSTER_ARN, services: [serviceName] })
  );
  const service = result.services?.[0];
  if (!service) throw new Error(`Service ${serviceName} not found`);
  return {
    running: service.runningCount ?? 0,
    pending: service.pendingCount ?? 0,
    desired: service.desiredCount ?? 0,
    status: service.status ?? 'UNKNOWN',
  };
}
