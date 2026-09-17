import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { ForgeAIEventType } from '@forgeai/events';
import { ulid } from 'ulid';

const eb = new EventBridgeClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const EVENT_BUS_NAME = process.env['FORGEAI_EVENT_BUS_NAME'] ?? 'forgeai-events';

export async function publishEvent(
  type: ForgeAIEventType,
  projectId: string,
  detail: Record<string, unknown>
): Promise<void> {
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: 'forgeai.platform',
          DetailType: type,
          Detail: JSON.stringify({
            eventId: ulid(),
            projectId,
            timestamp: new Date().toISOString(),
            ...detail,
          }),
        },
      ],
    })
  );
}
