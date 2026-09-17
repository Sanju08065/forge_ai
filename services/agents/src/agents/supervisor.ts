import type { AgentTask, Project, Requirement, ProjectArchitecture } from '@forgeai/types';
import { ulid } from 'ulid';
import { runProductAgent } from './product';
import { runArchitectAgent } from './architect';
import { runCodingAgent } from './coding';
import { runTestingAgent } from './testing';
import { runDevOpsAgent } from './devops';
import { runSecurityAgent } from './security';
import { runSreAgent } from './sre';
import { runRepairAgent } from './repair';
import { runCriticAgent } from './critic';

// ─── Supervisor orchestrates the full lifecycle ───────────────────────────────
// Called by Lambda functions triggered from Step Functions task states.
// Each phase is a separate Lambda invocation — durable state lives in DynamoDB.

export interface PhaseInput {
  projectId: string;
  phase: string;
  payload: Record<string, unknown>;
}

export interface PhaseOutput {
  projectId: string;
  phase: string;
  success: boolean;
  output: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export async function runPhase(input: PhaseInput): Promise<PhaseOutput> {
  const { projectId, phase, payload } = input;
  const now = new Date().toISOString();

  try {
    switch (phase) {
      case 'EXTRACT_REQUIREMENTS': {
        const { output, requirements, inputTokens, outputTokens } = await runProductAgent(
          projectId,
          payload['prompt'] as string
        );
        return {
          projectId, phase, success: true,
          output: { requirements, nonGoals: output.nonGoals, constraints: output.technicalConstraints },
          inputTokens, outputTokens,
        };
      }

      case 'DESIGN_ARCHITECTURE': {
        const requirements = (payload['requirements'] as Requirement[]).map((r) => r.title);
        const { architecture, inputTokens, outputTokens } = await runArchitectAgent(projectId, requirements);
        return {
          projectId, phase, success: true,
          output: { architecture },
          inputTokens, outputTokens,
        };
      }

      case 'GENERATE_CODE': {
        const architecture = payload['architecture'] as Omit<ProjectArchitecture, 'projectId'>;
        const { files, inputTokens, outputTokens } = await runCodingAgent(projectId, architecture);
        return {
          projectId, phase, success: true,
          output: { filesGenerated: files.length, files },
          inputTokens, outputTokens,
        };
      }

      case 'GENERATE_TESTS': {
        const requirements = payload['requirements'] as Requirement[];
        const { testFiles, inputTokens, outputTokens } = await runTestingAgent(projectId, requirements);
        return {
          projectId, phase, success: true,
          output: { testFiles },
          inputTokens, outputTokens,
        };
      }

      case 'SECURITY_REVIEW': {
        const { review, inputTokens, outputTokens } = await runSecurityAgent(projectId);
        if (!review.passed) {
          return {
            projectId, phase, success: false,
            output: { review },
            inputTokens, outputTokens,
            error: `Security review failed: ${review.critical.join('; ')}`,
          };
        }
        return { projectId, phase, success: true, output: { review }, inputTokens, outputTokens };
      }

      case 'TRIGGER_BUILD': {
        const architecture = payload['architecture'] as Omit<ProjectArchitecture, 'projectId'>;
        const { buildTriggered, codeBuildId, inputTokens, outputTokens } = await runDevOpsAgent(
          projectId,
          architecture
        );
        return {
          projectId, phase, success: buildTriggered,
          output: { codeBuildId },
          inputTokens, outputTokens,
        };
      }

      case 'COLLECT_EVIDENCE': {
        const { evidence, summary, inputTokens, outputTokens } = await runSreAgent(
          projectId,
          payload['deploymentId'] as string,
          payload['logGroupName'] as string,
          payload['environment'] as string
        );
        return {
          projectId, phase, success: true,
          output: { evidence, summary },
          inputTokens, outputTokens,
        };
      }

      case 'GENERATE_REPAIR': {
        const evidence = payload['evidence'] as import('@forgeai/types').IncidentEvidence;
        const { repair, inputTokens, outputTokens } = await runRepairAgent(
          projectId,
          payload['incidentId'] as string,
          evidence,
          payload['imageUri'] as string,
          payload['environment'] as string
        );

        // Critic reviews the repair
        const { review: criticReview, inputTokens: ci, outputTokens: co } = await runCriticAgent(
          evidence,
          repair
        );

        return {
          projectId, phase, success: criticReview.approved,
          output: { repair: { ...repair, criticReview } },
          inputTokens: inputTokens + ci,
          outputTokens: outputTokens + co,
          error: criticReview.approved ? undefined : `Critic rejected repair: ${criticReview.concerns.join('; ')}`,
        };
      }

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  } catch (err) {
    return {
      projectId,
      phase,
      success: false,
      output: {},
      inputTokens: 0,
      outputTokens: 0,
      error: String(err),
    };
  }
}
