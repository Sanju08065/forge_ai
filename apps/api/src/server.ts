import 'dotenv/config';
import { createApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = createApp();

  app.listen(PORT, HOST, () => {
    console.warn(`[ForgeAI API] Server running on http://${HOST}:${PORT}`);
    console.warn(`[ForgeAI API] Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
    console.warn(`[ForgeAI API] Health: http://${HOST}:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[ForgeAI API] Fatal startup error:', err);
  process.exit(1);
});
