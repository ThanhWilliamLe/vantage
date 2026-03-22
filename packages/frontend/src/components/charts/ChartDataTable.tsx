import type {
  BarChartEntry,
  TrendChartEntry,
  HeatmapMember,
  HeatmapProject,
  HeatmapCell,
} from '@twle/vantage-shared';

interface BarTableProps {
  type: 'bar';
  data: BarChartEntry[];
}

interface TrendTableProps {
  type: 'trend';
  data: TrendChartEntry[];
}

interface HeatmapTableProps {
  type: 'heatmap';
  data: { members: HeatmapMember[]; projects: HeatmapProject[]; cells: HeatmapCell[] };
}

type ChartDataTableProps = BarTableProps | TrendTableProps | HeatmapTableProps;

export function ChartDataTable(props: ChartDataTableProps) {
  switch (props.type) {
    case 'bar':
      return <BarDataTable data={props.data} />;
    case 'trend':
      return <TrendDataTable data={props.data} />;
    case 'heatmap':
      return <HeatmapDataTable {...props.data} />;
  }
}

function BarDataTable({ data }: { data: BarChartEntry[] }) {
  if (data.length === 0) return null;
  return (
    <table className="w-full text-xs text-text-secondary">
      <caption className="sr-only">Commit volume by member and project</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="text-left px-2 py-1 font-medium text-text-tertiary">
            Member
          </th>
          <th scope="col" className="text-left px-2 py-1 font-medium text-text-tertiary">
            Project
          </th>
          <th scope="col" className="text-right px-2 py-1 font-medium text-text-tertiary">
            Commits
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry, i) => (
          <tr key={i} className="border-b border-border-subtle">
            <td className="px-2 py-1">{entry.memberName}</td>
            <td className="px-2 py-1">{entry.projectName}</td>
            <td className="px-2 py-1 text-right">{entry.commits}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendDataTable({ data }: { data: TrendChartEntry[] }) {
  if (data.length === 0) return null;
  return (
    <table className="w-full text-xs text-text-secondary">
      <caption className="sr-only">Commit volume over time by week</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="text-left px-2 py-1 font-medium text-text-tertiary">
            Week
          </th>
          <th scope="col" className="text-left px-2 py-1 font-medium text-text-tertiary">
            Start Date
          </th>
          <th scope="col" className="text-right px-2 py-1 font-medium text-text-tertiary">
            Commits
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry) => (
          <tr key={entry.weekBucket} className="border-b border-border-subtle">
            <td className="px-2 py-1">{entry.weekBucket}</td>
            <td className="px-2 py-1">{entry.weekStart}</td>
            <td className="px-2 py-1 text-right">{entry.commits}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeatmapDataTable({
  members,
  projects,
  cells,
}: {
  members: HeatmapMember[];
  projects: HeatmapProject[];
  cells: HeatmapCell[];
}) {
  if (members.length === 0 || projects.length === 0) return null;

  const cellMap = new Map<string, number>();
  for (const c of cells) {
    cellMap.set(`${c.memberId}:${c.projectId}`, c.commits);
  }

  return (
    <table className="w-full text-xs text-text-secondary">
      <caption className="sr-only">Member activity across projects</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="text-left px-2 py-1 font-medium text-text-tertiary">
            Member
          </th>
          {projects.map((p) => (
            <th
              key={p.id}
              scope="col"
              className="text-right px-2 py-1 font-medium text-text-tertiary"
            >
              {p.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id} className="border-b border-border-subtle">
            <th scope="row" className="text-left px-2 py-1 font-normal">
              {m.name}
            </th>
            {projects.map((p) => (
              <td key={p.id} className="text-right px-2 py-1">
                {cellMap.get(`${m.id}:${p.id}`) ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
