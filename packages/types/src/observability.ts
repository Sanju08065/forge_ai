import type { ISOTimestamp } from './common';

// ─── CloudWatch query results ─────────────────────────────────────────────────

export interface CloudWatchLogsQuery {
  logGroupName: string;
  queryString: string;
  startTime: ISOTimestamp;
  endTime: ISOTimestamp;
  limit?: number;
}

export interface CloudWatchLogsResult {
  queryId: string;
  results: CloudWatchLogEntry[];
  statistics: {
    bytesScanned: number;
    recordsMatched: number;
    recordsScanned: number;
  };
}

export interface CloudWatchLogEntry {
  timestamp: ISOTimestamp;
  message: string;
  logStream: string;
  level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  fields?: Record<string, string>;
}

// ─── CloudWatch metrics ───────────────────────────────────────────────────────

export interface MetricsQuery {
  namespace: string;
  metricName: string;
  dimensions: Record<string, string>;
  startTime: ISOTimestamp;
  endTime: ISOTimestamp;
  period: number;   // seconds
  stat: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount' | 'p99' | 'p95';
}

export interface MetricsResult {
  timestamps: ISOTimestamp[];
  values: number[];
  label: string;
  unit: string;
}

// ─── Health check ─────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  url: string;
  statusCode?: number;
  responseTimeMs?: number;
  healthy: boolean;
  checkedAt: ISOTimestamp;
  error?: string;
  body?: Record<string, unknown>;
}

// ─── E2E verification ─────────────────────────────────────────────────────────

export interface E2EVerificationResult {
  passed: boolean;
  checks: E2ECheck[];
  runAt: ISOTimestamp;
  durationMs: number;
}

export interface E2ECheck {
  name: string;
  passed: boolean;
  responseCode?: number;
  assertion?: string;
  actualValue?: string;
  expectedValue?: string;
  error?: string;
}
