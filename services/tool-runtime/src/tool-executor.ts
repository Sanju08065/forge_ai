import type { ToolName } from '@forgeai/types';
import { writeFile, readFile, deleteFile, listFiles } from './tools/file-tools';
import { queryCloudWatchLogs, getCloudWatchMetrics, getRecentErrors } from './tools/cloudwatch-tools';
import { triggerCodeBuild, getBuildStatus } from './tools/codebuild-tools';
import { updateEcsService, getEcsServiceHealth } from './tools/ecs-tools';
import { runHealthCheck, runE2EVerification } from './tools/health-check';

// ─── Central tool dispatcher ──────────────────────────────────────────────────
// Agents call this function. It dispatches to the correct tool implementation.
// The policy gateway MUST be checked before calling this.

export async function executeTool(
  toolName: ToolName,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'write_file':
      await writeFile(input['path'] as string, input['content'] as string);
      return { ok: true, path: input['path'] };

    case 'read_file': {
      const content = await readFile(input['path'] as string);
      return { content };
    }

    case 'delete_file':
      await deleteFile(input['path'] as string);
      return { ok: true };

    case 'list_files': {
      const files = await listFiles((input['path'] as string) ?? '.');
      return { files };
    }

    case 'query_cloudwatch_logs': {
      if (input['preset'] === 'recent_errors') {
        const result = await getRecentErrors(
          input['logGroupName'] as string,
          (input['minutesBack'] as number) ?? 15
        );
        return result as unknown as Record<string, unknown>;
      }
      const result = await queryCloudWatchLogs(input as never);
      return result as unknown as Record<string, unknown>;
    }

    case 'get_cloudwatch_metrics': {
      const result = await getCloudWatchMetrics(input as never);
      return result as unknown as Record<string, unknown>;
    }

    case 'trigger_codebuild': {
      const result = await triggerCodeBuild(input as never);
      return result;
    }

    case 'get_build_status': {
      const result = await getBuildStatus(input['codeBuildId'] as string);
      return result as unknown as Record<string, unknown>;
    }

    case 'update_ecs_service':
      await updateEcsService(input as never);
      return { ok: true };

    case 'get_ecs_service_health': {
      const result = await getEcsServiceHealth(input['environment'] as string);
      return result;
    }

    default:
      throw new Error(`Unknown tool: ${String(toolName)}`);
  }
}
