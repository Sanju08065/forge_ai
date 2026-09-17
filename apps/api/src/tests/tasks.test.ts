/**
 * Task API integration tests.
 * Uses a mock DynamoDB client — no real AWS calls.
 */
import request from 'supertest';
import { createApp } from '../app';
import { signToken } from '../lib/jwt';

process.env['DYNAMODB_TABLE_NAME'] = 'test-table';
process.env['JWT_SECRET'] = 'test-secret-that-is-at-least-32-chars-long';
process.env['NODE_ENV'] = 'test';

// Mock the DynamoDB document client
jest.mock('../lib/dynamodb', () => {
  const store: Record<string, Record<string, unknown>> = {};
  return {
    docClient: {
      send: jest.fn(async (command: { input: Record<string, unknown> }) => {
        const input = command.input as Record<string, unknown>;
        const key = JSON.stringify(input['Key']);
        if (command.constructor.name === 'PutCommand') {
          store[key] = input['Item'] as Record<string, unknown>;
          return {};
        }
        if (command.constructor.name === 'GetCommand') {
          return { Item: store[key] };
        }
        if (command.constructor.name === 'QueryCommand') {
          return { Items: Object.values(store) };
        }
        if (command.constructor.name === 'DeleteCommand') {
          delete store[key];
          return {};
        }
        return {};
      }),
    },
    TABLE_NAME: 'test-table',
    keys: {
      user: (userId: string) => ({ PK: `USER#${userId}`, SK: 'METADATA' }),
      userEmail: (email: string) => ({ PK: `EMAIL#${email}`, SK: 'USER' }),
      task: (userId: string, taskId: string) => ({ PK: `USER#${userId}`, SK: `TASK#${taskId}` }),
      tasksByUser: (userId: string) => ({ PK: `USER#${userId}`, SK_prefix: 'TASK#' }),
    },
  };
});

const app = createApp();
const token = signToken({ userId: 'user-123', email: 'test@example.com' });

describe('POST /api/v1/tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test task', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test task');
    expect(res.body.taskId).toBeDefined();
    expect(res.body.taskStatus).toBe('todo');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'high' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .send({ title: 'Test task' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/tasks', () => {
  it('returns task list with 200', async () => {
    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });
});
