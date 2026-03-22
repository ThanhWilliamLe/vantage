// ─── Workload Chart Types (v1.1) ─────────────────

export interface BarChartEntry {
  memberId: string;
  memberName: string;
  projectId: string;
  projectName: string;
  commits: number;
}

export interface TrendChartEntry {
  /** Format: "YYYY-WNN" (Monday-based week-of-year per SQLite %W, not ISO 8601 weeks) */
  weekBucket: string;
  /** Monday of that week. Exception: week 00 returns Jan 1 (may not be Monday). */
  weekStart: string;
  commits: number;
}

export interface HeatmapMember {
  id: string;
  name: string;
}

export interface HeatmapProject {
  id: string;
  name: string;
}

export interface HeatmapCell {
  memberId: string;
  projectId: string;
  commits: number;
}

export interface BarChartResponse {
  startDate: string;
  endDate: string;
  data: BarChartEntry[];
}

export interface TrendChartResponse {
  startDate: string;
  endDate: string;
  memberId?: string;
  projectId?: string;
  data: TrendChartEntry[];
}

export interface HeatmapChartResponse {
  startDate: string;
  endDate: string;
  members: HeatmapMember[];
  projects: HeatmapProject[];
  cells: HeatmapCell[];
  maxCommits: number;
}
