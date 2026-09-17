import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { z } from 'zod';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { docClient, TABLE_NAME, keys } from '../lib/dynamodb';
import { signToken } from '../lib/jwt';
import { AppError } from '../middleware/error-handler';

export const authRouter = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(400, body.error.issues.map((i) => i.message).join(', '));
    }

    const { email, password, name } = body.data;

    // Check email uniqueness
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: keys.userEmail(email) })
    );
    if (existing.Item) {
      throw new AppError(409, 'An account with this email already exists');
    }

    const userId = ulid();
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    // Store user record
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...keys.user(userId),
          userId,
          email,
          name,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    // Store email → userId lookup
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...keys.userEmail(email), userId },
      })
    );

    const token = signToken({ userId, email });
    res.status(201).json({ token, user: { userId, email, name } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(400, 'Invalid email or password format');
    }

    const { email, password } = body.data;

    // Look up userId by email
    const emailRecord = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: keys.userEmail(email) })
    );
    if (!emailRecord.Item) {
      throw new AppError(401, 'Invalid email or password');
    }

    const userId = emailRecord.Item['userId'] as string;
    const userRecord = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: keys.user(userId) })
    );
    if (!userRecord.Item) {
      throw new AppError(401, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, userRecord.Item['passwordHash'] as string);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = signToken({ userId, email });
    res.status(200).json({
      token,
      user: {
        userId,
        email,
        name: userRecord.Item['name'] as string,
      },
    });
  } catch (err) {
    next(err);
  }
});
