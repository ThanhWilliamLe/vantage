import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjects } from '../../hooks/api/core.js';
import { useCreateProject } from '../../hooks/api/settings.js';
import { errorMessage } from '../../lib/api-client.js';
import { toast } from 'sonner';

export function Projects() {
  const navigate = useNavigate();
  const projects = useProjects();
  const createProject = useCreateProject();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [sortField, setSortField] = useState<'name' | 'status' | 'createdAt'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  function handleCreate() {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), description: desc.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Project created');
          setName('');
          setDesc('');
          setShowCreate(false);
        },
        onError: (err) => toast.error(`Failed to create project: ${errorMessage(err)}`),
      },
    );
  }

  if (projects.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (projects.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load projects. Please try again.
        </div>
      </div>
    );
  }

  const raw = projects.data ?? [];
  const data = raw
    .filter((p) => statusFilter === 'all' || p.status === statusFilter)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? '').toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const av = sortField === 'createdAt' ? a.createdAt : a[sortField];
      const bv = sortField === 'createdAt' ? b.createdAt : b[sortField];
      const cmp = (av ?? '').localeCompare(bv ?? '');
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const sortIcon = (field: typeof sortField) =>
    sortField === field ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Configured projects and their repositories
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
        >
          + New Project
        </button>
      </div>

      {/* Quick-access for single-project users */}
      {raw.filter((p) => p.status === 'active').length === 1 && !showCreate && (
        <button
          onClick={() => {
            const only = raw.find((p) => p.status === 'active')!;
            navigate({ to: '/projects/$id', params: { id: only.id } });
          }}
          className="mb-4 w-full flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm hover:bg-surface-overlay transition-colors"
        >
          <span className="text-sm text-text-primary font-medium">
            {raw.find((p) => p.status === 'active')!.name}
          </span>
          <span className="text-xs text-accent-text">Open project &rarr;</span>
        </button>
      )}

      {showCreate && (
        <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!name.trim() || createProject.isPending}
              className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setName('');
                setDesc('');
              }}
              className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {raw.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No projects configured yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Click{' '}
            <button
              onClick={() => setShowCreate(true)}
              className="text-accent-text hover:text-accent-hover"
            >
              + New Project
            </button>{' '}
            to begin tracking code changes and reviews.
          </p>
        </div>
      ) : (
        <>
          {/* Search + filter */}
          <div className="flex gap-2 mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'archived')}
              className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-secondary"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {data.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-4">
              No projects match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('name')}
                    >
                      Name{sortIcon('name')}
                    </th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">
                      Description
                    </th>
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('status')}
                    >
                      Status{sortIcon('status')}
                    </th>
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('createdAt')}
                    >
                      Created{sortIcon('createdAt')}
                    </th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((project) => (
                    <tr
                      key={project.id}
                      tabIndex={0}
                      aria-label={`Open project ${project.name}`}
                      onClick={() => navigate({ to: '/projects/$id', params: { id: project.id } })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate({ to: '/projects/$id', params: { id: project.id } });
                        }
                      }}
                      className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:bg-surface-raised"
                    >
                      <td className="px-3 py-2.5 text-text-primary font-medium">{project.name}</td>
                      <td className="px-3 py-2.5 text-text-secondary truncate max-w-xs">
                        {project.description || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            project.status === 'active'
                              ? 'bg-success/20 text-success'
                              : 'bg-surface-overlay text-text-tertiary'
                          }`}
                        >
                          {project.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-tertiary">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs text-accent-text hover:text-accent-hover">
                          View
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
