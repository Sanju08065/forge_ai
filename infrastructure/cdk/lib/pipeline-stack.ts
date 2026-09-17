import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface PipelineStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appRepository: ecr.Repository;
  artifactBucket: s3.Bucket;
  appService: ecs.FargateService;
  cluster: ecs.Cluster;
  table: dynamodb.Table;
  orchestratorUrl: string;
}

export class PipelineStack extends cdk.Stack {
  public readonly buildProject: codebuild.Project;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { vpc, appRepository, artifactBucket, appService, cluster, table, orchestratorUrl } = props;

    // ── CodeBuild IAM role ────────────────────────────────────────────────
    const buildRole = new iam.Role(this, 'CodeBuildRole', {
      roleName: 'forgeai-codebuild',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
      ],
      resources: ['*'],
    }));

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject', 's3:PutObject', 's3:GetObjectVersion', 's3:GetBucketAcl', 's3:GetBucketLocation',
      ],
      resources: [artifactBucket.bucketArn, `${artifactBucket.bucketArn}/*`],
    }));

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:UpdateService', 'ecs:RegisterTaskDefinition', 'ecs:DescribeServices'],
      resources: ['*'],
    }));

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: ['arn:aws:iam::*:role/forgeai-*'],
    }));

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }));

    // ── CodeBuild log group ───────────────────────────────────────────────
    const buildLogGroup = new logs.LogGroup(this, 'BuildLogGroup', {
      logGroupName: '/aws/codebuild/forgeai-app-build',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Main app build project ────────────────────────────────────────────
    this.buildProject = new codebuild.Project(this, 'AppBuildProject', {
      projectName: 'forgeai-app-build',
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,  // Required for Docker builds
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        ECR_REPO_URI: { value: appRepository.repositoryUri },
        DYNAMODB_TABLE_NAME: { value: table.tableName },
        ECS_CLUSTER: { value: cluster.clusterName },
        ECS_SERVICE: { value: appService.serviceName },
        ORCHESTRATOR_URL: { value: orchestratorUrl },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: [
              'echo "Install phase"',
              'cd apps/api',
              'npm ci',
            ],
          },
          pre_build: {
            commands: [
              'echo "Pre-build: lint + typecheck + tests"',
              'npm run typecheck',
              'npm run test -- --forceExit --runInBand',
              'echo "Tests passed"',
              'echo "Logging in to ECR"',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI',
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH:-latest}',
            ],
          },
          build: {
            commands: [
              'echo "Build phase: Docker build"',
              'docker build -t $ECR_REPO_URI:$IMAGE_TAG -t $ECR_REPO_URI:latest .',
            ],
          },
          post_build: {
            commands: [
              'echo "Post-build: push to ECR"',
              'docker push $ECR_REPO_URI:$IMAGE_TAG',
              'docker push $ECR_REPO_URI:latest',
              'export IMAGE_URI=$ECR_REPO_URI:$IMAGE_TAG',
              'echo "IMAGE_URI=$IMAGE_URI"',
              'echo "Notifying orchestrator of build success"',
              'curl -s -X POST $ORCHESTRATOR_URL/api/v1/callbacks/build -H "Content-Type: application/json" -d "{\"projectId\":\"$PROJECT_ID\",\"buildId\":\"$CODEBUILD_BUILD_ID\",\"status\":\"SUCCEEDED\",\"imageUri\":\"$IMAGE_URI\"}" || true',
            ],
          },
        },
        artifacts: {
          files: ['apps/api/dist/**/*'],
          'base-directory': '.',
        },
        cache: {
          paths: ['apps/api/node_modules/**/*'],
        },
      }),
      logging: {
        cloudWatch: {
          logGroup: buildLogGroup,
          prefix: 'build',
          enabled: true,
        },
      },
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BuildProjectName', {
      value: this.buildProject.projectName,
      exportName: 'ForgeAI-BuildProjectName',
    });
  }
}
