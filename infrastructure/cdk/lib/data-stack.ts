import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';

export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly artifactBucket: s3.Bucket;
  public readonly appRepository: ecr.Repository;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // ── DynamoDB: single-table design ────────────────────────────────────
    this.table = new dynamodb.Table(this, 'ForgeAITable', {
      tableName: 'forgeai-main',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: for listing all projects by creation time
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── S3: artifacts, reports, snapshots ───────────────────────────────
    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `forgeai-artifacts-${this.account}-${this.region}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'expire-old-artifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
          prefix: 'builds/',
        },
        {
          id: 'expire-old-reports',
          enabled: true,
          expiration: cdk.Duration.days(14),
          prefix: 'reports/',
        },
      ],
    });

    // ── ECR: container image registry ────────────────────────────────────
    this.appRepository = new ecr.Repository(this, 'AppRepository', {
      repositoryName: 'forgeai-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Keep only last 10 images',
          maxImageCount: 10,
          tagStatus: ecr.TagStatus.ANY,
        },
      ],
    });

    // ── Secrets Manager: JWT secret ──────────────────────────────────────
    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'forgeai/jwt-secret',
      description: 'JWT signing secret for ForgeAI API',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    // ── EventBridge: ForgeAI custom event bus ────────────────────────────
    this.eventBus = new events.EventBus(this, 'ForgeAIEventBus', {
      eventBusName: 'forgeai-events',
    });

    // ── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName, exportName: 'ForgeAI-TableName' });
    new cdk.CfnOutput(this, 'BucketName', { value: this.artifactBucket.bucketName, exportName: 'ForgeAI-ArtifactBucket' });
    new cdk.CfnOutput(this, 'EcrUri', { value: this.appRepository.repositoryUri, exportName: 'ForgeAI-EcrUri' });
    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName, exportName: 'ForgeAI-EventBusName' });
  }
}
