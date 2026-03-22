import { format } from 'date-fns/format';
import { subDays } from 'date-fns/subDays';
import { subMonths } from 'date-fns/subMonths';
import { subYears } from 'date-fns/subYears';
import { useState } from 'react';

interface ChartTimePeriodSelectorProps {
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
}

type PresetKey = '7d' | '14d' | '30d' | '90d' | '6m' | '1y' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '14d', label: '14d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '6m', label: '6m' },
  { key: '1y', label: '1y' },
  { key: 'custom', label: 'Custom' },
];

function getPresetDates(key: PresetKey): { startDate: string; endDate: string } | null {
  const now = new Date();
  const end = format(now, 'yyyy-MM-dd');
  switch (key) {
    case '7d':
      return { startDate: format(subDays(now, 7), 'yyyy-MM-dd'), endDate: end };
    case '14d':
      return { startDate: format(subDays(now, 14), 'yyyy-MM-dd'), endDate: end };
    case '30d':
      return { startDate: format(subDays(now, 30), 'yyyy-MM-dd'), endDate: end };
    case '90d':
      return { startDate: format(subDays(now, 90), 'yyyy-MM-dd'), endDate: end };
    case '6m':
      return { startDate: format(subMonths(now, 6), 'yyyy-MM-dd'), endDate: end };
    case '1y':
      return { startDate: format(subYears(now, 1), 'yyyy-MM-dd'), endDate: end };
    default:
      return null;
  }
}

function detectActivePreset(startDate: string, endDate: string): PresetKey {
  for (const preset of PRESETS) {
    if (preset.key === 'custom') continue;
    const dates = getPresetDates(preset.key);
    if (dates && dates.startDate === startDate && dates.endDate === endDate) {
      return preset.key;
    }
  }
  return 'custom';
}

export function ChartTimePeriodSelector({
  startDate,
  endDate,
  onDateChange,
}: ChartTimePeriodSelectorProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>(() =>
    detectActivePreset(startDate, endDate),
  );

  function handlePreset(key: PresetKey) {
    setActivePreset(key);
    const dates = getPresetDates(key);
    if (dates) {
      onDateChange(dates.startDate, dates.endDate);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              if (p.key === 'custom') {
                setActivePreset('custom');
              } else {
                handlePreset(p.key);
              }
            }}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              activePreset === p.key
                ? 'bg-accent text-text-primary border-accent'
                : 'text-text-tertiary border-border hover:text-text-secondary bg-surface-raised'
            }`}
            aria-pressed={activePreset === p.key}
          >
            {p.label}
          </button>
        ))}
      </div>

      {activePreset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              onDateChange(e.target.value, endDate);
            }}
            className="px-3 py-1.5 bg-surface-raised border border-border rounded-lg text-xs text-text-primary outline-none focus:border-accent"
            aria-label="Start date"
          />
          <span className="text-text-tertiary text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              onDateChange(startDate, e.target.value);
            }}
            className="px-3 py-1.5 bg-surface-raised border border-border rounded-lg text-xs text-text-primary outline-none focus:border-accent"
            aria-label="End date"
          />
        </div>
      )}
    </div>
  );
}
