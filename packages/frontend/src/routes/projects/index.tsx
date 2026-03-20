import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useProjects } from '../../hooks/use-api.js';

function ProjectsList() {
  const navigate = useNavigate();
  const projects = useProjects();

  if (projects.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
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

  const data = projects.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary mt-0.5">Configured projects and their repositories</p>
        </div>
        <button
          onClick={() => navigate({ to: '/settings', search: { tab: 'projects' } })}
          className="text-sm text-accent hover:text-accent-hover"
        >
          Manage in Settings
        </button>
      </div>

      {data.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No projects configured yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Add projects in{' '}
            <button onClick={() => navigate({ to: '/settings', search: { tab: 'projects' } })} className="text-accent hover:text-accent-hover">
              Settings
            </button>{' '}
            to begin tracking code changes and reviews.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Name</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Description</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Status</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Created</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => navigate({ to: '/projects/$id', params: { id: project.id } })}
                  className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors"
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
                    <span className="text-xs text-accent hover:text-accent-hover">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const projectsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsList,
});
