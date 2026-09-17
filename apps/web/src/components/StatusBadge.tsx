import { clsx } from 'clsx';
import type { ProjectStatus } from '@forgeai/types';

const STATUS_MAP: Record<ProjectStatus, { label: string; cls: string }> = {
  pending:      { label: 'Pending',      cls: 'badge-gray' },
  requirements: { label: 'Requirements', cls: 'badge-blue' },
  architecture: { label: 'Architecture', cls: 'badge-blue' },
  coding:       { label: 'Coding',       cls: 'badge-blue' },
  testing:      { label: 'Testing',      cls: 'badge-blue' },
  building:     { label: 'Building',     cls: 'badge-yellow' },
  deploying:    { label: 'Deploying',    cls: 'badge-yellow' },
  running:      { label: 'Running',      cls: 'badge-green' },
  failed:       { label: 'Failed',       cls: 'badge-red' },
  repairing:    { label: 'Repairing',    cls: 'badge-yellow' },
  repaired:     { label: 'Repaired',     cls: 'badge-green' },
  idle:         { label: 'Idle',         cls: 'badge-gray' },
  suspended:    { label: 'Suspended',    cls: 'badge-gray' },
  completed:    { label: 'Completed',    cls: 'badge-green' },
};

interface StatusBadgeProps {
  status: ProjectStatus;
  pulse?: boolean;
}

export function StatusBadge({ status, pulse = false }: StatusBadgeProps): JSX.Element {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: 'badge-gray' };
  return (
    <span className={clsx(cls, pulse && 'animate-pulse-slow')}>
      {label}
    </span>
  );
}
