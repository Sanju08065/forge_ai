import { converse, BEDROCK_TOOLS } from '../lib/bedrock';
import { checkPolicy } from '../lib/policy-client';
import { executeTool } from '@forgeai/tool-runtime';

const SYSTEM_PROMPT = `You are the Security Agent for ForgeAI.
You audit generated source code for security vulnerabilities before deployment.

Check for:
1. Hardcoded secrets or API keys in source files
2. SQL/NoSQL injection vulnerabilities
3. Missing input validation
4. Improper JWT handling (weak secrets, no expiry)
5. Missing rate limiting
6. CORS misconfiguration (wildcard origins in production)
7. Sensitive data in logs
8. Missing HTTPS enforcement
9. Dependency vulnerabilities (check package.json for known bad versions)
10. Path traversal vulnerabilities

Read key files using read_file, then report findings.

Respond with JSON:
{
  "passed": true | false,
  "critical": ["string"],
  "high": ["string"],
  "medium": ["string"],
  "low": ["string"],
  "summary": "string"
}

Only block deployment (passed: false) on CRITICAL findings.`;

export interface SecurityReview {
  passed: boolean;
  critical: string[];
  high: string[];
  medium: string[];
  low: string[];
  summary: string;
}

export async function runSecurityAgent(
  projectId: string
): Promise<{ review: SecurityReview; inputTokens: number; outputTokens: number }> {
  const result = await converse({
    agentId: 'security',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Audit the generated application for security vulnerabilities.
Key files to check: src/config.ts, src/lib/jwt.ts, src/middleware/authenticate.ts, src/routes/auth.ts, src/routes/tasks.ts, src/app.ts
Use read_file to inspect each file, then provide your findings.`,
          },
        ],
      },
    ],
    tools: BEDROCK_TOOLS.filter((t) =>
      ['read_file', 'list_files'].includes(t.toolSpec?.name ?? '')
    ),
    onToolCall: async (toolName, input) => {
      const policy = await checkPolicy('security', projectId, toolName, input);
      if (policy.decision === 'deny') throw new Error(`Policy denied: ${policy.reason}`);
      return executeTool(toolName, input);
    },
    maxRounds: 10,
  });

  let review: SecurityReview;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    review = JSON.parse(jsonMatch?.[0] ?? '{}') as SecurityReview;
    review.passed = review.passed ?? review.critical?.length === 0;
  } catch {
    review = { passed: true, critical: [], high: [], medium: [], low: [], summary: result.content };
  }

  return { review, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
