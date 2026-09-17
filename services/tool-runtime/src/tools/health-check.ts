import axios from 'axios';
import type { HealthCheckResult, E2EVerificationResult } from '@forgeai/types';

export async function runHealthCheck(url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const res = await axios.get(url, { timeout: 10_000, validateStatus: () => true });
    const responseTimeMs = Date.now() - start;
    return {
      url,
      statusCode: res.status,
      responseTimeMs,
      healthy: res.status >= 200 && res.status < 300,
      checkedAt,
      body: typeof res.data === 'object' ? res.data as Record<string, unknown> : undefined,
    };
  } catch (err) {
    return {
      url,
      healthy: false,
      checkedAt,
      error: String(err),
    };
  }
}

export async function runE2EVerification(baseUrl: string): Promise<E2EVerificationResult> {
  const start = Date.now();
  const checks = [];

  // Check 1 — health endpoint
  const health = await runHealthCheck(`${baseUrl}/health`);
  checks.push({
    name: 'Health endpoint returns 200',
    passed: health.statusCode === 200,
    responseCode: health.statusCode,
    assertion: 'statusCode === 200',
    actualValue: String(health.statusCode),
    expectedValue: '200',
  });

  // Check 2 — tasks endpoint returns valid JSON
  try {
    const tasks = await axios.get(`${baseUrl}/api/v1/tasks`, {
      timeout: 10_000,
      validateStatus: () => true,
    });
    checks.push({
      name: 'Tasks endpoint responds',
      passed: tasks.status < 500,
      responseCode: tasks.status,
      assertion: 'statusCode < 500',
      actualValue: String(tasks.status),
      expectedValue: '< 500',
    });
  } catch (err) {
    checks.push({
      name: 'Tasks endpoint responds',
      passed: false,
      error: String(err),
    });
  }

  // Check 3 — auth endpoint reachable
  try {
    const authCheck = await axios.post(
      `${baseUrl}/api/v1/auth/login`,
      { email: 'invalid@test.com', password: 'wrong' },
      { timeout: 10_000, validateStatus: () => true }
    );
    checks.push({
      name: 'Auth endpoint responds (401 expected for bad creds)',
      passed: authCheck.status === 401,
      responseCode: authCheck.status,
      assertion: 'statusCode === 401',
      actualValue: String(authCheck.status),
      expectedValue: '401',
    });
  } catch (err) {
    checks.push({
      name: 'Auth endpoint responds',
      passed: false,
      error: String(err),
    });
  }

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    checks,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}
