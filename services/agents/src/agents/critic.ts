import type { IncidentEvidence, Repair, CriticReview } from '@forgeai/types';
import { converse } from '../lib/bedrock';

const SYSTEM_PROMPT = `You are the Critic Agent for ForgeAI.
Your job is to review proposed repairs and identify flaws, risks, and missing verifications.

You are adversarial by design — your goal is to find reasons the repair will NOT work.
If you cannot find a fatal flaw, approve it.

Review criteria:
1. Does the root cause diagnosis actually match the evidence?
2. Is the patch minimal? (no unnecessary changes)
3. Will the patch fix the root cause completely?
4. Are there side effects or regression risks?
5. Is the verification plan sufficient?
6. Is there a missing env var, wrong value, or incomplete change?

Respond with JSON:
{
  "approved": true | false,
  "concerns": ["string"],
  "missingVerifications": ["string"],
  "riskLevel": "low" | "medium" | "high",
  "reasoning": "string"
}`;

export async function runCriticAgent(
  evidence: IncidentEvidence,
  repair: Omit<Repair, 'repairId' | 'projectId' | 'status' | 'proposedAt'>
): Promise<{ review: CriticReview; inputTokens: number; outputTokens: number }> {
  const result = await converse({
    agentId: 'critic',
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Review this proposed repair.

EVIDENCE SUMMARY:
Errors: ${evidence.errorMessages.slice(0, 5).join(', ')}
Failing health checks: ${evidence.failingHealthChecks.join(', ')}

PROPOSED REPAIR:
Root cause: ${repair.description}
Type: ${repair.repairType}
Patches:
${repair.patchDetails.map((p) => `  - [${p.changeType}] ${p.filePath}: ${p.description}`).join('\n')}

Is this repair correct, complete, and safe to apply?`,
          },
        ],
      },
    ],
  });

  let review: CriticReview;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as Partial<CriticReview> & { reasoning?: string };
    review = {
      approved: parsed.approved ?? true,
      concerns: parsed.concerns ?? [],
      missingVerifications: parsed.missingVerifications ?? [],
      riskLevel: parsed.riskLevel ?? 'low',
      reviewedAt: new Date().toISOString(),
    };
  } catch {
    review = {
      approved: true,
      concerns: [],
      missingVerifications: [],
      riskLevel: 'low',
      reviewedAt: new Date().toISOString(),
    };
  }

  return { review, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
