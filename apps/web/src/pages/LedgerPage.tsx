import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { LedgerTimeline } from '../components/LedgerTimeline';
import type { EngineeringLedger } from '@forgeai/types';

export function LedgerPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['ledger-full', projectId],
    queryFn: () =>
      apiClient
        .get<{ ledger: EngineeringLedger }>(`/api/v1/projects/${projectId}/ledger`)
        .then((r) => r.data.ledger),
    refetchInterval: 5000,
    enabled: Boolean(projectId),
  });

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link
          to={`/projects/${projectId}`}
          className="text-surface-muted hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Engineering Ledger</h1>
          <p className="text-xs text-surface-muted mt-0.5">
            Full traceable record of every decision and action
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-surface-muted">Loading ledger…</div>
      ) : !data ? (
        <div className="text-center py-20 text-red-400">Ledger not found.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="card grid grid-cols-3 gap-6">
            <div>
              <div className="text-xl font-bold text-white">{data.summary.totalAgentTokensUsed.toLocaleString()}</div>
              <div className="text-xs text-surface-muted mt-1">Tokens Used</div>
            </div>
            <div>
              <div className="text-xl font-bold text-white">${data.summary.totalCostUsd.toFixed(4)}</div>
              <div className="text-xs text-surface-muted mt-1">Estimated Cost</div>
            </div>
            <div>
              <div className="text-xl font-bold text-white">{data.totalEvents}</div>
              <div className="text-xs text-surface-muted mt-1">Total Events</div>
            </div>
          </div>

          {/* Full timeline */}
          <div className="card">
            <LedgerTimeline events={[...data.events].reverse()} />
          </div>
        </>
      )}
    </div>
  );
}
