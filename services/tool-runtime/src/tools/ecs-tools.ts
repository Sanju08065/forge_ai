import axios from 'axios';

const RESOURCE_MANAGER_URL = process.env['RESOURCE_MANAGER_URL'] ?? 'http://localhost:3003';

export async function updateEcsService(input: {
  imageUri: string;
  environment: 'development' | 'staging' | 'production';
  envVars: Record<string, string>;
}): Promise<void> {
  await axios.post(`${RESOURCE_MANAGER_URL}/deployments`, input, { timeout: 30_000 });
}

export async function getEcsServiceHealth(environment: string): Promise<{
  running: number; pending: number; desired: number; status: string;
}> {
  const r = await axios.get(
    `${RESOURCE_MANAGER_URL}/services/${environment}/health`,
    { timeout: 10_000 }
  );
  return r.data as { running: number; pending: number; desired: number; status: string };
}
