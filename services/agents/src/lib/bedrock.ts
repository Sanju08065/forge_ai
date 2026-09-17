import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock,
  type Tool,
  type ToolResultBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { AgentId, ToolName } from '@forgeai/types';
import { AGENT_MODEL_CONFIG } from '@forgeai/types';

const bedrock = new BedrockRuntimeClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

// ─── Tool definitions (Bedrock tool-use schema) ───────────────────────────────

export const BEDROCK_TOOLS: Tool[] = [
  {
    toolSpec: {
      name: 'write_file',
      description: 'Write content to a file in the project workspace.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path e.g. src/routes/tasks.ts' },
            content: { type: 'string', description: 'Full file content to write' },
          },
          required: ['path', 'content'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'read_file',
      description: 'Read the content of a file from the project workspace.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_files',
      description: 'List all files in a workspace directory.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Directory path, defaults to workspace root' } },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'query_cloudwatch_logs',
      description: 'Query CloudWatch Logs Insights to find errors and incidents.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            logGroupName: { type: 'string' },
            preset: { type: 'string', enum: ['recent_errors'], description: 'Use recent_errors for quick error diagnosis' },
            queryString: { type: 'string' },
            minutesBack: { type: 'number' },
          },
          required: ['logGroupName'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_ecs_service_health',
      description: 'Get the health status of the deployed ECS service.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            environment: { type: 'string', enum: ['development', 'staging', 'production'] },
          },
          required: ['environment'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'update_ecs_service',
      description: 'Deploy a new image and environment configuration to ECS.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            imageUri: { type: 'string' },
            environment: { type: 'string', enum: ['development', 'staging'] },
            envVars: { type: 'object', description: 'Environment variables to set on the container' },
          },
          required: ['imageUri', 'environment', 'envVars'],
        },
      },
    },
  },
];

// ─── Core converse loop ───────────────────────────────────────────────────────

export interface ConverseOptions {
  agentId: AgentId;
  systemPrompt: string;
  messages: Message[];
  tools?: Tool[];
  onToolCall?: (toolName: ToolName, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxRounds?: number;
}

export interface ConverseResult {
  content: string;
  toolCallsExecuted: number;
  inputTokens: number;
  outputTokens: number;
}

export async function converse(options: ConverseOptions): Promise<ConverseResult> {
  const { agentId, systemPrompt, tools, onToolCall, maxRounds = 10 } = options;
  const modelConfig = AGENT_MODEL_CONFIG[agentId];
  const messages: Message[] = [...options.messages];

  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallsExecuted = 0;
  let finalContent = '';

  for (let round = 0; round < maxRounds; round++) {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: modelConfig.modelId,
        system: [{ text: systemPrompt }],
        messages,
        inferenceConfig: {
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        },
        toolConfig: tools && tools.length > 0 ? { tools } : undefined,
      })
    );

    inputTokens += response.usage?.inputTokens ?? 0;
    outputTokens += response.usage?.outputTokens ?? 0;

    const assistantContent = response.output?.message?.content ?? [];
    messages.push({ role: 'assistant', content: assistantContent });

    // Check stop reason
    if (response.stopReason === 'end_turn' || response.stopReason === 'stop_sequence') {
      finalContent = assistantContent
        .filter((b): b is ContentBlock & { text: string } => 'text' in b)
        .map((b) => b.text)
        .join('');
      break;
    }

    // Handle tool use
    if (response.stopReason === 'tool_use' && onToolCall) {
      const toolResults: ToolResultBlock[] = [];

      for (const block of assistantContent) {
        if ('toolUse' in block && block.toolUse) {
          const { toolUseId, name, input } = block.toolUse;
          try {
            const output = await onToolCall(
              name as ToolName,
              input as Record<string, unknown>
            );
            toolCallsExecuted++;
            toolResults.push({
              toolUseId: toolUseId!,
              content: [{ json: output }],
            });
          } catch (err) {
            toolResults.push({
              toolUseId: toolUseId!,
              content: [{ text: `Error: ${String(err)}` }],
              status: 'error',
            });
          }
        }
      }

      messages.push({
        role: 'user',
        content: toolResults.map((r) => ({ toolResult: r })),
      });
      continue;
    }

    // Unexpected stop reason
    finalContent = assistantContent
      .filter((b): b is ContentBlock & { text: string } => 'text' in b)
      .map((b) => b.text)
      .join('');
    break;
  }

  return { content: finalContent, toolCallsExecuted, inputTokens, outputTokens };
}
