// ─── Common primitives ───────────────────────────────────────────────────────

export type ISOTimestamp = string; // ISO-8601 e.g. "2026-09-17T10:00:00.000Z"
export type ULID = string;         // Universally Unique Lexicographically Sortable ID
export type SemVer = string;       // e.g. "1.0.0"

export type Environment = 'development' | 'staging' | 'production';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  total?: number;
}

export interface AuditMeta {
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  createdBy: string;
}
