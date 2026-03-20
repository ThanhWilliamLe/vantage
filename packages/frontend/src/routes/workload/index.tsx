import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useState } from 'react';
import { useWorkload, useMembers, useProjects } from '../../hooks/use-api.js';
import { format, subDays } from 'date-fns';

function Workload() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const workload = useWorkload(startDate, endDate);
  const members = useMembers();
  const projects = useProjects();

  const memberMap = new Map(members.data?.map((m) => [m.id, m.name]) ?? []);
  const projectMap = new Map(projects.data?.map((p) => [p.id, p.name]) ?? []);

  function setPreset(days: number) {
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setStartDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Workload</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-4">Team workload distribution and trends</p>

      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
        />
        <span className="text-text-tertiary text-sm">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
        />
        <div className="flex gap-1">
          <button onClick={() => setPreset(7)} className="px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary bg-surface-raised border border-border rounded">
            7d
          </button>
          <button onClick={() => setPreset(14)} className="px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary bg-surface-raised border border-border rounded">
            14d
          </button>
          <button onClick={() => setPreset(30)} className="px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary bg-surface-raised border border-border rounded">
            30d
          </button>
          <button onClick={() => setPreset(90)} className="px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary bg-surface-raised border border-border rounded">
            90d
          </button>
        </div>
      </div>

      {workload.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
          ))}
        </div>
      )}

      {workload.isError && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load workload data. Please check the date range and try again.
        </div>
      )}

      {workload.data && (
        <div>
          {/* By member table */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
              Workload by Member
            </h2>
            {workload.data.byMember.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                No commit data found for this period. Try a different date range or scan repositories first.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Member</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Commits</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Lines Added</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Lines Deleted</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Files Changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workload.data.byMember.map((row, i) => (
                      <tr
                        key={row.memberId ?? i}
                        onClick={() => {
                          if (row.memberId) navigate({ to: '/members/$id', params: { id: row.memberId } });
                        }}
                        className={`border-b border-border-subtle hover:bg-surface-raised transition-colors ${row.memberId ? 'cursor-pointer' : ''}`}
                      >
                        <td className="px-3 py-2.5 text-text-primary">
                          {row.memberId
                            ? memberMap.get(row.memberId) ?? row.memberId
                            : row.authorName ?? '(unassigned)'}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary text-right">{row.commitCount}</td>
                        <td className="px-3 py-2.5 text-success text-right">+{row.linesAdded ?? 0}</td>
                        <td className="px-3 py-2.5 text-danger text-right">-{row.linesDeleted ?? 0}</td>
                        <td className="px-3 py-2.5 text-text-secondary text-right">{row.filesChanged ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* By project table */}
          <section>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
              Workload by Project
            </h2>
            {workload.data.byProject.length === 0 ? (
              <p className="text-sm text-text-tertiary">No project data for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Project</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Commits</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Lines Added</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Lines Deleted</th>
                      <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">Files Changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workload.data.byProject.map((row) => (
                      <tr
                        key={row.projectId}
                        onClick={() => navigate({ to: '/projects/$id', params: { id: row.projectId } })}
                        className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 text-text-primary">
                          {projectMap.get(row.projectId) ?? row.projectId}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary text-right">{row.commitCount}</td>
                        <td className="px-3 py-2.5 text-success text-right">+{row.linesAdded ?? 0}</td>
                        <td className="px-3 py-2.5 text-danger text-right">-{row.linesDeleted ?? 0}</td>
                        <td className="px-3 py-2.5 text-text-secondary text-right">{row.filesChanged ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export const workloadIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workload',
  component: Workload,
});
