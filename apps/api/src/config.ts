import { z } from 'zod';

// ─── Environment schema ───────────────────────────────────────────────────────
// Validated at startup — if any required var is missing, the app crashes loudly
// rather than silently failing at runtime. This is the "intentional failure"
// scenario ForgeAI uses for the repair loop demo.

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // DynamoDB
  DYNAMODB_TABLE_NAME: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY_SECONDS: z.string().default('3600'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),
});

function loadConfig(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[ForgeAI API] ❌ Missing required environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
