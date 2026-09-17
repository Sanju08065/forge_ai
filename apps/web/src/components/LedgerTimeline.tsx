import { clsx } from 'clsx';
import {
  CheckCircle2, XCircle, AlertTriangle, Wrench, Rocket,
  Code2, TestTube, Package, Eye, Lightbulb, Loader2,
} from 'lucide-react';
import type { LedgerEvent, LedgerEventType } from '@forgeai/types';

interface LedgerTimelineProps {
  events: LedgerEvent[];
}

const EVENT_CONFIG: Record<
  LedgerEventType,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  PROJECT_CREATED:            { icon: Lightbulb,    color: 'text-blue-400',   bgColor: 'bg-blue-900/30' },
  REQUIREMENT_EXTRACTED:      { icon: Lightbulb,    color: 'text-purple-400', bgColor: 'bg-purple-900/30' },
  ARCHITECTURE_DESIGNED:      { icon: Code2,        color: 'text-cyan-400',   bgColor: 'bg-cyan-900/30' },
  TASK_ASSIGNED:              { icon: Loader2,      color: 'text-gray-400',   bgColor: 'bg-gray-800' },
  TASK_COMPLETED:             { icon: CheckCircle2, color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  TASK_FAILED:                { icon: XCircle,      color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  FILE_CREATED:               { icon: Code2,        color: 'text-indigo-400', bgColor: 'bg-indigo-900/30' },
  FILE_MODIFIED:              { icon: Code2,        color: 'text-indigo-300', bgColor: 'bg-indigo-900/20' },
  AGENT_DECISION:             { icon: Lightbulb,    color: 'text-yellow-400', bgColor: 'bg-yellow-900/30' },
  BUILD_STARTED:              { icon: Package,      color: 'text-blue-400',   bgColor: 'bg-blue-900/30' },
  BUILD_SUCCEEDED:            { icon: Package,      color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  BUILD_FAILED:               { icon: Package,      color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  DEPLOYMENT_STARTED:         { icon: Rocket,       color: 'text-blue-400',   bgColor: 'bg-blue-900/30' },
  DEPLOYMENT_SUCCEEDED:       { icon: Rocket,       color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  DEPLOYMENT_FAILED:          { icon: Rocket,       color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  HEALTH_CHECK_PASSED:        { icon: CheckCircle2, color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  HEALTH_CHECK_FAILED:        { icon: XCircle,      color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  INCIDENT_DETECTED:          { icon: AlertTriangle,color: 'text-orange-400', bgColor: 'bg-orange-900/30' },
  DIAGNOSIS_COMPLETE:         { icon: Eye,          color: 'text-yellow-400', bgColor: 'bg-yellow-900/30' },
  REPAIR_PROPOSED:            { icon: Wrench,       color: 'text-yellow-400', bgColor: 'bg-yellow-900/30' },
  REPAIR_APPROVED:            { icon: Wrench,       color: 'text-blue-400',   bgColor: 'bg-blue-900/30' },
  REPAIR_REJECTED:            { icon: XCircle,      color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  REPAIR_APPLIED:             { icon: Wrench,       color: 'text-orange-400', bgColor: 'bg-orange-900/30' },
  REPAIR_VERIFIED:            { icon: CheckCircle2, color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  LIFECYCLE_COMPLETE:         { icon: CheckCircle2, color: 'text-green-400',  bgColor: 'bg-green-900/30' },
  HUMAN_INTERVENTION_REQUIRED:{ icon: AlertTriangle,color: 'text-red-400',    bgColor: 'bg-red-900/30' },
  TEST_GENERATED:             { icon: TestTube,     color: 'text-teal-400',   bgColor: 'bg-teal-900/30' },
} as unknown as Record<LedgerEventType, { icon: React.ElementType; color: string; bgColor: string }>;

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function LedgerTimeline({ events }: LedgerTimelineProps): JSX.Element {
  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const cfg = EVENT_CONFIG[event.type] ?? {
          icon: Lightbulb,
          color: 'text-gray-400',
          bgColor: 'bg-gray-800',
        };
        const Icon = cfg.icon;
        const isLast = idx === events.length - 1;

        return (
          <div key={event.eventId} className="flex gap-4 animate-fade-in">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  cfg.bgColor
                )}
              >
                <Icon className={clsx('w-4 h-4', cfg.color)} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-surface-border mt-1 mb-1" />}
            </div>

            {/* Content */}
            <div className={clsx('pb-5 flex-1', isLast && 'pb-0')}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white font-medium">{event.summary}</p>
                  {event.agentId && (
                    <p className="text-xs text-surface-muted mt-0.5">
                      Agent: <span className="text-brand-400 font-mono">{event.agentId}</span>
                    </p>
                  )}
                </div>
                <time className="text-xs text-surface-muted shrink-0 font-mono">
                  {formatTime(event.timestamp)}
                </time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
