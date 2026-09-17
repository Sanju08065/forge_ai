import {
  SFNClient,
  StartExecutionCommand,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
  DescribeExecutionCommand,
} from '@aws-sdk/client-sfn';

const sfn = new SFNClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

const STATE_MACHINE_ARN = process.env['FORGEAI_STATE_MACHINE_ARN'] ?? '';

// ─── Start a new workflow execution ──────────────────────────────────────────

export async function startWorkflowExecution(
  projectId: string,
  input: Record<string, unknown>
): Promise<string> {
  const result = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `forgeai-${projectId}-${Date.now()}`,
      input: JSON.stringify({ projectId, ...input }),
    })
  );
  return result.executionArn ?? '';
}

// ─── Callback: signal a waiting state ────────────────────────────────────────

export async function sendTaskSuccess(
  taskToken: string,
  output: Record<string, unknown>
): Promise<void> {
  await sfn.send(
    new SendTaskSuccessCommand({
      taskToken,
      output: JSON.stringify(output),
    })
  );
}

export async function sendTaskFailure(
  taskToken: string,
  error: string,
  cause: string
): Promise<void> {
  await sfn.send(new SendTaskFailureCommand({ taskToken, error, cause }));
}

// ─── Describe execution ───────────────────────────────────────────────────────

export async function describeExecution(executionArn: string): Promise<{
  status: string;
  input: string;
  output?: string;
}> {
  const r = await sfn.send(new DescribeExecutionCommand({ executionArn }));
  return {
    status: r.status ?? 'UNKNOWN',
    input: r.input ?? '{}',
    output: r.output,
  };
}
