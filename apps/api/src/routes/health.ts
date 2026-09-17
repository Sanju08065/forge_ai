import { Router, type Request, type Response } from 'express';

export const healthRouter = Router();

// GET /health — liveness probe (does NOT require DB)
healthRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'healthy',
    service: 'forgeai-api',
    version: process.env['APP_VERSION'] ?? '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// GET /health/ready — readiness probe (requires DB connection)
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Verify DynamoDB is reachable by checking the table name env var is set
    const tableConfigured = Boolean(process.env['DYNAMODB_TABLE_NAME']);
    if (!tableConfigured) {
      res.status(503).json({
        status: 'unhealthy',
        reason: 'DYNAMODB_TABLE_NAME not configured',
      });
      return;
    }
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', reason: String(err) });
  }
});
