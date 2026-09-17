import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  type ResultField,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import type { CloudWatchLogsQuery, CloudWatchLogsResult, CloudWatchLogEntry, MetricsQuery, MetricsResult } from '@forgeai/types';

const logsClient = new CloudWatchLogsClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const metricsClient = new CloudWatchClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

// ─── Query CloudWatch Logs Insights ──────────────────────────────────────────

export async function queryCloudWatchLogs(query: CloudWatchLogsQuery): Promise<CloudWatchLogsResult> {
  const startResp = await logsClient.send(
    new StartQueryCommand({
      logGroupName: query.logGroupName,
      queryString: query.queryString,
      startTime: Math.floor(new Date(query.startTime).getTime() / 1000),
      endTime: Math.floor(new Date(query.endTime).getTime() / 1000),
      limit: query.limit ?? 100,
    })
  );

  const queryId = startResp.queryId;
  if (!queryId) throw new Error('CloudWatch query did not return a queryId');

  // Poll until complete (max 30s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await logsClient.send(new GetQueryResultsCommand({ queryId }));

    if (result.status === 'Complete') {
      const entries: CloudWatchLogEntry[] = (result.results ?? []).map((row: ResultField[]) => {
        const fields: Record<string, string> = {};
        for (const field of row) {
          if (field.field && field.value) fields[field.field] = field.value;
        }
        return {
          timestamp: fields['@timestamp'] ?? new Date().toISOString(),
          message: fields['@message'] ?? '',
          logStream: fields['@logStream'] ?? '',
          level: detectLogLevel(fields['@message'] ?? ''),
          fields,
        };
      });

      return {
        queryId,
        results: entries,
        statistics: {
          bytesScanned: result.statistics?.bytesScanned ?? 0,
          recordsMatched: result.statistics?.recordsMatched ?? 0,
          recordsScanned: result.statistics?.recordsScanned ?? 0,
        },
      };
    }

    if (result.status === 'Failed' || result.status === 'Cancelled') {
      throw new Error(`CloudWatch query ${result.status}`);
    }
  }

  throw new Error('CloudWatch Logs query timed out after 30 seconds');
}

function detectLogLevel(message: string): CloudWatchLogEntry['level'] {
  const m = message.toLowerCase();
  if (m.includes('error') || m.includes('exception') || m.includes('fatal')) return 'ERROR';
  if (m.includes('warn')) return 'WARN';
  if (m.includes('debug')) return 'DEBUG';
  return 'INFO';
}

// ─── Get CloudWatch Metrics ───────────────────────────────────────────────────

export async function getCloudWatchMetrics(query: MetricsQuery): Promise<MetricsResult> {
  const result = await metricsClient.send(
    new GetMetricStatisticsCommand({
      Namespace: query.namespace,
      MetricName: query.metricName,
      Dimensions: Object.entries(query.dimensions).map(([Name, Value]) => ({ Name, Value })),
      StartTime: new Date(query.startTime),
      EndTime: new Date(query.endTime),
      Period: query.period,
      Statistics: [query.stat.startsWith('p') ? undefined : query.stat].filter(Boolean) as string[],
      ExtendedStatistics: query.stat.startsWith('p') ? [query.stat] : undefined,
    })
  );

  const datapoints = (result.Datapoints ?? []).sort(
    (a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0)
  );

  return {
    timestamps: datapoints.map((d) => d.Timestamp?.toISOString() ?? ''),
    values: datapoints.map((d) => d.Average ?? d.Sum ?? d.Maximum ?? d.Minimum ?? 0),
    label: `${query.metricName} (${query.stat})`,
    unit: result.Label ?? query.metricName,
  };
}

// ─── Pre-built queries for ForgeAI repair loop ────────────────────────────────

export async function getRecentErrors(
  logGroupName: string,
  minutesBack = 15
): Promise<CloudWatchLogsResult> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - minutesBack * 60 * 1000);

  return queryCloudWatchLogs({
    logGroupName,
    queryString: `
      fields @timestamp, @message, @logStream
      | filter @message like /(?i)(error|exception|fatal|5[0-9]{2})/
      | sort @timestamp desc
      | limit 50
    `,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    limit: 50,
  });
}
