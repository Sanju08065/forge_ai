import type { Requirement } from '@forgeai/types';
import { converse } from '../lib/bedrock';
import { ulid } from 'ulid';

const SYSTEM_PROMPT = `You are the Product Agent for ForgeAI, an autonomous software engineering platform.
Your responsibility is to extract clear, structured product requirements from a natural-language prompt.

You must produce:
1. A list of specific, testable requirements (must-have, should-have, nice-to-have)
2. Concrete acceptance criteria for each requirement
3. Edge cases and constraints to consider
4. Non-goals (what the system should NOT do in this version)

Always respond with valid JSON in this exact format:
{
  "requirements": [
    {
      "title": "string",
      "description": "string",
      "priority": "must-have" | "should-have" | "nice-to-have",
      "acceptanceCriteria": ["string"],
      "edgeCases": ["string"]
    }
  ],
  "nonGoals": ["string"],
  "technicalConstraints": ["string"]
}`;

export interface ProductAgentOutput {
  requirements: Array<{
    title: string;
    description: string;
    priority: Requirement['priority'];
    acceptanceCriteria: string[];
    edgeCases: string[];
  }>;
  nonGoals: string[];
  technicalConstraints: string[];
}

export async function runProductAgent(
  projectId: string,
  prompt: string
): Promise<{ output: ProductAgentOutput; requirements: Requirement[]; inputTokens: number; outputTokens: number }> {
  const result = await converse({
    agentId: 'product',
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ text: `Product prompt: ${prompt}` }] }],
  });

  let output: ProductAgentOutput;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    output = JSON.parse(jsonMatch?.[0] ?? result.content) as ProductAgentOutput;
  } catch {
    throw new Error(`Product Agent returned invalid JSON: ${result.content.slice(0, 200)}`);
  }

  const now = new Date().toISOString();
  const requirements: Requirement[] = output.requirements.map((r) => ({
    requirementId: ulid(),
    projectId,
    title: r.title,
    description: r.description,
    priority: r.priority,
    acceptanceCriteria: r.acceptanceCriteria,
    status: 'pending',
    agentId: 'product',
    createdAt: now,
    updatedAt: now,
  }));

  return { output, requirements, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
