import type { Requirement } from '@forgeai/types';
import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';

const SYSTEM_PROMPT = `You are the Testing Agent for ForgeAI.
You generate comprehensive test suites for the generated application.

Rules:
- Write Jest + Supertest integration tests
- Mock DynamoDB using jest.mock — never call real AWS in tests
- Test every route: success cases, validation errors, auth failures, not-found
- Test the health endpoint
- Write tests to src/tests/ directory
- Coverage target: 80% statements, 70% branches
- Tests must be runnable with: npm test

Generate these test files:
1. src/tests/health.test.ts — health + readiness + 404
2. src/tests/auth.test.ts — register, login, duplicate email, wrong password
3. src/tests/tasks.test.ts — CRUD operations, filtering, auth guard

Each test file should be complete and self-contained.`;

export async function runTestingAgent(
  projectId: string,
  requirements: Requirement[]
): Promise<{ testFiles: string[]; inputTokens: number; outputTokens: number }> {
  const testFiles: string[] = [];

  const result = await converse({
    agentId: 'testing',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Generate test files for an Express API. Requirements:\n${requirements
              .map((r) => `- ${r.title}: ${r.acceptanceCriteria.join(', ')}`)
              .join('\n')}\n\nUse write_file to create each test file.`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS.filter((t) =>
      ['write_file', 'read_file', 'list_files'].includes(t.toolSpec?.name ?? '')
    ),
    onToolCall: async (toolName, input) => {
      const policy = await checkPolicy('testing', projectId, toolName, input);
      if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);

      const output = await executeTool(toolName, input);

      if (toolName === 'write_file' && typeof input['path'] === 'string') {
        testFiles.push(input['path']);
      }

      return output;
    },
    maxRounds: 15,
  });

  return { testFiles, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
