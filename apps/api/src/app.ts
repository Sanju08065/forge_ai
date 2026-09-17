import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { tasksRouter } from './routes/tasks';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';

export function createApp(): Express {
  const app = express();

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: process.env['CORS_ORIGIN'] ?? '*',
      credentials: true,
    })
  );

  // ── Rate limiting ────────────────────────────────────────────────────────
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    })
  );

  // ── Body parsing + compression ───────────────────────────────────────────
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Logging ──────────────────────────────────────────────────────────────
  if (process.env['NODE_ENV'] !== 'test') {
    app.use(morgan('combined'));
  }

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/tasks', tasksRouter);

  // ── 404 + error handlers ─────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
