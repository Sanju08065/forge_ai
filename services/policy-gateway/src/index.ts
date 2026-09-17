import 'dotenv/config';
import express from 'express';
import { ulid } from 'ulid';
import { policyEngine } from '@forgeai/policy';
import type { PolicyRequest } from '@forgeai/policy';

const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const app = express();
app.use(express.json());

// GET /health
app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'policy-gateway' }));

// POST /evaluate — agents call this before every tool action
app.post('/evaluate', (req, res) => {
  const body = req.body as Partial<PolicyRequest>;

  if (!body.agentId || !body.toolName || !body.projectId) {
    res.status(400).json({ error: 'agentId, toolName, and projectId are required' });
    return;
  }

  const request: PolicyRequest = {
    requestId: ulid(),
    agentId: body.agentId,
    projectId: body.projectId,
    toolName: body.toolName,
    toolInput: body.toolInput ?? {},
    environment: (body.environment ?? process.env['FORGEAI_ENVIRONMENT'] ?? 'development') as PolicyRequest['environment'],
    timestamp: new Date().toISOString(),
  };

  const response = policyEngine.evaluate(request);

  // Emit a structured log that CloudWatch can parse
  if (response.decision === 'deny') {
    console.warn(JSON.stringify({
      level: 'WARN',
      event: 'POLICY_DENIED',
      requestId: request.requestId,
      agentId: request.agentId,
      toolName: request.toolName,
      projectId: request.projectId,
      ruleId: response.matchedRuleId,
      reason: response.reason,
    }));
  }

  res.json(response);
});

// POST /evaluate/batch — evaluate multiple actions at once
app.post('/evaluate/batch', (req, res) => {
  const requests = req.body as Partial<PolicyRequest>[];
  if (!Array.isArray(requests)) {
    res.status(400).json({ error: 'Body must be an array of policy requests' });
    return;
  }

  const results = requests.map((body) => {
    if (!body.agentId || !body.toolName || !body.projectId) {
      return { error: 'Missing required fields' };
    }
    return policyEngine.evaluate({
      requestId: ulid(),
      agentId: body.agentId,
      projectId: body.projectId,
      toolName: body.toolName,
      toolInput: body.toolInput ?? {},
      environment: (body.environment ?? 'development') as PolicyRequest['environment'],
      timestamp: new Date().toISOString(),
    });
  });

  res.json({ results });
});

app.listen(PORT, () => console.warn(`[PolicyGateway] Listening on :${PORT}`));
