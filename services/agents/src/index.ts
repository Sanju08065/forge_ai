import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { runPhase } from './agents/supervisor';

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);
const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'agents' }));

// POST /run-phase — called by Step Functions Lambda tasks
app.post('/run-phase', async (req, res) => {
  try {
    const body = z.object({
      projectId: z.string(),
      phase: z.string(),
      payload: z.record(z.unknown()).default({}),
    }).parse(req.body);

    const result = await runPhase(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.warn(`[Agents] Listening on :${PORT}`));
