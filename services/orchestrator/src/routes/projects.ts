import { Router, type Request, type Response, type NextFunction } from 'express';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { Project } from '@forgeai/types';
import {
  putProject, getProject, listProjects, getLedgerEvents, getProjectTasks,
} from '../lib/dynamodb';
import { startWorkflowExecution } from '../lib/step-functions';
import { publishEvent } from '../lib/eventbridge';
import { OrchestratorError } from '../middleware/error-handler';

export const projectsRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  prompt: z.string().min(10).max(2000),
});

// POST /api/v1/projects — create project and start workflow
projectsRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw new OrchestratorError(400, body.error.issues[0]?.message ?? 'Invalid input');

    const projectId = ulid();
    const now = new Date().toISOString();

    const project: Project = {
      projectId,
      name: body.data.name,
      description: '',
      originalPrompt: body.data.prompt,
      status: 'pending',
      ownerId: (req.headers['x-user-id'] as string) ?? 'anonymous',
      tags: {},
      createdAt: now,
      updatedAt: now,
    };

    await putProject(project);

    // Start Step Functions workflow
    const executionArn = await startWorkflowExecution(projectId, {
      name: project.name,
      prompt: project.originalPrompt,
    });

    // Update project with execution ARN
    project.stepFunctionsExecutionArn = executionArn;
    project.status = 'requirements';
    await putProject(project);

    await publishEvent('ForgeAI.Project.Created', projectId, {
      name: project.name,
      ownerId: project.ownerId,
      originalPrompt: project.originalPrompt,
    });

    res.status(201).json({ project });
  } catch (err) { next(err); }
});

// GET /api/v1/projects — list all projects
projectsRouter.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) { next(err); }
});

// GET /api/v1/projects/:id — get project
projectsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const project = await getProject(req.params['id'] as string);
    if (!project) throw new OrchestratorError(404, 'Project not found');
    res.json({ project });
  } catch (err) { next(err); }
});

// GET /api/v1/projects/:id/ledger — get engineering ledger
projectsRouter.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = req.params['id'] as string;
    const project = await getProject(projectId);
    if (!project) throw new OrchestratorError(404, 'Project not found');

    const events = await getLedgerEvents(projectId);
    const ledger = {
      projectId,
      events,
      lastUpdated: new Date().toISOString(),
      totalEvents: events.length,
      summary: {
        requirementsExtracted: events.filter((e) => e.type === 'REQUIREMENT_EXTRACTED').length,
        filesGenerated:        events.filter((e) => e.type === 'FILE_CREATED').length,
        buildsRun:             events.filter((e) => e.type === 'BUILD_STARTED').length,
        buildsSucceeded:       events.filter((e) => e.type === 'BUILD_SUCCEEDED').length,
        deployments:           events.filter((e) => e.type === 'DEPLOYMENT_SUCCEEDED').length,
        incidentsDetected:     events.filter((e) => e.type === 'INCIDENT_DETECTED').length,
        repairsApplied:        events.filter((e) => e.type === 'REPAIR_APPLIED').length,
        repairsSucceeded:      events.filter((e) => e.type === 'REPAIR_VERIFIED').length,
        totalAgentTokensUsed:  0,
        totalCostUsd:          0,
      },
    };
    res.json({ ledger });
  } catch (err) { next(err); }
});

// GET /api/v1/projects/:id/tasks — get task graph
projectsRouter.get('/:id/tasks', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tasks = await getProjectTasks(req.params['id'] as string);
    res.json({ tasks });
  } catch (err) { next(err); }
});
