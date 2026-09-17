import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly appSecurityGroup: ec2.SecurityGroup;
  public readonly serviceSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC: 2 AZs, public + private subnets, 1 NAT gateway ────────────────
    this.vpc = new ec2.Vpc(this, 'ForgeAIVpc', {
      vpcName: 'forgeai-vpc',
      maxAzs: 2,
      natGateways: 1,   // Single NAT to save cost during hackathon
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ── Security group: ALB (public HTTP/HTTPS) ──────────────────────────
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSG', {
      vpc: this.vpc,
      securityGroupName: 'forgeai-alb-sg',
      description: 'ALB — allow inbound HTTP/HTTPS from internet',
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');

    // ── Security group: App containers (from ALB only) ───────────────────
    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSG', {
      vpc: this.vpc,
      securityGroupName: 'forgeai-app-sg',
      description: 'App containers — allow traffic from ALB only',
    });
    this.appSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow from ALB'
    );

    // ── Security group: Internal services (orchestrator, agents, etc.) ───
    this.serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSG', {
      vpc: this.vpc,
      securityGroupName: 'forgeai-service-sg',
      description: 'Internal ForgeAI services — allow internal traffic',
    });
    this.serviceSecurityGroup.addIngressRule(
      this.serviceSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow internal service-to-service traffic'
    );

    // ── VPC Endpoints for AWS services (saves NAT cost) ──────────────────
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });
    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB });

    // ── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId, exportName: 'ForgeAI-VpcId' });
    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: this.vpc.privateSubnets.map((s) => s.subnetId).join(','),
      exportName: 'ForgeAI-PrivateSubnetIds',
    });
  }
}
