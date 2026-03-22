// Canopy chart palette — 8 teal-family colors for project differentiation
// NOT semantic colors (those are danger/warning/success)
const CHART_COLORS = [
  '#3D7068',
  '#5FBFB2',
  '#2A8F7E',
  '#7ED4C8',
  '#1F6B5F',
  '#4AA395',
  '#A0E0D6',
  '#2D5A52',
];

export function buildProjectColorMap(projectIds: string[]): Map<string, string> {
  return new Map(projectIds.map((id, i) => [id, CHART_COLORS[i % CHART_COLORS.length]]));
}

// Canopy heatmap gradient — 5 steps from zero to max activity
const HEATMAP_COLORS = ['#1F1F23', '#1E3A35', '#265750', '#2E756B', '#3D9488'];

export function getHeatmapStep(commits: number, maxCommits: number): 0 | 1 | 2 | 3 | 4 {
  if (commits === 0 || maxCommits === 0) return 0;
  const ratio = commits / maxCommits;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function getHeatmapColor(commits: number, maxCommits: number): string {
  return HEATMAP_COLORS[getHeatmapStep(commits, maxCommits)];
}

export { CHART_COLORS, HEATMAP_COLORS };
