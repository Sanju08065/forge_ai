import type { ProjectArchitecture } from '@forgeai/types';
import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';
import { triggerCodeBuild } from '@forgeai/tool-runtime';

const SYSTEM_PROMPT = `You are the DevOps Agent for ForgeAI.
You are responsible for:
1. Generating Dockerfile and buildspec.yml for the application
2. Triggering the CodeBuild pipeline to build + push the Docker image
3. Monitoring the build until it succeeds or fails
4. Reporting the resulting image URI

Rules:
- Use multi-stage Docker builds (builder stage + production stage)
- Use node:20-alpine for both stages
- Run as non-root user in production stage
- buildspec.yml must: install deps, lint, typecheck, run tests, build, docker build, docker push to ECR
- Export IMAGE_URI as an exported environment variable at build end
- Report build status clearly

Dockerfile structure:
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production=false
  COPY . .
  RUN npm run build

  FROM node:20-alpine AS production
  WORKDIR /app
  RUN addgroup -S appgroup && adduser -S appuser -G appgroup
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/node_modules ./node_modules
  COPY package.json .
  USER appuser
  EXPOSE 3000
  CMD ["node", "dist/server.js"]`;

export async function runDevOpsAgent(
  projectId: string,
  architecture: Omit<ProjectArchitecture, 'projectId'>
): Promise<{ buildTriggered: boolean; codeBuildId?: string; inputTokens: number; outputTokens: number }> {
  let codeBuildIdResult: string | undefined;
  let buildTriggered = false;

  const result = await converse({
    agentId: 'devops',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Generate Dockerfile and buildspec.yml for this architecture, write them to the workspace, then trigger CodeBuild project "${process.env['CODEBUILD_PROJECT_NAME'] ?? 'forgeai-app-build'}".\n\nArchitecture:\n${JSON.stringify(architecture.deploymentTopology, null, 2)}`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS,
    onToolCall: async (toolName, input) => {
      const policy = await checkPolicy('devops', projectId, toolName, input);
      if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);

      if (toolName === 'trigger_codebuild') {
        const r = await triggerCodeBuild({
          projectName: (input['projectName'] as string) ?? process.env['CODEBUILD_PROJECT_NAME'] ?? 'forgeai-app-build',
          environmentVariables: { PROJECT_ID: projectId },
        });
        buildTriggered = true;
        codeBuildIdResult = r.codeBuildId;
        return { codeBuildId: r.codeBuildId, buildId: r.buildId };
      }

      return executeTool(toolName, input);
    },
    maxRounds: 15,
  });

  return {
    buildTriggered,
    codeBuildId: codeBuildIdResult,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
