import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { StatusBadge } from '../components/StatusBadge';
import { LedgerTimeline } from '../components/LedgerTimeline';
import type { Project, EngineeringLedger } from '@forgeai/types';

export function ProjectPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      apiClient.get<{ project: Project }>(`/api/v1/projects/${projectId}`).then((r) => r.data.project),
    refetchInterval: 3000,
    enabled: Boolean(projectId),
  });

  const { data: ledger } = useQuery({
    queryKey: ['ledger', projectId],
    queryFn: () =>
      apiClient.get<{ ledger: EngineeringLedger }>(`/api/v1/projects/${projectId}/ledger`).then((r) => r.data.ledger),
    refetchInterval: 3000,
    enabled: Boolean(projectId),
  });

  if (loadingProject) {
    return <div className="text-center py-20 text-surface-muted">Loading project…</div>;
  }
  if (!project) {
    return <div className="text-center py-20 text-red-400">Project not found.</div>;
  }

  const recentEvents = ledger?.events.slice(-10).reverse() ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            <StatusBadge
              status={project.status}
              pulse={['coding', 'building', 'deploying', 'repairing'].includes(project.status)}
            />
          </div>
          <p className="text-surface-muted text-sm">{project.originalPrompt}</p>
        </div>
        <div className="flex gap-3">
          {project.deploymentUrl && (
            <a
              href={project.deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open App
            </a>
          )}
          <Link to={`/projects/${projectId}/ledger`} className="btn-secondary flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Full Ledger
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      {ledger && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Requirements', value: ledger.summary.requirementsExtracted },
            { label: 'Files Generated', value: ledger.summary.filesGenerated },
            { label: 'Builds Run', value: ledger.summary.buildsRun },
            { label: 'Repairs Applied', value: ledger.summary.repairsApplied },
          ].map(({ label, value }) => (
            <div key={label} className="card text-center">
              <div className="text-2xl font-bold text-white">{value}</div>
              <div className="text-xs text-surface-muted mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Live timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-white">Engineering Ledger (recent)</h2>
          <div className="flex items-center gap-1 text-xs text-surface-muted">
            <RefreshCw className="w-3 h-3" />
            Live
          </div>
        </div>
        {recentEvents.length === 0 ? (
          <div className="text-center py-8 text-surface-muted">
            Waiting for ForgeAI to start…
          </div>
        ) : (
          <LedgerTimeline events={recentEvents} />
        )}
      </div>
    </div>
  );
}
