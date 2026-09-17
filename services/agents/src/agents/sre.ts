import type { IncidentEvidence } from '@forgeai/types';
import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';
import { getRecentErrors } from '@forgeai/tool-runtime';

const SYSTEM_PROMPT = `You are the SRE Agent for ForgeAI.
Your job is to collect evidence when a deployment fails or a health check fails.

You must:
1. Query CloudWatch Logs for recent errors (use query_cloudwatch_logs with preset: "recent_errors")
2. Check ECS service health with get_ecs_service_health
3. Collect stack traces, error messages, HTTP status codes
4. Summarise the evidence in a structured JSON format

Respond with JSON:
{
  "errorMessages": ["string"],
  "stackTraces": ["string"],
  "logExcerpts": [{"timestamp": "ISO", "message": "string", "level": "ERROR"}],
  "metrics": [],
  "deploymentEvents": ["string"],
  "failingHealthChecks": ["string"],
  "summary": "One paragraph describing what went wrong"
}`;

export async function runSreAgent(
  projectId: string,
  deploymentId: string,
  logGroupName: string,
  environment: string
): Promise<{ evidence: IncidentEvidence; summary: string; inputTokens: number; outputTokens: number }> {
  const result = await converse({
    agentId: 'sre',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Collect failure evidence for deployment ${deploymentId} in project ${projectId}.
Log group: ${logGroupName}
Environment: ${environment}

Query CloudWatch logs for recent errors, check ECS service health, then summarise the evidence.`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS.filter((t) =>
      ['query_cloudwatch_logs', 'get_ecs_service_health'].includes(t.toolSpec?.name ?? '')
    ),
    onToolCall: async (toolName, input) => {
      const policy = await checkPolicy('sre', projectId, toolName, input);
      if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);
      return executeTool(toolName, input);
    },
    maxRounds: 8,
  });

  let evidence: IncidentEvidence;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as IncidentEvidence & { summary?: string };
    evidence = {
      errorMessages: parsed.errorMessages ?? [],
      stackTraces: parsed.stackTraces ?? [],
      logExcerpts: parsed.logExcerpts ?? [],
      metrics: parsed.metrics ?? [],
      deploymentEvents: parsed.deploymentEvents ?? [],
      failingHealthChecks: parsed.failingHealthChecks ?? [],
    };
    return {
      evidence,
      summary: parsed.summary ?? result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch {
    evidence = {
      errorMessages: [result.content.slice(0, 500)],
      stackTraces: [],
      logExcerpts: [],
      metrics: [],
      deploymentEvents: [],
      failingHealthChecks: [],
    };
    return { evidence, summary: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }
}
