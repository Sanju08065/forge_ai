import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  table: dynamodb.Table;
  artifactBucket: s3.Bucket;
  appRepository: ecr.Repository;
  jwtSecret: secretsmanager.Secret;
  eventBus: events.EventBus;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly appService: ecs.FargateService;
  public readonly stateMachine: sfn.StateMachine;
  public readonly orchestratorServiceUrl: string;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, table, artifactBucket, appRepository, jwtSecret, eventBus } = props;

    // ── ECS Cluster ──────────────────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'ForgeAICluster', {
      clusterName: 'forgeai',
      vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    // ── IAM roles ────────────────────────────────────────────────────────
    const taskExecutionRole = new iam.Role(this, 'EcsExecutionRole', {
      roleName: 'forgeai-ecs-execution',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    jwtSecret.grantRead(taskExecutionRole);

    const appTaskRole = new iam.Role(this, 'AppTaskRole', {
      roleName: 'forgeai-app-task',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    table.grantReadWriteData(appTaskRole);
    artifactBucket.grantReadWrite(appTaskRole);

    // ── App Task Definition (the generated task management API) ─────────
    const appTaskDef = new ecs.FargateTaskDefinition(this, 'AppTaskDef', {
      family: 'forgeai-app-development',
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: taskExecutionRole,
      taskRole: appTaskRole,
    });

    const appLogGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: '/ecs/forgeai-app-development',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    appTaskDef.addContainer('app', {
      containerName: 'app',
      // Placeholder image — CodeBuild will push the real image
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20-alpine'),
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        AWS_REGION: this.region,
        // NOTE: DYNAMODB_TABLE_NAME is intentionally OMITTED here.
        // This is the controlled failure scenario for the ForgeAI demo.
        // The Repair Agent will diagnose this and add it via update_ecs_service.
        // To toggle: uncomment the line below and redeploy.
        // DYNAMODB_TABLE_NAME: table.tableName,
      },
      secrets: {
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: appLogGroup,
        streamPrefix: 'app',
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ── ALB + Fargate Service (the deployed app) ─────────────────────────
    const appServicePattern = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'AppService',
      {
        cluster: this.cluster,
        serviceName: 'forgeai-app-development',
        taskDefinition: appTaskDef,
        desiredCount: 1,
        publicLoadBalancer: true,
        assignPublicIp: false,
        healthCheckGracePeriod: cdk.Duration.seconds(120),
        circuitBreaker: { rollback: false },  // Disable auto-rollback so repair loop can observe
      }
    );

    // Health check path
    appServicePattern.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    this.appService = appServicePattern.service;
    this.orchestratorServiceUrl = `http://${appServicePattern.loadBalancer.loadBalancerDnsName}`;

    // ── Step Functions: ForgeAI workflow ──────────────────────────────────
    // Lambda to invoke agent phases
    const agentLambdaRole = new iam.Role(this, 'AgentLambdaRole', {
      roleName: 'forgeai-agent-lambda',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    agentLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:Converse',
          'dynamodb:*',
          'ecs:*',
          'codebuild:*',
          'cloudwatch:*',
          'logs:*',
          's3:*',
          'ecr:*',
          'events:PutEvents',
          'secretsmanager:GetSecretValue',
        ],
        resources: ['*'],
      })
    );

    const agentLambda = new lambda.Function(this, 'AgentLambda', {
      functionName: 'forgeai-agent-runner',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const https = require('https');
        exports.handler = async (event) => {
          // In production: call the agents service via internal ALB.
          // For hackathon MVP: agent logic runs inline here or via HTTP to agents service.
          console.log('Phase:', event.phase);
          return { success: true, output: {}, inputTokens: 0, outputTokens: 0 };
        };
      `),
      timeout: cdk.Duration.minutes(14),
      memorySize: 512,
      role: agentLambdaRole,
      environment: {
        DYNAMODB_TABLE_NAME: table.tableName,
        FORGEAI_EVENT_BUS_NAME: eventBus.eventBusName,
        AWS_REGION_NAME: this.region,
      },
    });

    // Grant Lambda invocation rights on Step Functions
    const invokeAgentTask = (phase: string): sfnTasks.LambdaInvoke =>
      new sfnTasks.LambdaInvoke(this, `Run-${phase}`, {
        lambdaFunction: agentLambda,
        payload: sfn.TaskInput.fromObject({
          projectId: sfn.JsonPath.stringAt('$.projectId'),
          phase,
          payload: sfn.JsonPath.objectAt('$'),
        }),
        resultPath: `$.${phase.toLowerCase().replace(/_/g, '')}Result`,
        retryOnServiceExceptions: true,
      });

    // ── State machine definition ──────────────────────────────────────────
    const extractRequirements = invokeAgentTask('EXTRACT_REQUIREMENTS');
    const designArchitecture  = invokeAgentTask('DESIGN_ARCHITECTURE');
    const generateCode        = invokeAgentTask('GENERATE_CODE');
    const generateTests       = invokeAgentTask('GENERATE_TESTS');
    const securityReview      = invokeAgentTask('SECURITY_REVIEW');
    const triggerBuild        = invokeAgentTask('TRIGGER_BUILD');
    const collectEvidence     = invokeAgentTask('COLLECT_EVIDENCE');
    const generateRepair      = invokeAgentTask('GENERATE_REPAIR');

    // Wait for CodeBuild (task token pattern — CodeBuild calls back when done)
    const waitForBuild = new sfn.Wait(this, 'WaitForBuild', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(30)),
    });

    // Health check task
    const healthCheckTask = new sfnTasks.LambdaInvoke(this, 'HealthCheck', {
      lambdaFunction: agentLambda,
      payload: sfn.TaskInput.fromObject({
        projectId: sfn.JsonPath.stringAt('$.projectId'),
        phase: 'HEALTH_CHECK',
        payload: sfn.JsonPath.objectAt('$'),
      }),
      resultPath: '$.healthCheckResult',
    });

    // Health check pass/fail branch
    const healthPassed = sfn.Condition.booleanEquals('$.healthCheckResult.Payload.success', true);
    const maxRepairsReached = sfn.Condition.numberGreaterThanEquals('$.repairAttempts', 3);

    const repairChoice = new sfn.Choice(this, 'MaxRepairsReached?')
      .when(maxRepairsReached, new sfn.Fail(this, 'RepairLimitExceeded', {
        error: 'MaxRepairsReached',
        cause: 'Repair loop exceeded maximum attempts (3). Human intervention required.',
      }))
      .otherwise(
        collectEvidence
          .next(generateRepair)
          .next(
            new sfn.Choice(this, 'RepairApproved?')
              .when(
                sfn.Condition.booleanEquals('$.generaterepairResult.Payload.success', true),
                new sfn.Pass(this, 'IncrementRepairAttempts', {
                  parameters: {
                    'projectId.$': '$.projectId',
                    'repairAttempts.$': sfn.JsonPath.mathAdd(sfn.JsonPath.numberAt('$.repairAttempts'), 1),
                  },
                }).next(healthCheckTask)
              )
              .otherwise(new sfn.Fail(this, 'RepairRejected', { error: 'RepairRejected', cause: 'Critic rejected the repair' }))
          )
      );

    const healthCheckChoice = new sfn.Choice(this, 'HealthCheckPassed?')
      .when(healthPassed, new sfn.Succeed(this, 'LifecycleComplete'))
      .otherwise(repairChoice);

    // ── Full workflow chain ────────────────────────────────────────────
    const definition = new sfn.Pass(this, 'InitWorkflow', {
      parameters: {
        'projectId.$': '$.projectId',
        'prompt.$': '$.prompt',
        repairAttempts: 0,
      },
    })
      .next(extractRequirements)
      .next(designArchitecture)
      .next(generateCode)
      .next(generateTests)
      .next(securityReview)
      .next(triggerBuild)
      .next(waitForBuild)
      .next(healthCheckTask)
      .next(healthCheckChoice);

    // Repair loop feeds back into healthCheckTask via repairChoice → healthCheckTask → healthCheckChoice

    const sfnLogGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/states/forgeai-workflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, 'ForgeAIWorkflow', {
      stateMachineName: 'forgeai-engineering-workflow',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.hours(1),
      logs: {
        destination: sfnLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `http://${appServicePattern.loadBalancer.loadBalancerDnsName}`,
      exportName: 'ForgeAI-AppUrl',
      description: 'Live demo URL for Ship It submission',
    });
    new cdk.CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName, exportName: 'ForgeAI-ClusterName' });
    new cdk.CfnOutput(this, 'StateMachineArn', { value: this.stateMachine.stateMachineArn, exportName: 'ForgeAI-StateMachineArn' });
    new cdk.CfnOutput(this, 'AppLogGroup', { value: appLogGroup.logGroupName, exportName: 'ForgeAI-AppLogGroup' });
  }
}
