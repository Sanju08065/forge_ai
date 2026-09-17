import request from 'supertest';
import { createApp } from '../app';

// Set minimal env before app boots
process.env['DYNAMODB_TABLE_NAME'] = 'test-table';
process.env['JWT_SECRET'] = 'test-secret-that-is-at-least-32-chars-long';
process.env['NODE_ENV'] = 'test';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('forgeai-api');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when DYNAMODB_TABLE_NAME is set', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });
});
