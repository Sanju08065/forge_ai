# ForgeAI
### From intent to production.

> Give ForgeAI a product requirement. It plans, builds, tests, deploys, observes, repairs, and verifies the software — autonomously, with a complete engineering ledger.

**AWS × WeMakeDevs — Bharat Builds Tour 2026 · First Commit · Ship It track**

---

## Problem

Developers can generate code quickly today. But turning a natural-language requirement into tested, deployed, observable, and self-healing software still requires substantial manual coordination across many disconnected steps:

```
idea → requirements → architecture → code → tests → build
     → infrastructure → deployment → monitoring → debugging → repair
```

AI coding tools solve one step. ForgeAI automates the entire chain.

---

## Solution

ForgeAI is an **autonomous engineering control plane**. You type a requirement. ForgeAI:

1. **Extracts** structured requirements and acceptance criteria
2. **Designs** the architecture, data model, and API
3. **Generates** complete, working source code
4. **Writes** and runs tests
5. **Builds** a Docker image via CodeBuild
6. **Deploys** to AWS ECS Fargate with a live URL
7. **Observes** the deployment with CloudWatch
8. **Diagnoses** failures from log evidence
9. **Repairs** — patches the config/code, redeploys, verifies
10. **Records** every decision in the Engineering Ledger

---

## Why ForgeAI

The key differentiator is the **closed engineering loop**. ForgeAI does not stop at code generation. It treats build failures, deployment failures, and runtime incidents as actionable engineering state — and resolves them autonomously using evidence, not guesswork.

---

## Architecture

```
User Prompt
    │
    ▼
Orchestrator ──► Step Functions Standard Workflow
    │                        │
    │            ┌───────────┼───────────────┐
    │            ▼           ▼               ▼
    │       Product      Architect       Coding
    │       Agent        Agent           Agent
    │            │           │               │
    │            └───────────┴───────────────┘
    │                        │ (via Bedrock Converse API)
    │                        ▼
    │                  CodeBuild
    │                  (build + test + push to ECR)
    │                        │
    │                        ▼
    │              ECS Fargate (live app)
    │                        │
    │               ┌────────┴────────┐
    │           PASS                FAIL
    │               │                │
    │         ✅ Done          CloudWatch Logs
    │                                │
    │                         SRE Agent
    │                         (collect evidence)
    │                                │
    │                         Repair Agent
    │                         (diagnose + patch)
    │                                │
    │                         Critic Agent
    │                         (challenge the fix)
    │                                │
    │                         Apply + Redeploy
    │                                │
    │                         Health Check
    │                         (loop max 3×)
    │
    ▼
Engineering Ledger
```

---

## AWS Services

| Service | Role |
|---|---|
| **Amazon Bedrock** | LLM reasoning — Claude Sonnet 5 + Opus 4.6 via Converse API |
| **AWS Step Functions Standard** | Durable workflow orchestration — exactly-once, full audit history |
| **Amazon ECS + Fargate** | Serverless containers for the generated app |
| **AWS CodeBuild** | Clean reproducible build, test, and Docker push |
| **Amazon DynamoDB** | All project state — single-table, PITR enabled |
| **Amazon S3** | Build artifacts, test reports, workspace snapshots |
| **Amazon ECR** | Container image registry with lifecycle policies |
| **Amazon CloudWatch** | Logs, metrics, alarms — the SRE Agent reads this |
| **Amazon EventBridge** | Custom event bus decoupling all platform events |
| **AWS Lambda** | Step Functions task runners per workflow phase |
| **AWS Secrets Manager** | JWT secret — no secrets in code or env vars |
| **AWS CDK v2** | All infrastructure as TypeScript — 5 stacks |

---

## Autonomous Engineering Loop

```
OBSERVE → THINK → ACT → VERIFY → SUCCESS? → DONE
                                     │
                                    NO
                                     │
                              DIAGNOSE → REPAIR → VERIFY
                              (max 3 attempts)
```

---

## Failure Recovery

State is separated from compute. If any container dies:

| Layer | Failure | Recovery |
|---|---|---|
| ECS task crashes | Step Functions workflow state preserved in DynamoDB | ECS restarts task |
| Browser disconnects | Workflow continues server-side | UI reconnects and polls |
| Repair fails 3× | Step Functions reaches HUMAN_REQUIRED state | Alert sent via SNS |
| DynamoDB data | PITR enabled — recover to any second in last 35 days | Restore from PITR |

---

## Engineering Ledger

Every significant event is recorded with agent attribution, timestamps, and linked entities:

```
✅ 09:00:01  Requirement extracted: "Task management app with auth"  [product]
✅ 09:00:08  Architecture designed: Node.js + Express + DynamoDB     [architect]
✅ 09:01:12  6 source files generated                               [coding]
✅ 09:02:03  3 test files generated — 14 tests written              [testing]
✅ 09:03:45  Build SUCCEEDED — image pushed to ECR                  [devops]
✅ 09:04:20  Deployed to ECS — http://forgeai-demo.elb.amazonaws.com [devops]
❌ 09:04:35  Health check FAILED — /health/ready → 503              [system]
🔍 09:04:36  Evidence collected — DYNAMODB_TABLE_NAME not configured [sre]
🔧 09:04:42  Repair proposed: add DYNAMODB_TABLE_NAME env var        [repair]
✅ 09:04:43  Critic approved repair (risk: low)                     [critic]
🔧 09:04:50  Repair applied — ECS task definition updated           [repair]
✅ 09:05:30  Health check PASSED — all endpoints responding         [system]
✅ 09:05:31  Lifecycle complete                                      [system]
```

---

## Demo

The demo video shows one complete end-to-end run:

1. Type: *"Build a task management web application with authentication, CRUD tasks, filtering, and a REST API"*
2. Watch requirements, architecture, and files appear in the Engineering Ledger
3. CodeBuild runs — tests pass, image pushed
4. App deploys to ECS — live URL is live
5. **Controlled failure** — app crashes on `/api/v1/tasks` (missing env var)
6. CloudWatch logs show the error
7. ForgeAI diagnoses, patches, redeploys
8. Health check passes — Engineering Ledger shows the full chain

---

## Screenshots

> Add screenshots of:
> - The ForgeAI dashboard with a running project
> - The Engineering Ledger timeline
> - CloudWatch logs showing the error
> - The repair being applied
> - The final health check passing

---

## Setup

### Prerequisites
- Node.js 20+
- Docker Desktop
- AWS CLI v2 configured (`aws configure`)
- AWS CDK v2 (`npm install -g aws-cdk`)

### Local development

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/forgeai
cd forgeai
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env — set JWT_SECRET to any 32+ char string

# 3. Start local stack (DynamoDB Local + API)
docker compose up

# 4. Verify API is working
curl http://localhost:3000/health
```

### Deploy to AWS

```bash
# 1. Bootstrap CDK (first time only)
cd infrastructure/cdk
npm install
npx cdk bootstrap

# 2. Deploy all stacks (takes ~10 minutes)
npx cdk deploy --all --require-approval never

# 3. Note the outputs — copy AppUrl to your submission
```

---

## Environment Variables

See [`.env.example`](.env.example) for all variables with descriptions.

Critical ones for deployment:
- `DYNAMODB_TABLE_NAME` — set by CDK output
- `JWT_SECRET` — auto-generated in Secrets Manager, read at runtime
- `ECR_REPO_URI` — set by CDK output
- `FORGEAI_STATE_MACHINE_ARN` — set by CDK output

---

## Deployment

```bash
# Full CDK deploy (all 5 stacks)
npm run infra:deploy

# Individual stacks
npm run infra:deploy -- ForgeAI-Network
npm run infra:deploy -- ForgeAI-Data
npm run infra:deploy -- ForgeAI-Compute
npm run infra:deploy -- ForgeAI-Pipeline
npm run infra:deploy -- ForgeAI-Monitoring

# Diff before deploy
npm run infra:diff
```

---

## Tests

```bash
# All tests
npm test

# Single package
cd apps/api && npm test

# Coverage
cd apps/api && npm run test:coverage
```

---

## Security

- All secrets stored in AWS Secrets Manager — nothing hardcoded
- JWT with configurable expiry (default 1 hour)
- Helmet.js security headers on all HTTP responses
- Rate limiting: 200 req / 15 min per IP
- ECS tasks run as non-root user
- VPC with private subnets — app containers not directly internet-accessible
- IAM least-privilege roles for every service
- Policy Gateway enforces agent action boundaries at application level
- ECR image scanning on push

---

## Cost Controls

- Fargate billed only while running — stop when idle
- CodeBuild billed per build-minute — no idle machines
- Single NAT Gateway (not one per AZ)
- DynamoDB pay-per-request — no provisioned capacity
- S3 lifecycle rules expire old artifacts after 30 days
- ECR lifecycle keeps only last 10 images
- CloudWatch log retention set to 1 week

---

## Limitations

- Supports Node.js + TypeScript + Express stack only (MVP scope)
- One AWS deployment target: ECS Fargate
- Repair loop handles env var and simple config errors reliably; complex code bugs require human review
- No persistent EFS workspace in MVP — workspace rebuilt from generated files each run
- Step Functions workflow timeout: 1 hour

---

## Future Roadmap

| Phase | Expansion |
|---|---|
| V2 | Multiple frameworks (Python/FastAPI, Go) and deployment targets |
| V3 | Persistent engineering graph, richer impact analysis |
| V4 | Production monitoring and continuous self-healing |
| V5 | Team collaboration, approvals, enterprise policy controls |
| V6 | Multi-project organization, cost intelligence, reusable engineering memory |

---

## Team

**Sanjay Ratnam** — solo builder

---

## AI Tools Used

- **Amazon Bedrock (Claude Sonnet 5, Claude Opus 4.6)** — all agent reasoning, code generation, repair diagnosis
- **Kiro IDE (Claude Sonnet 4.6)** — development assistance during the hackathon

---

## Third-Party Licenses

| Package | License |
|---|---|
| express | MIT |
| @aws-sdk/* | Apache-2.0 |
| zod | MIT |
| jsonwebtoken | MIT |
| bcryptjs | MIT |
| helmet | MIT |
| react | MIT |
| tailwindcss | MIT |
| aws-cdk-lib | Apache-2.0 |
| ulid | MIT |

All dependencies are open-source with permissive licenses compatible with this project.

---

*Built for AWS × WeMakeDevs First Commit 2026 — Bharat Builds Tour · September 17–20, 2026*
