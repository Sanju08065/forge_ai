import axios from 'axios';
import type { AgentId, ToolName } from '@forgeai/types';
import type { PolicyResponse } from '@forgeai/policy';

const POLICY_GATEWAY_URL = process.env['POLICY_GATEWAY_URL'] ?? 'http://localhost:3002';

export async function checkPolicy(
  agentId: AgentId,
  projectId: string,
  toolName: ToolName,
  toolInput: Record<string, unknown>
): Promise<PolicyResponse> {
  const res = await axios.post<PolicyResponse>(
    `${POLICY_GATEWAY_URL}/evaluate`,
    { agentId, projectId, toolName, toolInput, environment: process.env['FORGEAI_ENVIRONMENT'] ?? 'development' },
    { timeout: 5000 }
  );
  return res.data;
}
