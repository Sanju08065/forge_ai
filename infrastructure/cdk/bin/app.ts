#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { PipelineStack } from '../lib/pipeline-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
};

const tags = {
  Project: 'ForgeAI',
  ManagedBy: 'CDK',
  Event: 'FirstCommit2026',
};

// ── Layer 1: Network ─────────────────────────────────────────────────────────
const networkStack = new NetworkStack(app, 'ForgeAI-Network', {
  env,
  tags,
  description: 'ForgeAI — VPC, subnets, security groups',
});

// ── Layer 2: Data ────────────────────────────────────────────────────────────
const dataStack = new DataStack(app, 'ForgeAI-Data', {
  env,
  tags,
  description: 'ForgeAI — DynamoDB, S3, ECR, Secrets Manager',
});
dataStack.addDependency(networkStack);

// ── Layer 3: Compute ─────────────────────────────────────────────────────────
const computeStack = new ComputeStack(app, 'ForgeAI-Compute', {
  env,
  tags,
  description: 'ForgeAI — ECS Cluster, Fargate services, ALB, Step Functions',
  vpc: networkStack.vpc,
  table: dataStack.table,
  artifactBucket: dataStack.artifactBucket,
  appRepository: dataStack.appRepository,
  jwtSecret: dataStack.jwtSecret,
  eventBus: dataStack.eventBus,
});
computeStack.addDependency(dataStack);

// ── Layer 4: Pipeline ────────────────────────────────────────────────────────
const pipelineStack = new PipelineStack(app, 'ForgeAI-Pipeline', {
  env,
  tags,
  description: 'ForgeAI — CodeBuild projects for build/test/push',
  vpc: networkStack.vpc,
  appRepository: dataStack.appRepository,
  artifactBucket: dataStack.artifactBucket,
  appService: computeStack.appService,
  cluster: computeStack.cluster,
  table: dataStack.table,
  orchestratorUrl: computeStack.orchestratorServiceUrl,
});
pipelineStack.addDependency(computeStack);

// ── Layer 5: Monitoring ──────────────────────────────────────────────────────
new MonitoringStack(app, 'ForgeAI-Monitoring', {
  env,
  tags,
  description: 'ForgeAI — CloudWatch dashboards, alarms, log groups',
  appService: computeStack.appService,
  cluster: computeStack.cluster,
  table: dataStack.table,
  eventBus: dataStack.eventBus,
  stateMachine: computeStack.stateMachine,
});

app.synth();
