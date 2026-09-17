import type { Request, Response, NextFunction } from 'express';

export class OrchestratorError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof OrchestratorError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('[Orchestrator] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
