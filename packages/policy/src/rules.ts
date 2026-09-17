import type { PolicyRule } from './types';

// ─── Default policy ruleset ───────────────────────────────────────────────────
// Rules are evaluated in priority order (lower number = evaluated first).
// First matching rule wins.

export const DEFAULT_RULES: PolicyRule[] = [
  // ── Critical blocks (priority 1–10) ──────────────────────────────────────
  {
    ruleId: 'BLOCK_PRODUCTION_DESTRUCTIVE',
    description: 'Block all destructive actions in production',
    priority: 1,
    condition: {
      environments: ['production'],
      tools: ['delete_file', 'run_command'],
      inputMatchers: [{ field: 'command', operator: 'contains', value: 'DROP' }],
    },
    decision: 'deny',
    riskLevel: 'critical',
    reason: 'Destructive operations in production require human approval via separate change process.',
  },
  {
    ruleId: 'BLOCK_CROSS_PROJECT_ACCESS',
    description: 'Agents cannot access files outside their project workspace',
    priority: 2,
    condition: {
      tools: ['read_file', 'write_file', 'delete_file'],
      inputMatchers: [{ field: 'path', operator: 'startsWith', value: '../' }],
    },
    decision: 'deny',
    riskLevel: 'critical',
    reason: 'Cross-project file access is prohibited. Paths must be relative to the project workspace.',
  },
  {
    ruleId: 'BLOCK_UNBOUNDED_RESOURCES',
    description: 'Block resource creation without explicit limits',
    priority: 3,
    condition: {
      tools: ['run_command'],
      inputMatchers: [{ field: 'command', operator: 'contains', value: '--no-limit' }],
    },
    decision: 'deny',
    riskLevel: 'critical',
    reason: 'Unbounded resource creation is blocked. All resources must have explicit limits.',
  },

  // ── Human approval required (priority 11–20) ──────────────────────────────
  {
    ruleId: 'REQUIRE_APPROVAL_PRODUCTION_DEPLOY',
    description: 'Production deployments require human approval',
    priority: 11,
    condition: {
      environments: ['production'],
      tools: ['update_ecs_service'],
    },
    decision: 'require_human_approval',
    riskLevel: 'high',
    reason: 'Production deployments require explicit human approval.',
  },
  {
    ruleId: 'REQUIRE_APPROVAL_HIGH_RISK_REPAIR',
    description: 'High-risk repairs require human approval',
    priority: 12,
    condition: {
      agents: ['repair'],
      tools: ['run_command'],
      inputMatchers: [{ field: 'command', operator: 'contains', value: 'migrate' }],
    },
    decision: 'require_human_approval',
    riskLevel: 'high',
    reason: 'Database migrations performed by the Repair Agent require human approval.',
  },

  // ── Allow rules (priority 100+) ───────────────────────────────────────────
  {
    ruleId: 'ALLOW_WORKSPACE_FILES',
    description: 'Coding/Testing agents can freely read and write project files',
    priority: 100,
    condition: {
      agents: ['coding', 'testing', 'devops'],
      tools: ['write_file', 'read_file', 'delete_file', 'list_files'],
    },
    decision: 'allow',
    riskLevel: 'low',
    reason: 'File operations within the project workspace are permitted.',
  },
  {
    ruleId: 'ALLOW_BUILD_TRIGGER',
    description: 'DevOps agent can trigger CodeBuild',
    priority: 101,
    condition: {
      agents: ['devops'],
      tools: ['trigger_codebuild', 'get_build_status'],
    },
    decision: 'allow',
    riskLevel: 'low',
    reason: 'CodeBuild triggers are scoped to the project build project.',
  },
  {
    ruleId: 'ALLOW_CLOUDWATCH_READ',
    description: 'SRE/Repair agents can read CloudWatch logs and metrics',
    priority: 102,
    condition: {
      agents: ['sre', 'repair'],
      tools: ['query_cloudwatch_logs', 'get_cloudwatch_metrics'],
    },
    decision: 'allow',
    riskLevel: 'low',
    reason: 'Read-only observability access is permitted for diagnosis.',
  },
  {
    ruleId: 'ALLOW_DEV_DEPLOY',
    description: 'DevOps/Repair agents can deploy to development and staging',
    priority: 103,
    condition: {
      agents: ['devops', 'repair'],
      environments: ['development', 'staging'],
      tools: ['update_ecs_service'],
    },
    decision: 'allow',
    riskLevel: 'medium',
    reason: 'Deployments to non-production environments are permitted within project scope.',
  },
  {
    ruleId: 'ALLOW_GIT_OPERATIONS',
    description: 'Coding agent can commit and push within project repository',
    priority: 104,
    condition: {
      agents: ['coding', 'devops'],
      tools: ['git_commit', 'git_push'],
    },
    decision: 'allow',
    riskLevel: 'low',
    reason: 'Git operations scoped to the project repository are permitted.',
  },

  // ── Default deny ──────────────────────────────────────────────────────────
  {
    ruleId: 'DEFAULT_DENY',
    description: 'Default deny for any unmatched action',
    priority: 9999,
    condition: {},
    decision: 'deny',
    riskLevel: 'high',
    reason: 'No policy rule explicitly allows this action. Denied by default.',
  },
];
