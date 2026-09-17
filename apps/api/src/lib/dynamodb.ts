import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

// ─── DynamoDB Document Client singleton ──────────────────────────────────────

const ddbClient = new DynamoDBClient({
  region: config.AWS_REGION,
  // In local dev, point to DynamoDB Local
  ...(config.NODE_ENV === 'development' && {
    endpoint: process.env['DYNAMODB_ENDPOINT'] ?? 'http://localhost:8000',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  }),
});

export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

export const TABLE_NAME = config.DYNAMODB_TABLE_NAME;

// ─── Key helpers ──────────────────────────────────────────────────────────────

export const keys = {
  user: (userId: string) => ({ PK: `USER#${userId}`, SK: `METADATA` }),
  userEmail: (email: string) => ({ PK: `EMAIL#${email}`, SK: `USER` }),
  task: (userId: string, taskId: string) => ({
    PK: `USER#${userId}`,
    SK: `TASK#${taskId}`,
  }),
  tasksByUser: (userId: string) => ({
    PK: `USER#${userId}`,
    SK_prefix: 'TASK#',
  }),
};
