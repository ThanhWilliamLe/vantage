import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useProject, useProjectAssignments, useCodeChanges, useMembers } from '../../hooks/use-api.js';
import { format } from 'date-fns';

function ProjectDrillDown() {
  const { id } = projectIdRoute.useParams();
  const navigate = useNavigate();
  const project = useProject(id);
  const assignments = useProjectAssignments(id);
  const recentChanges = useCodeChanges({ projectId: id, limit: '10' });
  const members = useMembers();

  const memberMap = new Map(members.data?.map((m) => [m.id, m.name]) ?? []);

  if (project.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Project Detail</h1>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (project.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Project Detail</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load project. The project may not exist.
        </div>
      </div>
    );
  }

  const p = project.data;
  if (!p) return null;

  return (
    <div>
      <button
        onClick={() => navigate({ to: '/projects' })}
        className="text-sm text-accent hover:text-accent-hover mb-4 inline-block"
      >
        &larr; Back to Projects
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{p.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                p.status === 'active' ? 'bg-success/20 text-success' : 'bg-surface-overlay text-text-tertiary'
              }`}
            >
              {p.status}
            </span>
            {p.description && <span className="text-sm text-text-secondary">{p.description}</span>}
          </div>
        </div>
      </div>

      {/* Team composition */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Team Composition
        </h2>
        {assignments.isLoading ? (
          <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
        ) : (assignments.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-tertiary">
            No team members assigned yet. Assign members in{' '}
            <button onClick={() => navigate({ to: '/settings', search: { tab: 'projects' } })} className="text-accent hover:text-accent-hover">
              Settings
            </button>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.data!.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate({ to: '/members/$id', params: { id: a.memberId } })}
                className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg cursor-pointer hover:bg-surface-overlay transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-semibold">
                    {(memberMap.get(a.memberId) ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-accent hover:text-accent-hover">{memberMap.get(a.memberId) ?? a.memberId}</span>
                  {a.role && (
                    <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                      {a.role}
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-tertiary">
                  {format(new Date(a.startDate), 'MMM d, yyyy')}
                  {a.endDate ? ` - ${format(new Date(a.endDate), 'MMM d, yyyy')}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review status / recent changes */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Recent Code Changes
        </h2>
        {recentChanges.isLoading ? (
          <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
        ) : (recentChanges.data?.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-tertiary">No code changes found for this project.</p>
        ) : (
          <div className="space-y-2">
            {recentChanges.data!.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg"
              >
                <div>
                  <span className="text-sm text-text-primary">{item.title}</span>
                  <div className="flex gap-2 mt-0.5 text-xs text-text-tertiary">
                    {item.authorMemberId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: '/members/$id', params: { id: item.authorMemberId! } });
                        }}
                        className="text-accent hover:text-accent-hover"
                      >
                        {item.authorName ?? item.authorRaw}
                      </button>
                    ) : (
                      <span>{item.authorName ?? item.authorRaw}</span>
                    )}
                    <span>{format(new Date(item.authoredAt), 'MMM d')}</span>
                    {item.branch && (
                      <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                        {item.branch}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">
                    +{item.linesAdded} -{item.linesDeleted}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.status === 'pending'
                        ? 'bg-warning/20 text-warning'
                        : item.status === 'reviewed'
                          ? 'bg-success/20 text-success'
                          : item.status === 'flagged'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-surface-overlay text-text-tertiary'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export const projectIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$id',
  component: ProjectDrillDown,
});
