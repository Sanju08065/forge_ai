import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sendTaskSuccess, sendTaskFailure } from '../lib/step-functions';
import { updateProjectStatus, appendLedgerEvent, getWorkflowState } from '../lib/dynamodb';
import { publishEvent } from '../lib/eventbridge';
import { OrchestratorError } from '../middleware/error-handler';
import { ulid } from 'ulid';

export const callbackRouter = Router();

// POST /api/v1/callbacks/build — CodeBuild → Step Functions callback
callbackRouter.post('/build', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      projectId: z.string(),
      buildId: z.string(),
      status: z.enum(['SUCCEEDED', 'FAILED', 'STOPPED']),
      imageUri: z.string().optional(),
      failureReason: z.string().optional(),
    }).parse(req.body);

    const workflow = await getWorkflowState(body.projectId);
    if (!workflow?.taskToken) {
      throw new OrchestratorError(400, 'No task token found for project workflow');
    }

    const now = new Date().toISOString();

    if (body.status === 'SUCCEEDED') {
      await sendTaskSuccess(workflow.taskToken, { buildId: body.buildId, imageUri: body.imageUri });
      await updateProjectStatus(body.projectId, 'deploying');
      await appendLedgerEvent({
        eventId: ulid(), projectId: body.projectId,
        type: 'BUILD_SUCCEEDED', timestamp: now, actorId: 'system',
        summary: `Build ${body.buildId} succeeded. Image: ${body.imageUri ?? 'N/A'}`,
        detail: { buildId: body.buildId, imageUri: body.imageUri },
      });
      await publishEvent('ForgeAI.Build.StateChanged', body.projectId, {
        buildId: body.buildId, previousStatus: 'IN_PROGRESS', newStatus: 'SUCCEEDED',
        imageUri: body.imageUri,
      });
    } else {
      await sendTaskFailure(workflow.taskToken, 'BuildFailed', body.failureReason ?? 'Build failed');
      await updateProjectStatus(body.projectId, 'failed');
      await appendLedgerEvent({
        eventId: ulid(), projectId: body.projectId,
        type: 'BUILD_FAILED', timestamp: now, actorId: 'system',
        summary: `Build ${body.buildId} failed: ${body.failureReason ?? 'Unknown reason'}`,
        detail: { buildId: body.buildId, failureReason: body.failureReason },
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/callbacks/deployment — ECS deployment result callback
callbackRouter.post('/deployment', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      projectId: z.string(),
      deploymentId: z.string(),
      status: z.enum(['succeeded', 'failed']),
      loadBalancerUrl: z.string().optional(),
      failureReason: z.string().optional(),
    }).parse(req.body);

    const workflow = await getWorkflowState(body.projectId);
    const now = new Date().toISOString();

    if (body.status === 'succeeded') {
      if (workflow?.taskToken) {
        await sendTaskSuccess(workflow.taskToken, {
          deploymentId: body.deploymentId,
          loadBalancerUrl: body.loadBalancerUrl,
        });
      }
      await updateProjectStatus(body.projectId, 'running');
      await appendLedgerEvent({
        eventId: ulid(), projectId: body.projectId,
        type: 'DEPLOYMENT_SUCCEEDED', timestamp: now, actorId: 'system',
        summary: `Deployed successfully. URL: ${body.loadBalancerUrl ?? 'N/A'}`,
        detail: { deploymentId: body.deploymentId, loadBalancerUrl: body.loadBalancerUrl },
      });
    } else {
      if (workflow?.taskToken) {
        await sendTaskFailure(workflow.taskToken, 'DeploymentFailed', body.failureReason ?? 'Deployment failed');
      }
      await updateProjectStatus(body.projectId, 'failed');
      await appendLedgerEvent({
        eventId: ulid(), projectId: body.projectId,
        type: 'DEPLOYMENT_FAILED', timestamp: now, actorId: 'system',
        summary: `Deployment failed: ${body.failureReason ?? 'Unknown reason'}`,
        detail: body,
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});
