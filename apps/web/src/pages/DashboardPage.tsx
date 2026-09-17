import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Zap, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { StatusBadge } from '../components/StatusBadge';
import type { Project } from '@forgeai/types';

export function DashboardPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get<{ projects: Project[] }>('/api/v1/projects').then((r) => r.data),
    refetchInterval: 5000,
  });

  const projects = data?.projects ?? [];
  const running = projects.filter((p) => p.status === 'running').length;
  const failed = projects.filter((p) => p.status === 'failed' || p.status === 'repairing').length;
  const completed = projects.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-surface-muted mt-1">Autonomous engineering projects</p>
        </div>
        <Link to="/projects/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{projects.length}</div>
            <div className="text-xs text-surface-muted">Total Projects</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-green-900/30 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{running + completed}</div>
            <div className="text-xs text-surface-muted">Deployed</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-red-900/30 rounded-lg flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{failed}</div>
            <div className="text-xs text-surface-muted">Needs Attention</div>
          </div>
        </div>
      </div>

      {/* Project list */}
      <div className="card">
        <h2 className="text-sm font-semibold text-surface-muted uppercase tracking-wider mb-4">
          Projects
        </h2>

        {isLoading ? (
          <div className="text-center py-12 text-surface-muted">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-10 h-10 text-surface-muted mx-auto mb-3" />
            <p className="text-white font-medium">No projects yet</p>
            <p className="text-surface-muted text-sm mt-1">
              Create your first project and ForgeAI will handle the rest
            </p>
            <Link to="/projects/new" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> New Project
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {projects.map((project) => (
              <Link
                key={project.projectId}
                to={`/projects/${project.projectId}`}
                className="flex items-center justify-between py-4 hover:bg-surface-border/30 px-2 rounded-lg transition-colors -mx-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{project.name}</p>
                  <p className="text-xs text-surface-muted truncate mt-0.5">
                    {project.originalPrompt}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <StatusBadge
                    status={project.status}
                    pulse={['coding', 'building', 'deploying', 'repairing'].includes(project.status)}
                  />
                  <span className="text-xs text-surface-muted">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
