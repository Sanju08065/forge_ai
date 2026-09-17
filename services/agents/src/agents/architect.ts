import type { ProjectArchitecture } from '@forgeai/types';
import { converse } from '../lib/bedrock';

const SYSTEM_PROMPT = `You are the Architect Agent for ForgeAI.
Given a set of product requirements, you design the complete technical architecture.

You must produce a JSON architecture decision with this exact structure:
{
  "stack": {
    "language": "typescript",
    "framework": "express",
    "runtime": "node20",
    "database": "dynamodb",
    "testFramework": "jest"
  },
  "dataModel": {
    "entities": [
      { "name": "string", "attributes": { "field": "type" }, "primaryKey": "string", "sortKey": "string" }
    ]
  },
  "apiDesign": {
    "baseUrl": "/api/v1",
    "version": "1",
    "authType": "jwt",
    "endpoints": [
      { "method": "GET|POST|PUT|PATCH|DELETE", "path": "/...", "description": "...", "requiresAuth": true }
    ]
  },
  "deploymentTopology": {
    "provider": "aws",
    "region": "us-east-1",
    "compute": "ecs-fargate",
    "database": "dynamodb",
    "containerPort": 3000,
    "healthCheckPath": "/health"
  },
  "securityModel": {
    "authenticationMethod": "JWT Bearer token",
    "jwtExpirySeconds": 3600,
    "rateLimiting": true,
    "httpsOnly": true
  },
  "decisions": [
    { "title": "string", "context": "string", "decision": "string", "rationale": "string", "alternatives": [] }
  ]
}

Always choose Node.js + TypeScript + Express + DynamoDB for hackathon scope. Keep it simple and deployable.`;

export async function runArchitectAgent(
  projectId: string,
  requirements: string[]
): Promise<{ architecture: Omit<ProjectArchitecture, 'projectId'>; inputTokens: number; outputTokens: number }> {
  const result = await converse({
    agentId: 'architect',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Design the architecture for a project with these requirements:\n\n${requirements
              .map((r, i) => `${i + 1}. ${r}`)
              .join('\n')}`,
          },
        ],
      },
    ],
  });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Architect Agent returned no JSON');
  const architecture = JSON.parse(jsonMatch[0]) as Omit<ProjectArchitecture, 'projectId'>;

  return { architecture, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
