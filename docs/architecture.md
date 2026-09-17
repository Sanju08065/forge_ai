# ForgeAI — Architecture

## Principle

> AI decides. Step Functions coordinates. Policy controls. Workers execute. Durable storage remembers. CloudWatch proves.

Compute is disposable. Project state is not. Every container, Lambda, and browser session can disappear without losing a single requirement, file, build result, or repair decision.

---

## High-Level Flow

```
User types a requirement
        │
        ▼
  API Gateway / ALB
        │
        ▼
  Orchestrator (Express)
        │  Creates project record in DynamoDB
        │  Starts Step Functions Standard Workflow
        ▼
  Step Functions Workflow
  ┌─────────────────────────────────────────────────────┐
  │  EXTRACT_REQUIREMENTS  → Product Agent              │
  │  DESIGN_ARCHITECTURE   → Architect Agent            │
  │  GENERATE_CODE         → Coding Agent               │
  │  GENERATE_TESTS        → Testing Agent              │
  │  SECURITY_REVIEW       → Security Agent             │
  │  TRIGGER_BUILD         → DevOps Agent → CodeBuild   │
  │  WAIT_FOR_BUILD        ← CodeBuild callback         │
  │  HEALTH_CHECK          → /health + E2E              │
  │         │                                           │
  │    PASS ┘  FAIL                                     │
  │            │                                        │
  │     COLLECT_EVIDENCE   → SRE Agent → CloudWatch     │
  │     GENERATE_REPAIR    → Repair Agent               │
  │     CRITIQUE_REPAIR    → Critic Agent               │
  │     APPLY_REPAIR       → update_ecs_service         │
  │     HEALTH_CHECK       ← verify fix worked          │
  │     (loop max 3×)                                   │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  Engineering Ledger (DynamoDB)
  Every decision, file, build, deployment, incident, repair
```

---

## AWS Service Map

| Service | ForgeAI Role |
|---|---|
| **Amazon Bedrock** | LLM reasoning via Converse API. Claude Sonnet 5 for most agents, Claude Opus 4.6 for Repair + Critic. Tool-use pattern for all agent-tool interactions. |
| **AWS Step Functions Standard** | Durable workflow state. Exactly-once execution. Up to 1-year duration. Full audit history. Callback pattern for async CodeBuild waits. |
| **Amazon ECS + Fargate** | Hosts the generated task-management app. Serverless containers — no cluster management. Per-task billing. |
| **AWS CodeBuild** | Clean, reproducible build environment. install → typecheck → test → docker build → push to ECR → notify orchestrator. Parallel test execution enabled. |
| **Amazon DynamoDB** | Single-table design. All project state: requirements, tasks, workflow state, ledger events, builds, deployments, incidents, repairs. PITR enabled. |
| **Amazon S3** | Build artifacts, test reports, workspace snapshots. Lifecycle rules expire builds after 30 days. |
| **Amazon ECR** | Container image registry. Lifecycle policy keeps last 10 images. Enhanced scanning on push. |
| **Amazon CloudWatch** | Logs, metrics, alarms, Logs Insights queries. The SRE Agent queries this during the repair loop. New log-based alarms trigger incident detection. |
| **Amazon EventBridge** | Custom event bus (`forgeai-events`). Decouples all platform events. Rules route build/deploy/incident/repair events to subscribers. |
| **AWS Lambda** | Step Functions task runners for each workflow phase. Lightweight, fast cold start, billed only during execution. |
| **Amazon EFS** | Optional persistent workspace volume mounted into Fargate tasks. Survives task restarts. Omitted for hackathon MVP — workspace rebuilt from Git. |
| **AWS Secrets Manager** | JWT signing secret. No secrets in environment variables or source code. Rotatable. |
| **AWS CDK v2** | All infrastructure defined as TypeScript. 5 stacks: Network → Data → Compute → Pipeline → Monitoring. |
| **Amazon IAM** | Least-privilege roles for every service. Policy Gateway adds application-level authorization on top. |

---

## Repository Structure

```
forgeai/
├── apps/
│   ├── api/                  # The generated task-management app (Express + DynamoDB)
│   └── web/                  # ForgeAI dashboard (React + Vite + Tailwind)
├── services/
│   ├── orchestrator/         # Project lifecycle API + Step Functions integration
│   ├── policy-gateway/       # Action authorization layer
│   ├── resource-manager/     # ECS task + service lifecycle
│   ├── agents/               # All 10 AI agents + Bedrock Converse loop
│   └── tool-runtime/         # Tool implementations (file, CloudWatch, CodeBuild, ECS)
├── packages/
│   ├── types/                # Shared TypeScript types (single source of truth)
│   ├── events/               # EventBridge event schemas + filter patterns
│   └── policy/               # Policy engine + default ruleset
├── infrastructure/
│   └── cdk/
│       ├── bin/app.ts        # CDK app entry point
│       └── lib/
│           ├── network-stack.ts    # VPC, subnets, security groups
│           ├── data-stack.ts       # DynamoDB, S3, ECR, Secrets Manager, EventBridge
│           ├── compute-stack.ts    # ECS, Fargate, ALB, Step Functions
│           ├── pipeline-stack.ts   # CodeBuild
│           └── monitoring-stack.ts # CloudWatch alarms + dashboard
├── docs/
│   └── architecture.md       # This file
├── buildspec.yml             # CodeBuild build specification
├── docker-compose.yml        # Local development stack
└── README.md
```

---

## Agents

| Agent | Responsibility | Model |
|---|---|---|
| **Supervisor** | Phase routing, context management, lifecycle | Claude Sonnet 5 |
| **Product** | Extract requirements + acceptance criteria from prompt | Claude Sonnet 5 |
| **Architect** | Design stack, data model, API, deployment topology | Claude Sonnet 5 |
| **Coding** | Generate all source files via write_file tool | Claude Sonnet 5 |
| **Testing** | Generate Jest + Supertest test suites | Claude Sonnet 5 |
| **DevOps** | Write Dockerfile + buildspec, trigger CodeBuild | Claude Sonnet 5 |
| **Security** | Audit code for vulnerabilities before build | Claude Sonnet 5 |
| **SRE** | Query CloudWatch Logs, collect failure evidence | Claude Sonnet 5 |
| **Repair** | Diagnose root cause, apply minimal patch | Claude Opus 4.6 |
| **Critic** | Challenge the repair, find flaws before it's applied | Claude Opus 4.6 |

---

## Policy Gateway

Every tool call made by any agent goes through the Policy Engine before execution.

```
Agent → tool request → Policy Gateway → ALLOW / DENY / REQUIRE_HUMAN_APPROVAL → Tool
```

Rules evaluated in priority order (lower = higher priority):

1. **BLOCK_PRODUCTION_DESTRUCTIVE** — Block destructive operations in production (priority 1)
2. **BLOCK_CROSS_PROJECT_ACCESS** — Agents cannot access files outside their project (priority 2)
3. **BLOCK_UNBOUNDED_RESOURCES** — No `--no-limit` style flags (priority 3)
4. **REQUIRE_APPROVAL_PRODUCTION_DEPLOY** — Production deployments need human approval (priority 11)
5. **REQUIRE_APPROVAL_HIGH_RISK_REPAIR** — DB migrations by Repair Agent need approval (priority 12)
6. **ALLOW_*_rules** — Explicit allows for workspace files, builds, CloudWatch reads, dev deploys (priority 100+)
7. **DEFAULT_DENY** — Deny anything not explicitly allowed (priority 9999)

---

## The Repair Loop — Demo Scenario

The controlled failure is built into the CDK stack intentionally:

```typescript
// infrastructure/cdk/lib/compute-stack.ts
environment: {
  NODE_ENV: 'production',
  PORT: '3000',
  AWS_REGION: this.region,
  // DYNAMODB_TABLE_NAME deliberately omitted ← causes startup crash
}
```

**What happens:**
1. App deploys successfully (container starts, `/health` returns 200)
2. Any request to `/api/v1/tasks` → 500 (DynamoDB client has no table name)
3. `/health/ready` → 503 (DYNAMODB_TABLE_NAME not configured)
4. CloudWatch captures error logs
5. SRE Agent queries Logs Insights → finds `DYNAMODB_TABLE_NAME not configured`
6. Repair Agent diagnoses: `repairType: "env_var_missing"`
7. Critic Agent reviews and approves
8. Repair Agent calls `update_ecs_service` with `envVars: { DYNAMODB_TABLE_NAME: "forgeai-main" }`
9. ECS force-deploys new task definition with env var added
10. Health check passes → repair verified → Engineering Ledger records the full chain

---

## Cost (4-day hackathon estimate)

| Service | Usage | Estimated cost |
|---|---|---|
| Bedrock (Claude Sonnet 5) | ~500K input + 100K output tokens | ~$1.50 |
| ECS Fargate | 4 days × 0.5 vCPU / 1 GB | ~$0.80 |
| Step Functions Standard | ~10 workflow runs × 50 states | ~$0.01 |
| CodeBuild | ~20 builds × 5 min | ~$0.20 |
| DynamoDB | Pay-per-request, low volume | ~$0.05 |
| S3 | Minimal storage | ~$0.01 |
| CloudWatch | Logs + metrics | ~$0.50 |
| NAT Gateway | 4 days | ~$1.50 |
| **Total** | | **~$4.57** |

The $100 hackathon credits cover this ~20×. The $3,000 Ship It prize covers it ~650×.
