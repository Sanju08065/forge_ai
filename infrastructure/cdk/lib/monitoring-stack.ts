import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

interface MonitoringStackProps extends cdk.StackProps {
  appService: ecs.FargateService;
  cluster: ecs.Cluster;
  table: dynamodb.Table;
  eventBus: events.EventBus;
  stateMachine: sfn.StateMachine;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { appService, cluster, table, stateMachine } = props;

    // ── SNS topic for alarm notifications ─────────────────────────────────
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'forgeai-alarms',
      displayName: 'ForgeAI Alarms',
    });

    // ── ECS metrics ────────────────────────────────────────────────────────

    const cpuAlarm = new cloudwatch.Alarm(this, 'AppCpuAlarm', {
      alarmName: 'forgeai-app-cpu-high',
      alarmDescription: 'App CPU utilisation > 80% for 5 minutes',
      metric: appService.metricCpuUtilization({
        period: cdk.Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 80,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const memAlarm = new cloudwatch.Alarm(this, 'AppMemAlarm', {
      alarmName: 'forgeai-app-memory-high',
      alarmDescription: 'App memory utilisation > 85% for 5 minutes',
      metric: appService.metricMemoryUtilization({
        period: cdk.Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 85,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    memAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const runningTasksAlarm = new cloudwatch.Alarm(this, 'RunningTasksAlarm', {
      alarmName: 'forgeai-app-no-running-tasks',
      alarmDescription: 'No running ECS tasks — app may be down',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'RunningTaskCount',
        dimensionsMap: {
          ClusterName: cluster.clusterName,
          ServiceName: appService.serviceName,
        },
        period: cdk.Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    runningTasksAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // ── DynamoDB metrics ───────────────────────────────────────────────────

    const ddbErrorAlarm = new cloudwatch.Alarm(this, 'DdbErrorAlarm', {
      alarmName: 'forgeai-dynamodb-errors',
      alarmDescription: 'DynamoDB user errors detected',
      metric: table.metricUserErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddbErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // ── CloudWatch Dashboard ───────────────────────────────────────────────

    const dashboard = new cloudwatch.Dashboard(this, 'ForgeAIDashboard', {
      dashboardName: 'ForgeAI-Operations',
      defaultInterval: cdk.Duration.hours(3),
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# ForgeAI Operations Dashboard\nAutonomous engineering platform | First Commit 2026',
        width: 24, height: 2,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms: [cpuAlarm, memAlarm, runningTasksAlarm, ddbErrorAlarm],
        width: 8, height: 4,
      }),
      new cloudwatch.GraphWidget({
        title: 'App CPU & Memory',
        left: [
          appService.metricCpuUtilization({ period: cdk.Duration.minutes(1) }),
          appService.metricMemoryUtilization({ period: cdk.Duration.minutes(1) }),
        ],
        width: 8, height: 4,
      }),
      new cloudwatch.GraphWidget({
        title: 'Running ECS Tasks',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ClusterName: cluster.clusterName,
              ServiceName: appService.serviceName,
            },
            period: cdk.Duration.minutes(1),
            statistic: 'Average',
          }),
        ],
        width: 8, height: 4,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Requests',
        left: [
          table.metricConsumedReadCapacityUnits({ period: cdk.Duration.minutes(1) }),
          table.metricConsumedWriteCapacityUnits({ period: cdk.Duration.minutes(1) }),
        ],
        width: 12, height: 4,
      }),
      new cloudwatch.GraphWidget({
        title: 'Step Functions Executions',
        left: [
          stateMachine.metricStarted({ period: cdk.Duration.minutes(5) }),
          stateMachine.metricSucceeded({ period: cdk.Duration.minutes(5) }),
          stateMachine.metricFailed({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12, height: 4,
      })
    );

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=ForgeAI-Operations`,
      exportName: 'ForgeAI-DashboardUrl',
    });
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      exportName: 'ForgeAI-AlarmTopicArn',
    });
  }
}
