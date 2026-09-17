import type { ProjectArchitecture, FileMetadata } from '@forgeai/types';
import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';
import { ulid } from 'ulid';
import crypto from 'crypto';

const SYSTEM_PROMPT = `You are the Coding Agent for ForgeAI.
You generate production-quality Node.js + TypeScript + Express source code based on architecture decisions.

Rules:
- Write complete, working files — no placeholders, no TODOs
- Use TypeScript strict mode throughout
- Use Zod for input validation on all routes
- Use DynamoDB single-table design with PK/SK keys
- Include proper error handling in every route
- Never hardcode secrets — always read from process.env
- Write files one at a time using the write_file tool
- After writing all files, confirm the list with list_files

Generate exactly these files for a task management API:
1. src/config.ts — Zod env schema with DYNAMODB_TABLE_NAME, JWT_SECRET, PORT
2. src/lib/dynamodb.ts — DynamoDB client + key helpers
3. src/lib/jwt.ts — sign + verify JWT
4. src/middleware/authenticate.ts — JWT auth middleware
5. src/middleware/error-handler.ts — AppError class + handler
6. src/middleware/not-found.ts — 404 handler
7. src/routes/health.ts — GET /health, GET /health/ready
8. src/routes/auth.ts — POST /register, POST /login
9. src/routes/tasks.ts — full CRUD + filtering
10. src/app.ts — Express app factory
11. src/server.ts — entry point
12. package.json — all dependencies
13. tsconfig.json — strict TypeScript config
14. Dockerfile — multi-stage production build`;

export async function runCodingAgent(
  projectId: string,
  architecture: Omit<ProjectArchitecture, 'projectId'>
): Promise<{ files: FileMetadata[]; inputTokens: number; outputTokens: number }> {
  const writtenFiles: FileMetadata[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  const result = await converse({
    agentId: 'coding',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Generate the complete source code for this architecture:\n\n${JSON.stringify(architecture, null, 2)}\n\nWrite each file using write_file.`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS.filter((t) =>
      ['write_file', 'read_file', 'list_files'].includes(t.toolSpec?.name ?? '')
    ),
    onToolCall: async (toolName, input) => {
      // Check policy before every tool call
      const policy = await checkPolicy('coding', projectId, toolName, input);
      if (policy.decision === 'deny') {
        throw new Error(`Policy denied ${toolName}: ${policy.reason}`);
      }

      const output = await executeTool(toolName, input);

      // Track written files
      if (toolName === 'write_file' && input['path'] && input['content']) {
        const content = input['content'] as string;
        writtenFiles.push({
          fileId: ulid(),
          projectId,
          path: input['path'] as string,
          contentHash: crypto.createHash('sha256').update(content).digest('hex'),
          agentId: 'coding',
          requirementIds: [],
          testIds: [],
          sizeBytes: Buffer.byteLength(content, 'utf-8'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      return output;
    },
    maxRounds: 20,
  });

  totalInput += result.inputTokens;
  totalOutput += result.outputTokens;

  return { files: writtenFiles, inputTokens: totalInput, outputTokens: totalOutput };
}
