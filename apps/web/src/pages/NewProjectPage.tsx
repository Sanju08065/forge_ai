import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { Project } from '@forgeai/types';

const EXAMPLE_PROMPTS = [
  'Build a task management web application with authentication, CRUD tasks, filtering, and a REST API.',
  'Create a URL shortener service with click analytics and user accounts.',
  'Build a simple notes app with markdown support, tags, and search.',
];

export function NewProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      apiClient
        .post<{ project: Project }>('/api/v1/projects', { name, prompt })
        .then((r) => r.data.project),
    onSuccess: (project) => navigate(`/projects/${project.projectId}`),
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (prompt.trim().length < 10) return;
    mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Project</h1>
        <p className="text-surface-muted mt-1">
          Describe what you want to build. ForgeAI handles everything else.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-white mb-2">Project Name</label>
          <input
            className="input"
            placeholder="My Task App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            What do you want to build?
          </label>
          <textarea
            className="input resize-none"
            rows={5}
            placeholder="Describe your product in plain language…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            minLength={10}
            maxLength={2000}
          />
          <p className="text-xs text-surface-muted mt-1">{prompt.length} / 2000</p>
        </div>

        {/* Example prompts */}
        <div>
          <p className="text-xs text-surface-muted mb-2">Examples:</p>
          <div className="space-y-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className="text-left text-xs text-brand-400 hover:text-brand-300 transition-colors block"
              >
                → {p}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            {String(error)}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || prompt.trim().length < 10}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Starting ForgeAI…</>
          ) : (
            <><Zap className="w-4 h-4" /> Start Building</>
          )}
        </button>
      </form>
    </div>
  );
}
