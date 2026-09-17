import type { IncidentEvidence, PatchDetail, Repair } from '@forgeai/types';
import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';
import { ulid } from 'ulid';

const SYSTEM_PROMPT = `You are the Repair Agent for ForgeAI.
Given failure evidence from a deployed application, you diagnose the root cause and apply a minimal fix.

Process:
1. Analyse the evidence carefully — read error messages, stack traces, log excerpts
2. State the root cause in ONE sentence
3. Determine the minimal patch (prefer config/env fix over code changes)
4. Apply the fix using available tools
5. Report what you changed

Common repair patterns:
- Missing env var → add it to ECS task definition via update_ecs_service envVars
- Wrong env var value → update it via update_ecs_service envVars
- Missing dependency → add to package.json and trigger rebuild
- Code bug → fix the specific file with write_file

Respond with JSON after completing repairs:
{
  "rootCause": "one sentence",
  "repairType": "env_var_missing | env_var_wrong_value | code_bug | config_error | other",
  "patchDetails": [
    {"filePath": "string or 'ECS_ENV_VARS'", "changeType": "modify|config", "description": "string", "before": "string", "after": "string"}
  ],
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}`;

export async function runRepairAgent(
  projectId: string,
  incidentId: string,
  evidence: IncidentEvidence,
  imageUri: string,
  environment: string
): Promise<{
  repair: Omit<Repair, 'repairId' | 'projectId' | 'status' | 'proposedAt'>;
  inputTokens: number;
  outputTokens: number;
}> {
  const result = await converse({
    agentId: 'repair',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Diagnose and repair this incident.

INCIDENT ID: ${incidentId}
PROJECT: ${projectId}

EVIDENCE:
Error messages:
${evidence.errorMessages.map((e) => `  - ${e}`).join('\n')}

Stack traces:
${evidence.stackTraces.slice(0, 3).map((t) => `  ${t.slice(0, 400)}`).join('\n')}

Log excerpts:
${evidence.logExcerpts
  .slice(0, 10)
  .map((l) => `  [${l.level}] ${l.timestamp}: ${l.message}`)
  .join('\n')}

Failing health checks:
${evidence.failingHealthChecks.join('\n')}

Current image URI: ${imageUri}
Environment: ${environment}

Apply the minimal fix using the available tools, then report the repair in JSON.`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS,
    onToolCall: async (toolName, input) => {
      // Repair agent has special env-var patching capability
      if (toolName === 'update_ecs_service') {
        const merged = {
          ...(input as { imageUri?: string; environment?: string; envVars?: Record<string, string> }),
          imageUri: (input as { imageUri?: string })['imageUri'] ?? imageUri,
          environment: (input as { environment?: string })['environment'] ?? environment,
        };
        const policy = await checkPolicy('repair', projectId, toolName, merged as Record<string, unknown>);
        if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);
        return executeTool(toolName, merged as Record<string, unknown>);
      }

      const policy = await checkPolicy('repair', projectId, toolName, input);
      if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);
      return executeTool(toolName, input);
    },
    maxRounds: 12,
  });

  let parsed: {
    rootCause: string;
    repairType: Repair['repairType'];
    patchDetails: PatchDetail[];
    confidence: number;
    reasoning: string;
  };

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as typeof parsed;
  } catch {
    parsed = {
      rootCause: 'Could not parse repair agent output',
      repairType: 'other',
      patchDetails: [],
      confidence: 0.3,
      reasoning: result.content,
    };
  }

  return {
    repair: {
      incidentId,
      repairType: parsed.repairType ?? 'other',
      description: parsed.rootCause,
      patchDetails: parsed.patchDetails ?? [],
      validationResults: [],
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
