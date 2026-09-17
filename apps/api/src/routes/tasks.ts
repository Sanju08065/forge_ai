import { Router, type Request, type Response, type NextFunction } from 'express';
import { ulid } from 'ulid';
import { z } from 'zod';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { docClient, TABLE_NAME, keys } from '../lib/dynamodb';
import { authenticate, type AuthenticatedRequest } from '../middleware/authenticate';
import { AppError } from '../middleware/error-handler';

export const tasksRouter = Router();

// All task routes require authentication
tasksRouter.use(authenticate);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TaskStatus = z.enum(['todo', 'in_progress', 'done']);
const TaskPriority = z.enum(['low', 'medium', 'high']);

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: TaskStatus.default('todo'),
  priority: TaskPriority.default('medium'),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).max(10).default([]),
});

const updateTaskSchema = createTaskSchema.partial();

const listTasksSchema = z.object({
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  nextToken: z.string().optional(),
});

// ─── GET /api/v1/tasks ────────────────────────────────────────────────────────

tasksRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req as AuthenticatedRequest;
    const query = listTasksSchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(400, query.error.issues.map((i) => i.message).join(', '));
    }

    const { limit, nextToken, status, priority } = query.data;
    const { PK, SK_prefix } = keys.tasksByUser(auth.userId);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': PK,
          ':prefix': SK_prefix,
          ...(status && { ':status': status }),
          ...(priority && { ':priority': priority }),
        },
        FilterExpression: [
          status ? 'taskStatus = :status' : null,
          priority ? 'priority = :priority' : null,
        ]
          .filter(Boolean)
          .join(' AND ') || undefined,
        Limit: limit,
        ExclusiveStartKey: nextToken
          ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
          : undefined,
      })
    );

    const tasks = (result.Items ?? []).map(stripDynamoKeys);
    const newNextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    res.status(200).json({ tasks, nextToken: newNextToken, total: tasks.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/tasks ───────────────────────────────────────────────────────

tasksRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req as AuthenticatedRequest;
    const body = createTaskSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(400, body.error.issues.map((i) => i.message).join(', '));
    }

    const taskId = ulid();
    const now = new Date().toISOString();
    const task = {
      ...keys.task(auth.userId, taskId),
      taskId,
      userId: auth.userId,
      title: body.data.title,
      description: body.data.description ?? '',
      taskStatus: body.data.status,
      priority: body.data.priority,
      dueDate: body.data.dueDate,
      tags: body.data.tags,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: task }));
    res.status(201).json(stripDynamoKeys(task));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/tasks/:taskId ────────────────────────────────────────────────

tasksRouter.get('/:taskId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req as AuthenticatedRequest;
    const { taskId } = req.params as { taskId: string };

    const result = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: keys.task(auth.userId, taskId) })
    );
    if (!result.Item) throw new AppError(404, `Task ${taskId} not found`);

    res.status(200).json(stripDynamoKeys(result.Item));
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/v1/tasks/:taskId ──────────────────────────────────────────────

tasksRouter.patch('/:taskId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req as AuthenticatedRequest;
    const { taskId } = req.params as { taskId: string };
    const body = updateTaskSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(400, body.error.issues.map((i) => i.message).join(', '));
    }

    const updates = body.data;
    if (Object.keys(updates).length === 0) throw new AppError(400, 'No fields to update');

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'taskStatus',
      priority: 'priority',
      dueDate: 'dueDate',
      tags: 'tags',
    };

    const expParts: string[] = ['updatedAt = :updatedAt'];
    const exprValues: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };

    for (const [key, value] of Object.entries(updates)) {
      const attr = fieldMap[key];
      if (attr) {
        expParts.push(`${attr} = :${key}`);
        exprValues[`:${key}`] = value;
      }
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.task(auth.userId, taskId),
        UpdateExpression: `SET ${expParts.join(', ')}`,
        ExpressionAttributeValues: exprValues,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      })
    );

    res.status(200).json(stripDynamoKeys(result.Attributes ?? {}));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/tasks/:taskId ─────────────────────────────────────────────

tasksRouter.delete('/:taskId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req as AuthenticatedRequest;
    const { taskId } = req.params as { taskId: string };

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: keys.task(auth.userId, taskId),
        ConditionExpression: 'attribute_exists(PK)',
      })
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripDynamoKeys(item: Record<string, unknown>): Record<string, unknown> {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest;
}
