import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useWorkload,
  useMembers,
  useProjects,
  useWorkloadChartBar,
  useWorkloadChartTrend,
  useWorkloadChartHeatmap,
} from '../../hooks/api/core.js';
import { format } from 'date-fns/format';
import { subDays } from 'date-fns/subDays';
import { buildProjectColorMap } from '../../lib/chart-colors.js';
import { ChartTimePeriodSelector } from '../../components/charts/ChartTimePeriodSelector.js';
import { WorkloadBarChart } from '../../components/charts/WorkloadBarChart.js';
import { WorkloadTrendChart } from '../../components/charts/WorkloadTrendChart.js';
import { WorkloadHeatmap } from '../../components/charts/WorkloadHeatmap.js';
import { ChartDataTable } from '../../components/charts/ChartDataTable.js';

type ViewMode = 'charts' | 'tables' | 'both';
type TrendScope = 'aggregate' | { memberId: string } | { projectId: string };

export function Workload() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [trendScope, setTrendScope] = useState<TrendScope>('aggregate');
  const [collapsedCharts, setCollapsedCharts] = useState<Record<string, boolean>>({});
  const [showDataTables, setShowDataTables] = useState<Record<string, boolean>>({});

  // Data hooks
  const workload = useWorkload(startDate, endDate);
  const members = useMembers();
  const projects = useProjects();
  const barChart = useWorkloadChartBar(startDate, endDate);
  const trendChart = useWorkloadChartTrend(
    startDate,
    endDate,
    typeof trendScope === 'object' && 'memberId' in trendScope ? trendScope.memberId : undefined,
    typeof trendScope === 'object' && 'projectId' in trendScope ? trendScope.projectId : undefined,
  );
  const heatmapChart = useWorkloadChartHeatmap(startDate, endDate);

  const memberMap = new Map(members.data?.map((m) => [m.id, m.name]) ?? []);
  const projectMap = new Map(projects.data?.map((p) => [p.id, p.name]) ?? []);

  // Build project color map from bar chart data
  const projectIds = barChart.data ? [...new Set(barChart.data.data.map((e) => e.projectId))] : [];
  const projectColorMap = buildProjectColorMap(projectIds);

  // Note: Multi-line member breakdown in aggregate mode would require per-member
  // trend queries. For v1.1, aggregate scope shows a single total line.
  // Per-member/project breakdown is available via the scope selector.

  function handleDateChange(newStart: string, newEnd: string) {
    setStartDate(newStart);
    setEndDate(newEnd);
  }

  function toggleChart(key: string) {
    setCollapsedCharts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleDataTable(key: string) {
    setShowDataTables((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const showCharts = viewMode === 'charts' || viewMode === 'both';
  const showTables = viewMode === 'tables' || viewMode === 'both';

  // Summary stats from bar chart data
  const totalCommits = barChart.data?.data.reduce((sum, e) => sum + e.commits, 0) ?? 0;
  const uniqueMembers = barChart.data ? new Set(barChart.data.data.map((e) => e.memberId)).size : 0;
  const totalMembers = members.data?.length ?? 0;
  const memberCommitTotals = new Map<string, number>();
  if (barChart.data) {
    for (const e of barChart.data.data) {
      memberCommitTotals.set(e.memberId, (memberCommitTotals.get(e.memberId) ?? 0) + e.commits);
    }
  }
  const sortedByCommits = [...memberCommitTotals.entries()].sort((a, b) => b[1] - a[1]);
  const mostActive = sortedByCommits[0] ? memberMap.get(sortedByCommits[0][0]) : null;
  const leastActive =
    sortedByCommits.length > 1
      ? memberMap.get(sortedByCommits[sortedByCommits.length - 1][0])
      : null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Workload</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-4">
        Team workload distribution and trends
      </p>

      {/* Toolbar: time period selector + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <ChartTimePeriodSelector
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
        />
        <div className="flex gap-1">
          {(['charts', 'tables', 'both'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 text-xs rounded-full border capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-accent text-text-primary border-accent'
                  : 'text-text-tertiary border-border hover:text-text-secondary bg-surface-raised'
              }`}
              aria-pressed={viewMode === mode}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      {barChart.data && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Commits" value={totalCommits.toString()} />
          <SummaryCard label="Active Members" value={`${uniqueMembers} of ${totalMembers}`} />
          <SummaryCard label="Most Active" value={mostActive ?? '—'} />
          <SummaryCard label="Least Active" value={leastActive ?? '—'} />
        </div>
      )}

      {/* Charts section */}
      {showCharts && (
        <div className="space-y-4 mb-8">
          {/* Bar chart */}
          <ChartSection
            title="Commit Volume by Member"
            chartKey="bar"
            collapsed={collapsedCharts['bar']}
            onToggle={() => toggleChart('bar')}
            isLoading={barChart.isLoading}
            showDataTable={showDataTables['bar']}
            onToggleDataTable={() => toggleDataTable('bar')}
          >
            {barChart.data && (
              <>
                <WorkloadBarChart
                  data={barChart.data.data}
                  projectColorMap={projectColorMap}
                  onBarClick={(memberId, _projectId) => {
                    navigate({ to: '/members/$id', params: { id: memberId } });
                  }}
                />
                {showDataTables['bar'] && <ChartDataTable type="bar" data={barChart.data.data} />}
              </>
            )}
          </ChartSection>

          {/* Trend line */}
          <ChartSection
            title="Commit Volume Over Time"
            chartKey="trend"
            collapsed={collapsedCharts['trend']}
            onToggle={() => toggleChart('trend')}
            isLoading={trendChart.isLoading}
            showDataTable={showDataTables['trend']}
            onToggleDataTable={() => toggleDataTable('trend')}
          >
            {trendChart.data && (
              <>
                <WorkloadTrendChart
                  data={trendChart.data.data}
                  scope={trendScope}
                  onScopeChange={setTrendScope}
                  members={members.data?.map((m) => ({ id: m.id, name: m.name }))}
                  projects={projects.data?.map((p) => ({ id: p.id, name: p.name }))}
                />
                {showDataTables['trend'] && (
                  <ChartDataTable type="trend" data={trendChart.data.data} />
                )}
              </>
            )}
          </ChartSection>

          {/* Heatmap */}
          <ChartSection
            title="Member × Project Activity"
            chartKey="heatmap"
            collapsed={collapsedCharts['heatmap']}
            onToggle={() => toggleChart('heatmap')}
            isLoading={heatmapChart.isLoading}
            showDataTable={showDataTables['heatmap']}
            onToggleDataTable={() => toggleDataTable('heatmap')}
          >
            {heatmapChart.data && (
              <>
                <WorkloadHeatmap
                  members={heatmapChart.data.members}
                  projects={heatmapChart.data.projects}
                  cells={heatmapChart.data.cells}
                  maxCommits={heatmapChart.data.maxCommits}
                  onCellClick={(memberId, _projectId) => {
                    navigate({ to: '/members/$id', params: { id: memberId } });
                  }}
                />
                {showDataTables['heatmap'] && (
                  <ChartDataTable
                    type="heatmap"
                    data={{
                      members: heatmapChart.data.members,
                      projects: heatmapChart.data.projects,
                      cells: heatmapChart.data.cells,
                    }}
                  />
                )}
              </>
            )}
          </ChartSection>
        </div>
      )}

      {/* Tables section (existing v1.0) */}
      {showTables && (
        <div>
          {workload.isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-surface-raised border border-border rounded animate-pulse"
                />
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
                    No commit data found for this period. Try a different date range or scan
                    repositories first.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium">
                            Member
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Commits
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Lines Added
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Lines Deleted
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Files Changed
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {workload.data.byMember.map((row, i) => (
                          <tr
                            key={row.memberId ?? i}
                            onClick={() => {
                              if (row.memberId)
                                navigate({ to: '/members/$id', params: { id: row.memberId } });
                            }}
                            className={`border-b border-border-subtle hover:bg-surface-raised transition-colors ${row.memberId ? 'cursor-pointer' : ''}`}
                          >
                            <td className="px-3 py-2.5 text-text-primary">
                              {row.memberId
                                ? (memberMap.get(row.memberId) ?? row.memberId)
                                : (row.authorName ?? '(unassigned)')}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary text-right">
                              {row.commitCount}
                            </td>
                            <td className="px-3 py-2.5 text-success text-right">
                              +{row.linesAdded ?? 0}
                            </td>
                            <td className="px-3 py-2.5 text-danger text-right">
                              -{row.linesDeleted ?? 0}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary text-right">
                              {row.filesChanged ?? 0}
                            </td>
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
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium">
                            Project
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Commits
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Lines Added
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Lines Deleted
                          </th>
                          <th className="px-3 py-2 text-xs text-text-tertiary font-medium text-right">
                            Files Changed
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {workload.data.byProject.map((row) => (
                          <tr
                            key={row.projectId}
                            onClick={() =>
                              navigate({ to: '/projects/$id', params: { id: row.projectId } })
                            }
                            className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2.5 text-text-primary">
                              {projectMap.get(row.projectId) ?? row.projectId}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary text-right">
                              {row.commitCount}
                            </td>
                            <td className="px-3 py-2.5 text-success text-right">
                              +{row.linesAdded ?? 0}
                            </td>
                            <td className="px-3 py-2.5 text-danger text-right">
                              -{row.linesDeleted ?? 0}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary text-right">
                              {row.filesChanged ?? 0}
                            </td>
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
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <div className="text-xs text-text-tertiary mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function ChartSection({
  title,
  chartKey: _chartKey,
  collapsed,
  onToggle,
  isLoading,
  showDataTable,
  onToggleDataTable,
  children,
}: {
  title: string;
  chartKey: string;
  collapsed?: boolean;
  onToggle: () => void;
  isLoading: boolean;
  showDataTable?: boolean;
  onToggleDataTable: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-border bg-surface overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-raised transition-colors"
        aria-expanded={!collapsed}
      >
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <svg
          className={`w-4 h-4 text-text-tertiary transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          {isLoading ? (
            <div className="h-48 bg-surface-raised rounded animate-pulse" />
          ) : (
            <>
              {children}
              <button
                onClick={onToggleDataTable}
                className="mt-2 text-xs text-accent-text hover:underline"
              >
                {showDataTable ? 'Hide data table' : 'View as table'}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
