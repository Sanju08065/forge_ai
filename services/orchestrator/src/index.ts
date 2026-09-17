import 'dotenv/config';
import express from 'express';
import { projectsRouter } from './routes/projects';
import { callbackRouter } from './routes/callbacks';
import { errorHandler } from './middleware/error-handler';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const app = express();

app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'orchestrator' }));
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/callbacks', callbackRouter);
app.use(errorHandler);

app.listen(PORT, () => console.warn(`[Orchestrator] Listening on :${PORT}`));
