import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

interface CondensedChartProps {
  title: string;
  linkTo: string;
  linkLabel?: string;
  children: ReactNode;
}

export function CondensedChart({ title, linkTo, linkLabel, children }: CondensedChartProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {title}
        </h3>
        <button
          onClick={() => navigate({ to: linkTo as '/' })}
          className="text-xs text-accent-text hover:underline"
        >
          {linkLabel ?? 'View full charts →'}
        </button>
      </div>
      {children}
    </div>
  );
}
