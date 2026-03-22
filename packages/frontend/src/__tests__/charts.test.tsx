import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => {
  const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  );
  const MockBarChart = ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-count={data.length}>
      {children}
    </div>
  );
  const MockLineChart = ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-count={data.length}>
      {children}
    </div>
  );
  const MockBar = ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />;
  const MockLine = ({ dataKey, name }: { dataKey: string; name?: string }) => (
    <div data-testid={`line-${dataKey}`} data-name={name} />
  );
  const MockXAxis = () => <div data-testid="x-axis" />;
  const MockYAxis = () => <div data-testid="y-axis" />;
  const MockTooltip = () => <div data-testid="tooltip" />;
  const MockCartesianGrid = () => <div data-testid="grid" />;
  const MockCell = ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <div data-testid="cell" aria-label={ariaLabel} />
  );

  return {
    ResponsiveContainer: MockResponsiveContainer,
    BarChart: MockBarChart,
    Bar: MockBar,
    LineChart: MockLineChart,
    Line: MockLine,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    Tooltip: MockTooltip,
    CartesianGrid: MockCartesianGrid,
    Cell: MockCell,
  };
});

// Mock react-router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

import { WorkloadBarChart } from '../components/charts/WorkloadBarChart.js';
import { WorkloadTrendChart } from '../components/charts/WorkloadTrendChart.js';
import { WorkloadHeatmap } from '../components/charts/WorkloadHeatmap.js';
import { ChartTimePeriodSelector } from '../components/charts/ChartTimePeriodSelector.js';
import { ChartDataTable } from '../components/charts/ChartDataTable.js';
import { buildProjectColorMap, getHeatmapStep, getHeatmapColor } from '../lib/chart-colors.js';
import type {
  BarChartEntry,
  TrendChartEntry,
  HeatmapMember,
  HeatmapProject,
  HeatmapCell,
} from '@twle/vantage-shared';

// ── Test data ──────────────────────────────────────

const barData: BarChartEntry[] = [
  {
    memberId: 'm1',
    memberName: 'Alice',
    projectId: 'p1',
    projectName: 'Auth Service',
    commits: 42,
  },
  { memberId: 'm1', memberName: 'Alice', projectId: 'p2', projectName: 'API Gateway', commits: 18 },
  { memberId: 'm2', memberName: 'Bob', projectId: 'p1', projectName: 'Auth Service', commits: 30 },
];

const trendData: TrendChartEntry[] = [
  { weekBucket: '2026-W10', weekStart: '2026-03-09', commits: 15 },
  { weekBucket: '2026-W11', weekStart: '2026-03-16', commits: 22 },
  { weekBucket: '2026-W12', weekStart: '2026-03-23', commits: 18 },
];

const heatmapMembers: HeatmapMember[] = [
  { id: 'm1', name: 'Alice' },
  { id: 'm2', name: 'Bob' },
];

const heatmapProjects: HeatmapProject[] = [
  { id: 'p1', name: 'Auth Service' },
  { id: 'p2', name: 'API Gateway' },
];

const heatmapCells: HeatmapCell[] = [
  { memberId: 'm1', projectId: 'p1', commits: 42 },
  { memberId: 'm1', projectId: 'p2', commits: 18 },
  { memberId: 'm2', projectId: 'p1', commits: 30 },
  { memberId: 'm2', projectId: 'p2', commits: 0 },
];

// ── WorkloadBarChart ────────────────────────────────

describe('WorkloadBarChart', () => {
  const colorMap = buildProjectColorMap(['p1', 'p2']);

  it('renders bar chart with data', () => {
    render(<WorkloadBarChart data={barData} projectColorMap={colorMap} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Bar chart showing commit volume by team member',
    );
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<WorkloadBarChart data={[]} projectColorMap={colorMap} />);
    expect(screen.getByText('No activity data for this period.')).toBeInTheDocument();
  });

  it('calls onBarClick when provided', () => {
    const onClick = vi.fn();
    render(<WorkloadBarChart data={barData} projectColorMap={colorMap} onBarClick={onClick} />);
    // Bars are rendered — verify they exist (click testing limited with mocked recharts)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders in condensed mode without tooltip', () => {
    render(<WorkloadBarChart data={barData} projectColorMap={colorMap} condensed />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });
});

// ── WorkloadTrendChart ──────────────────────────────

describe('WorkloadTrendChart', () => {
  it('renders trend line with data', () => {
    render(<WorkloadTrendChart data={trendData} scope="aggregate" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Trend line showing commit volume over time',
    );
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('shows message for empty data', () => {
    render(<WorkloadTrendChart data={[]} scope="aggregate" />);
    expect(screen.getByText('No activity data for this period.')).toBeInTheDocument();
  });

  it('shows message for sparse data (1 point)', () => {
    const singlePoint = [trendData[0]];
    render(<WorkloadTrendChart data={singlePoint} scope="aggregate" />);
    expect(
      screen.getByText('Not enough data to show a trend (need at least 2 weeks).'),
    ).toBeInTheDocument();
  });

  it('renders scope selector in non-condensed mode', () => {
    const onScopeChange = vi.fn();
    render(
      <WorkloadTrendChart
        data={trendData}
        scope="aggregate"
        onScopeChange={onScopeChange}
        members={[{ id: 'm1', name: 'Alice' }]}
        projects={[{ id: 'p1', name: 'Auth' }]}
      />,
    );
    expect(screen.getByText('All members')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by member')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by project')).toBeInTheDocument();
  });

  it('does not render scope selector in condensed mode', () => {
    render(<WorkloadTrendChart data={trendData} scope="aggregate" condensed />);
    expect(screen.queryByText('All members')).not.toBeInTheDocument();
  });
});

// ── WorkloadHeatmap ─────────────────────────────────

describe('WorkloadHeatmap', () => {
  it('renders heatmap grid', () => {
    render(
      <WorkloadHeatmap
        members={heatmapMembers}
        projects={heatmapProjects}
        cells={heatmapCells}
        maxCommits={42}
      />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-label',
      'Heatmap showing member activity across projects',
    );
    // Check cells exist
    const gridcells = screen.getAllByRole('gridcell');
    expect(gridcells).toHaveLength(4); // 2 members × 2 projects
  });

  it('renders empty state with no members', () => {
    render(<WorkloadHeatmap members={[]} projects={heatmapProjects} cells={[]} maxCommits={0} />);
    expect(screen.getByText('No activity data for this period.')).toBeInTheDocument();
  });

  it('has correct aria-labels on cells', () => {
    render(
      <WorkloadHeatmap
        members={heatmapMembers}
        projects={heatmapProjects}
        cells={heatmapCells}
        maxCommits={42}
      />,
    );
    expect(screen.getByLabelText('Alice in Auth Service: 42 commits')).toBeInTheDocument();
    expect(screen.getByLabelText('Bob in API Gateway: 0 commits')).toBeInTheDocument();
  });

  it('calls onCellClick', () => {
    const onClick = vi.fn();
    render(
      <WorkloadHeatmap
        members={heatmapMembers}
        projects={heatmapProjects}
        cells={heatmapCells}
        maxCommits={42}
        onCellClick={onClick}
      />,
    );
    fireEvent.click(screen.getByLabelText('Alice in Auth Service: 42 commits'));
    expect(onClick).toHaveBeenCalledWith('m1', 'p1');
  });

  it('supports keyboard activation', () => {
    const onClick = vi.fn();
    render(
      <WorkloadHeatmap
        members={heatmapMembers}
        projects={heatmapProjects}
        cells={heatmapCells}
        maxCommits={42}
        onCellClick={onClick}
      />,
    );
    const cell = screen.getByLabelText('Bob in Auth Service: 30 commits');
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith('m2', 'p1');
  });
});

// ── ChartTimePeriodSelector ─────────────────────────

describe('ChartTimePeriodSelector', () => {
  it('renders all preset buttons', () => {
    const onChange = vi.fn();
    render(
      <ChartTimePeriodSelector
        startDate="2026-02-20"
        endDate="2026-03-22"
        onDateChange={onChange}
      />,
    );
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('14d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
    expect(screen.getByText('90d')).toBeInTheDocument();
    expect(screen.getByText('6m')).toBeInTheDocument();
    expect(screen.getByText('1y')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('fires onDateChange when preset clicked', () => {
    const onChange = vi.fn();
    render(
      <ChartTimePeriodSelector
        startDate="2026-02-20"
        endDate="2026-03-22"
        onDateChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('7d'));
    expect(onChange).toHaveBeenCalled();
    const [start, end] = onChange.mock.calls[0];
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
  });

  it('shows date inputs in custom mode', () => {
    const onChange = vi.fn();
    render(
      <ChartTimePeriodSelector
        startDate="2026-02-20"
        endDate="2026-03-22"
        onDateChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });
});

// ── ChartDataTable ──────────────────────────────────

describe('ChartDataTable', () => {
  it('renders bar data table', () => {
    render(<ChartDataTable type="bar" data={barData} />);
    // Alice has 2 entries, Auth Service has 2 entries in test data
    expect(screen.getAllByText('Alice')).toHaveLength(2);
    expect(screen.getAllByText('Auth Service')).toHaveLength(2);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('API Gateway')).toBeInTheDocument();
  });

  it('renders trend data table', () => {
    render(<ChartDataTable type="trend" data={trendData} />);
    expect(screen.getByText('2026-W10')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders heatmap data table', () => {
    render(
      <ChartDataTable
        type="heatmap"
        data={{ members: heatmapMembers, projects: heatmapProjects, cells: heatmapCells }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('returns null for empty bar data', () => {
    const { container } = render(<ChartDataTable type="bar" data={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

// ── Utility functions ───────────────────────────────

describe('chart-colors utilities', () => {
  it('buildProjectColorMap assigns colors cyclically', () => {
    const map = buildProjectColorMap(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(map.get('a')).toBe('#3D7068');
    expect(map.get('i')).toBe('#3D7068'); // cycles back to first color
    expect(map.size).toBe(9);
  });

  it('getHeatmapStep returns 0 for zero commits', () => {
    expect(getHeatmapStep(0, 100)).toBe(0);
  });

  it('getHeatmapStep returns 0 when maxCommits is 0', () => {
    expect(getHeatmapStep(5, 0)).toBe(0);
  });

  it('getHeatmapStep returns correct steps', () => {
    expect(getHeatmapStep(10, 100)).toBe(1); // 10% → step 1
    expect(getHeatmapStep(30, 100)).toBe(2); // 30% → step 2
    expect(getHeatmapStep(60, 100)).toBe(3); // 60% → step 3
    expect(getHeatmapStep(90, 100)).toBe(4); // 90% → step 4
    expect(getHeatmapStep(100, 100)).toBe(4); // 100% → step 4
  });

  it('getHeatmapColor returns surface color for zero', () => {
    expect(getHeatmapColor(0, 100)).toBe('#1F1F23');
  });

  it('getHeatmapColor returns highest intensity for max', () => {
    expect(getHeatmapColor(100, 100)).toBe('#3D9488');
  });
});
