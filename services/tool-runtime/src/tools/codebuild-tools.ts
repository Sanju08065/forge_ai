import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
  type BuildPhase,
} from '@aws-sdk/client-codebuild';
import type { Build, BuildStatus } from '@forgeai/types';
import { ulid } from 'ulid';

const cb = new CodeBuildClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

export async function triggerCodeBuild(input: {
  projectName: string;
  sourceVersion?: string;
  environmentVariables?: Record<string, string>;
}): Promise<{ codeBuildId: string; buildId: string }> {
  const result = await cb.send(
    new StartBuildCommand({
      projectName: input.projectName,
      sourceVersion: input.sourceVersion,
      environmentVariablesOverride: input.environmentVariables
        ? Object.entries(input.environmentVariables).map(([name, value]) => ({
            name,
            value,
            type: 'PLAINTEXT' as const,
          }))
        : undefined,
    })
  );

  const codeBuildId = result.build?.id;
  if (!codeBuildId) throw new Error('CodeBuild did not return a build id');
  return { codeBuildId, buildId: ulid() };
}

export async function getBuildStatus(codeBuildId: string): Promise<Partial<Build>> {
  const result = await cb.send(new BatchGetBuildsCommand({ ids: [codeBuildId] }));
  const build = result.builds?.[0];
  if (!build) throw new Error(`Build ${codeBuildId} not found`);

  const status = mapBuildStatus(build.buildStatus ?? '');

  return {
    codeBuildId,
    status,
    phases: (build.phases ?? []).map((p: BuildPhase) => ({
      phaseName: p.phaseType ?? '',
      status: (p.phaseStatus ?? 'IN_PROGRESS') as Build['phases'][0]['status'],
      durationSeconds: p.durationInSeconds ?? undefined,
    })),
    logs: build.logs?.deepLink ?? '',
    imageUri: build.exportedEnvironmentVariables?.find((v) => v.name === 'IMAGE_URI')?.value,
  };
}

function mapBuildStatus(status: string): BuildStatus {
  const map: Record<string, BuildStatus> = {
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    STOPPED: 'STOPPED',
    TIMED_OUT: 'TIMED_OUT',
    IN_PROGRESS: 'IN_PROGRESS',
  };
  return map[status] ?? 'IN_PROGRESS';
}
