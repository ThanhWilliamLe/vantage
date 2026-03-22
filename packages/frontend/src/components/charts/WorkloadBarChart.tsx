import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { BarChartEntry } from '@twle/vantage-shared';

interface WorkloadBarChartProps {
  data: BarChartEntry[];
  projectColorMap: Map<string, string>;
  onBarClick?: (memberId: string, projectId: string) => void;
  condensed?: boolean;
}

interface MemberBar {
  memberId: string;
  memberName: string;
  total: number;
  segments: Array<{ projectId: string; projectName: string; commits: number; color: string }>;
  [key: string]: unknown;
}

export function WorkloadBarChart({
  data,
  projectColorMap,
  onBarClick,
  condensed,
}: WorkloadBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-text-tertiary py-4">No activity data for this period.</p>;
  }

  // Group by member, sorted by total descending
  const memberMap = new Map<string, MemberBar>();
  const projectIds = new Set<string>();
  const projectNameMap = new Map<string, string>();

  for (const entry of data) {
    projectIds.add(entry.projectId);
    projectNameMap.set(entry.projectId, entry.projectName);
    let m = memberMap.get(entry.memberId);
    if (!m) {
      m = { memberId: entry.memberId, memberName: entry.memberName, total: 0, segments: [] };
      memberMap.set(entry.memberId, m);
    }
    m.total += entry.commits;
    m.segments.push({
      projectId: entry.projectId,
      projectName: entry.projectName,
      commits: entry.commits,
      color: projectColorMap.get(entry.projectId) ?? '#3D7068',
    });
    // Recharts needs flat keys for stacked bars
    m[`project_${entry.projectId}`] = entry.commits;
  }

  const sortedMembers = [...memberMap.values()].sort((a, b) => b.total - a.total);
  const uniqueProjectIds = [...projectIds];

  const height = condensed ? 200 : Math.max(300, sortedMembers.length * 40 + 60);

  return (
    <div role="img" aria-label="Bar chart showing commit volume by team member" className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedMembers}
          layout="vertical"
          margin={
            condensed
              ? { top: 5, right: 20, left: 5, bottom: 5 }
              : { top: 5, right: 30, left: 10, bottom: 5 }
          }
        >
          <XAxis
            type="number"
            tick={{ fill: '#A1A1A8', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          {!condensed && (
            <YAxis
              type="category"
              dataKey="memberName"
              tick={{ fill: '#ECECEF', fontSize: 12 }}
              width={120}
              axisLine={false}
              tickLine={false}
            />
          )}
          {!condensed && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#303035',
                border: '1px solid #2E2E33',
                borderRadius: '8px',
                color: '#ECECEF',
                fontSize: 12,
              }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const member = payload[0]?.payload as MemberBar;
                return (
                  <div className="px-3 py-2 bg-surface-overlay border border-border rounded-lg text-sm">
                    <div className="font-medium text-text-primary mb-1">{member.memberName}</div>
                    {member.segments.map((s) => (
                      <div
                        key={s.projectId}
                        className="flex items-center gap-2 text-text-secondary"
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate">{s.projectName}</span>
                        <span className="ml-auto font-medium text-text-primary">{s.commits}</span>
                      </div>
                    ))}
                    <div className="mt-1 pt-1 border-t border-border text-text-tertiary">
                      Total: {member.total}
                    </div>
                  </div>
                );
              }}
            />
          )}
          {uniqueProjectIds.map((pid) => (
            <Bar
              key={pid}
              dataKey={`project_${pid}`}
              stackId="stack"
              fill={projectColorMap.get(pid) ?? '#3D7068'}
              onClick={
                !condensed && onBarClick
                  ? (_: unknown, idx: number) => {
                      const member = sortedMembers[idx];
                      if (member) onBarClick(member.memberId, pid);
                    }
                  : undefined
              }
              style={!condensed && onBarClick ? { cursor: 'pointer' } : undefined}
            >
              {sortedMembers.map((m) => (
                <Cell
                  key={m.memberId}
                  aria-label={`${m.memberName}: ${(m[`project_${pid}`] as number) ?? 0} commits in ${projectNameMap.get(pid) ?? pid}`}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
