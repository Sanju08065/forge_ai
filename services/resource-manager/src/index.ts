import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { startWorkspaceTask, stopWorkspaceTask, getTaskStatus, deployAppImage, getServiceHealth } from './ecs';

const PORT = parseInt(process.env['PORT'] ?? '3003', 10);
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'resource-manager' }));

// POST /workspaces/start
app.post('/workspaces/start', async (req, res) => {
  try {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.body);
    const taskArn = await startWorkspaceTask(projectId);
    res.json({ taskArn });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /workspaces/stop
app.post('/workspaces/stop', async (req, res) => {
  try {
    const { taskArn, reason } = z.object({ taskArn: z.string(), reason: z.string().default('Project idle') }).parse(req.body);
    await stopWorkspaceTask(taskArn, reason);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /workspaces/:taskArn/status
app.get('/workspaces/:taskArn/status', async (req, res) => {
  try {
    const taskArn = decodeURIComponent(req.params['taskArn'] as string);
    const status = await getTaskStatus(taskArn);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /deployments
app.post('/deployments', async (req, res) => {
  try {
    const body = z.object({
      imageUri: z.string(),
      environment: z.enum(['development', 'staging', 'production']).default('development'),
      envVars: z.record(z.string()).default({}),
    }).parse(req.body);
    await deployAppImage(body.imageUri, body.environment, body.envVars);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /services/:environment/health
app.get('/services/:environment/health', async (req, res) => {
  try {
    const env = req.params['environment'] as 'development' | 'staging' | 'production';
    const health = await getServiceHealth(env);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.warn(`[ResourceManager] Listening on :${PORT}`));
