import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { HeatmapMember, HeatmapProject, HeatmapCell } from '@twle/vantage-shared';
import { getHeatmapColor } from '../../lib/chart-colors.js';

interface WorkloadHeatmapProps {
  members: HeatmapMember[];
  projects: HeatmapProject[];
  cells: HeatmapCell[];
  maxCommits: number;
  onCellClick?: (memberId: string, projectId: string) => void;
}

export function WorkloadHeatmap({
  members,
  projects,
  cells,
  maxCommits,
  onCellClick,
}: WorkloadHeatmapProps) {
  const navigate = useNavigate();
  const [hoveredCell, setHoveredCell] = useState<{ memberId: string; projectId: string } | null>(
    null,
  );

  if (members.length === 0 || projects.length === 0) {
    return <p className="text-sm text-text-tertiary py-4">No activity data for this period.</p>;
  }

  // Build cell lookup
  const cellMap = new Map<string, number>();
  for (const c of cells) {
    cellMap.set(`${c.memberId}:${c.projectId}`, c.commits);
  }

  function getCommits(memberId: string, projectId: string): number {
    return cellMap.get(`${memberId}:${projectId}`) ?? 0;
  }

  return (
    <div
      role="grid"
      aria-label="Heatmap showing member activity across projects"
      className="w-full overflow-x-auto"
    >
      <div
        className="inline-grid gap-px"
        style={{
          gridTemplateColumns: `140px repeat(${projects.length}, minmax(80px, 1fr))`,
        }}
      >
        {/* Header row — corner + project names */}
        <div className="h-10" /> {/* empty corner */}
        {projects.map((p) => (
          <div
            key={p.id}
            role="columnheader"
            className="h-10 flex items-end justify-center pb-1 px-1"
          >
            <button
              onClick={() => navigate({ to: '/projects/$id', params: { id: p.id } })}
              className="text-xs text-text-secondary hover:text-accent-text truncate max-w-full transition-colors"
              title={p.name}
            >
              {p.name}
            </button>
          </div>
        ))}
        {/* Data rows */}
        {members.map((m) => (
          <React.Fragment key={m.id}>
            {/* Row header — member name */}
            <div role="rowheader" className="h-10 flex items-center pr-2">
              <button
                onClick={() => navigate({ to: '/members/$id', params: { id: m.id } })}
                className="text-xs text-text-secondary hover:text-accent-text truncate transition-colors"
                title={m.name}
              >
                {m.name}
              </button>
            </div>

            {/* Data cells */}
            {projects.map((p) => {
              const commits = getCommits(m.id, p.id);
              const isHovered = hoveredCell?.memberId === m.id && hoveredCell?.projectId === p.id;
              return (
                <div
                  key={`${m.id}:${p.id}`}
                  role="gridcell"
                  aria-label={`${m.name} in ${p.name}: ${commits} commits`}
                  tabIndex={0}
                  className="h-10 rounded-sm flex items-center justify-center relative motion-safe:transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent-text"
                  style={{ backgroundColor: getHeatmapColor(commits, maxCommits) }}
                  onClick={() => onCellClick?.(m.id, p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCellClick?.(m.id, p.id);
                    }
                  }}
                  onMouseEnter={() => setHoveredCell({ memberId: m.id, projectId: p.id })}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {/* Commit count on hover */}
                  {isHovered && commits > 0 && (
                    <span className="text-xs font-medium text-text-primary">{commits}</span>
                  )}
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-overlay border border-border rounded-lg text-xs text-text-primary whitespace-nowrap z-10 pointer-events-none">
                      {m.name} × {p.name}: {commits} commits
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
