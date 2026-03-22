import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from './__root.js';
import {
  usePendingQueue,
  useProjects,
  useMembers,
  useAIStatus,
  useWorkload,
} from '../hooks/api/core.js';
import { useHistory } from '../hooks/api/reviews.js';
import { useEvaluations } from '../hooks/api/evaluations.js';
import { useMemo } from 'react';
import { format } from 'date-fns/format';
import { subDays } from 'date-fns/subDays';

function StatCard({
  label,
  value,
  onClick,
  accent = false,
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 p-4 rounded-sm border transition-colors text-left ${
        accent
          ? 'bg-accent/10 border-accent/30 hover:bg-accent/15'
          : 'bg-surface-raised border-border hover:bg-surface-overlay'
      }`}
    >
      <span className="text-xs text-text-tertiary uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-semibold text-text-primary">{value}</span>
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    flagged: 'bg-danger',
    communicated: 'bg-warning',
    resolved: 'bg-accent',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-text-tertiary'}`} />
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const pending = usePendingQueue();
  const projects = useProjects();
  const members = useMembers();
  const evaluations = useEvaluations({ limit: '5' });
  const aiStatus = useAIStatus();
  const history = useHistory({ limit: '10' });

  const now = useMemo(() => new Date(), []);
  const weekAgo = useMemo(() => format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"), [now]);
  const nowStr = useMemo(() => format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"), [now]);
  const workload7d = useWorkload(weekAgo, nowStr);

  const pendingCount = pending.data?.total ?? 0;
  const pendingItems = pending.data?.items ?? [];
  const projectCount = projects.data?.length ?? 0;
  const memberCount = members.data?.length ?? 0;

  // Group pending by project
  const projectMap = useMemo(
    () => new Map(projects.data?.map((p) => [p.id, p.name]) ?? []),
    [projects.data],
  );
  const memberMap = useMemo(
    () => new Map(members.data?.map((m) => [m.id, m.name]) ?? []),
    [members.data],
  );

  const pendingByProject = useMemo(() => {
    const map = new Map<string, { name: string; count: number; highRisk: number }>();
    for (const item of pendingItems) {
      const pid = item.projectId ?? 'unknown';
      const name = projectMap.get(pid) ?? 'Unknown';
      const entry = map.get(pid) ?? { name, count: 0, highRisk: 0 };
      entry.count++;
      if (item.aiRiskLevel === 'high') entry.highRisk++;
      map.set(pid, entry);
    }
    return Array.from(map.values());
  }, [pendingItems, projectMap]);

  // Flagged items from history (items with flagged/communicated status)
  const flaggedHistoryItems = useMemo(() => {
    return (history.data?.items ?? [])
      .filter((i) => i.status === 'flagged' || i.status === 'communicated')
      .slice(0, 5);
  }, [history.data]);

  // Recent activity for activity pulse
  const recentActivity = useMemo(() => {
    return (history.data?.items ?? []).slice(0, 8);
  }, [history.data]);

  // Workload 7d by member
  const workloadMembers = useMemo(() => {
    return (workload7d.data?.byMember ?? []).map((w) => ({
      ...w,
      name: w.memberId ? (memberMap.get(w.memberId) ?? '(unassigned)') : '(unassigned)',
    }));
  }, [workload7d.data, memberMap]);

  // Workload 7d by project
  const workloadProjects = useMemo(() => {
    return (workload7d.data?.byProject ?? []).map((w) => ({
      ...w,
      name: projectMap.get(w.projectId) ?? 'Unknown',
    }));
  }, [workload7d.data, projectMap]);

  const isLoading = pending.isLoading || projects.isLoading || members.isLoading;

  if (isLoading) {
    return (
      <div data-testid="dashboard-loading">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-sm bg-surface-raised border border-border animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (projectCount === 0 && memberCount === 0) {
    return (
      <div data-testid="dashboard-empty">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center text-2xl text-text-tertiary">
            V
          </div>
          <h2 className="text-lg text-text-primary">Welcome to Vantage</h2>
          <p className="text-sm text-text-secondary max-w-md">
            Create your first project to get started. Set up projects and members in Settings, then
            scan repositories to populate the review queue.
          </p>
          <button
            onClick={() => navigate({ to: '/settings', search: {} })}
            className="mt-2 px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Overview of review activity, team workload, and recent changes.
      </p>

      {aiStatus.data?.processing && (
        <div className="mt-4 px-4 py-2 bg-accent/10 border border-accent/20 rounded-sm text-sm text-accent-text flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          AI is processing — {aiStatus.data.completed}/{aiStatus.data.total} complete
        </div>
      )}

      {/* Tier 1 — Metrics strip */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Reviews"
          value={pendingCount}
          accent={pendingCount > 0}
          onClick={() => navigate({ to: '/reviews' })}
        />
        <StatCard
          label="Flagged Items"
          value={flaggedHistoryItems.length}
          accent={flaggedHistoryItems.length > 0}
          onClick={() => navigate({ to: '/reviews/history', search: { status: 'flagged' } })}
        />
        <StatCard
          label="Active Projects"
          value={projectCount}
          onClick={() => navigate({ to: '/projects' })}
        />
        <StatCard
          label="Team Members"
          value={memberCount}
          onClick={() => navigate({ to: '/members' })}
        />
      </div>

      {/* Tier 2 — Action areas */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Review Queue by Project */}
        <div className="lg:col-span-2 bg-surface-raised border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Review Queue by Project
            </h2>
            <button
              onClick={() => navigate({ to: '/reviews' })}
              className="text-xs text-accent-text hover:text-accent-hover"
            >
              Open queue
            </button>
          </div>
          {pendingByProject.length > 0 ? (
            <div className="space-y-2">
              {pendingByProject.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-sm text-text-primary flex-1">{p.name}</span>
                  {p.highRisk > 0 && (
                    <span className="text-xs text-danger">{p.highRisk} high risk</span>
                  )}
                  <span className="text-sm font-medium text-text-secondary">{p.count} pending</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No pending items — all caught up.</p>
          )}
        </div>

        {/* Flagged Items */}
        <div className="bg-surface-raised border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Flagged Items
            </h2>
            <button
              onClick={() => navigate({ to: '/reviews/history', search: { status: 'flagged' } })}
              className="text-xs text-accent-text hover:text-accent-hover"
            >
              View all
            </button>
          </div>
          {flaggedHistoryItems.length > 0 ? (
            <div className="space-y-2">
              {flaggedHistoryItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <StatusDot status={item.status} />
                  <span className="text-sm text-text-primary truncate flex-1">{item.title}</span>
                  <span className="text-xs text-text-tertiary">
                    {item.authorName ?? item.authorRaw}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No flagged items.</p>
          )}
        </div>
      </div>

      {/* Tier 3 — Context */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Pulse */}
        <div className="bg-surface-raised border border-border rounded-sm p-4">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Activity Pulse
          </h2>
          {recentActivity.length > 0 ? (
            <div className="space-y-2">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <span className="text-xs text-text-tertiary mt-0.5 shrink-0 w-14">
                    {format(new Date(item.authoredAt), 'MMM d')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary truncate">{item.title}</p>
                    <p className="text-[10px] text-text-tertiary">
                      {item.authorName ?? item.authorRaw}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No recent activity.</p>
          )}
        </div>

        {/* Workload (7d) */}
        <div className="bg-surface-raised border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Workload (7d)
            </h2>
            <button
              onClick={() => navigate({ to: '/workload' })}
              className="text-xs text-accent-text hover:text-accent-hover"
            >
              Full view
            </button>
          </div>
          {workloadMembers.length > 0 ? (
            <div className="space-y-1.5">
              {workloadMembers.map((w) => (
                <div
                  key={w.memberId ?? 'unassigned'}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-text-primary">{w.name}</span>
                  <span className="text-text-tertiary">{w.commitCount} commits</span>
                </div>
              ))}
              {workloadProjects.length > 0 && (
                <>
                  <div className="border-t border-border-subtle my-2" />
                  {workloadProjects.map((w) => (
                    <div key={w.projectId} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{w.name}</span>
                      <span className="text-text-tertiary">{w.commitCount} commits</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No commits in the last 7 days.</p>
          )}
        </div>

        {/* Recent Evaluations */}
        <div className="bg-surface-raised border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Recent Evaluations
            </h2>
            <button
              onClick={() => navigate({ to: '/evaluations' })}
              className="text-xs text-accent-text hover:text-accent-hover"
            >
              View all
            </button>
          </div>
          {evaluations.data?.items && evaluations.data.items.length > 0 ? (
            <div className="space-y-2">
              {evaluations.data.items.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-text-primary truncate block">
                      {ev.description || 'No description'}
                    </span>
                    <span className="text-[10px] text-text-tertiary">{ev.date}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary shrink-0 ml-2">
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No evaluations yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});
