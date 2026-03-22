import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { TrendChartEntry } from '@twle/vantage-shared';
import { CHART_COLORS } from '../../lib/chart-colors.js';

type TrendScope = 'aggregate' | { memberId: string } | { projectId: string };

interface WorkloadTrendChartProps {
  data: TrendChartEntry[];
  scope: TrendScope;
  memberBreakdownData?: Map<string, TrendChartEntry[]>;
  memberNames?: Map<string, string>;
  onScopeChange?: (scope: TrendScope) => void;
  condensed?: boolean;
  members?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; name: string }>;
}

interface MultiLinePoint {
  weekBucket: string;
  weekStart: string;
  [key: string]: string | number;
}

export function WorkloadTrendChart({
  data,
  scope,
  memberBreakdownData,
  memberNames,
  onScopeChange,
  condensed,
  members,
  projects,
}: WorkloadTrendChartProps) {
  // Sparse data check
  if (data.length < 2) {
    return (
      <p className="text-sm text-text-tertiary py-4">
        {data.length === 0
          ? 'No activity data for this period.'
          : 'Not enough data to show a trend (need at least 2 weeks).'}
      </p>
    );
  }

  const height = condensed ? 150 : 300;
  const showMultiLine =
    scope === 'aggregate' && memberBreakdownData && memberBreakdownData.size > 1;

  // Build multi-line data if in aggregate mode with breakdown
  let multiLineData: MultiLinePoint[] | null = null;
  let topMemberIds: string[] = [];
  let hasOthers = false;

  if (showMultiLine) {
    // Get top 5 members by total commits
    const memberTotals = new Map<string, number>();
    for (const [mid, entries] of memberBreakdownData!) {
      memberTotals.set(
        mid,
        entries.reduce((sum, e) => sum + e.commits, 0),
      );
    }
    const sorted = [...memberTotals.entries()].sort((a, b) => b[1] - a[1]);
    topMemberIds = sorted.slice(0, 5).map(([id]) => id);
    hasOthers = sorted.length > 5;

    // Build combined data keyed by weekBucket
    const weekMap = new Map<string, MultiLinePoint>();
    for (const entry of data) {
      weekMap.set(entry.weekBucket, {
        weekBucket: entry.weekBucket,
        weekStart: entry.weekStart,
      });
    }
    for (const [mid, entries] of memberBreakdownData!) {
      const isTop = topMemberIds.includes(mid);
      for (const e of entries) {
        let point = weekMap.get(e.weekBucket);
        if (!point) {
          point = { weekBucket: e.weekBucket, weekStart: e.weekStart };
          weekMap.set(e.weekBucket, point);
        }
        if (isTop) {
          point[`member_${mid}`] = e.commits;
        } else {
          point['others'] = ((point['others'] as number) || 0) + e.commits;
        }
      }
    }
    multiLineData = [...weekMap.values()].sort((a, b) => a.weekBucket.localeCompare(b.weekBucket));
  }

  return (
    <div role="img" aria-label="Trend line showing commit volume over time" className="w-full">
      {/* Scope selector — only in non-condensed mode */}
      {!condensed && onScopeChange && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-text-tertiary">Scope:</span>
          <button
            onClick={() => onScopeChange('aggregate')}
            className={`px-2 py-1 text-xs rounded-full border transition-colors ${
              scope === 'aggregate'
                ? 'bg-accent text-text-primary border-accent'
                : 'text-text-tertiary border-border hover:text-text-secondary'
            }`}
            aria-pressed={scope === 'aggregate'}
          >
            All members
          </button>
          {members && (
            <select
              value={typeof scope === 'object' && 'memberId' in scope ? scope.memberId : ''}
              onChange={(e) => {
                if (e.target.value) onScopeChange({ memberId: e.target.value });
              }}
              className="px-2 py-1 text-xs bg-surface-raised border border-border rounded-lg text-text-secondary outline-none focus:border-accent"
              aria-label="Filter by member"
            >
              <option value="">Member...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {projects && (
            <select
              value={typeof scope === 'object' && 'projectId' in scope ? scope.projectId : ''}
              onChange={(e) => {
                if (e.target.value) onScopeChange({ projectId: e.target.value });
              }}
              className="px-2 py-1 text-xs bg-surface-raised border border-border rounded-lg text-text-secondary outline-none focus:border-accent"
              aria-label="Filter by project"
            >
              <option value="">Project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={(multiLineData ?? data) as Record<string, unknown>[]}
          margin={
            condensed
              ? { top: 5, right: 10, left: 5, bottom: 5 }
              : { top: 5, right: 30, left: 10, bottom: 5 }
          }
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272B"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            dataKey="weekStart"
            tick={{ fill: '#A1A1A8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => {
              if (!v) return '';
              const parts = v.split('-');
              return `${parts[1]}/${parts[2]}`;
            }}
          />
          <YAxis
            tick={{ fill: '#A1A1A8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          {!condensed && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#303035',
                border: '1px solid #2E2E33',
                borderRadius: '8px',
                color: '#ECECEF',
                fontSize: 12,
              }}
              labelFormatter={(label) => `Week of ${String(label)}`}
            />
          )}
          {multiLineData ? (
            <>
              {topMemberIds.map((mid, i) => (
                <Line
                  key={mid}
                  type="monotone"
                  dataKey={`member_${mid}`}
                  name={memberNames?.get(mid) ?? mid}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              ))}
              {hasOthers && (
                <Line
                  type="monotone"
                  dataKey="others"
                  name="Others"
                  stroke="#929298"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={{ r: 2 }}
                />
              )}
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="commits"
              name="Commits"
              stroke="#5FBFB2"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
