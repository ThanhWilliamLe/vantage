import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useSyncAll,
  useScanRepos,
  useSyncRepos,
  useProjects,
  queryKeys,
} from '../hooks/api/core.js';
import { apiClient, errorMessage } from '../lib/api-client.js';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import type { SyncFilters, CombinedSyncResult, ScanState, SyncState } from '@twle/vantage-shared';

interface SyncButtonProps {
  variant: 'primary' | 'secondary' | 'compact';
  filters?: SyncFilters;
  showDropdown?: boolean;
  showStatus?: boolean;
  onComplete?: (result: CombinedSyncResult) => void;
}

function formatSyncResult(result: CombinedSyncResult): void {
  const { scan, sync } = result;
  const totalScanned = scan.reposScanned;
  const totalSynced = sync.reposSynced;
  const totalFailed = scan.reposFailed + sync.reposFailed;
  const newCommits = scan.totalNewCommits;
  const newItems = sync.totalNewItems;

  if (totalFailed > 0 && totalScanned + totalSynced === 0) {
    const allResults = [...scan.results, ...sync.results];
    const firstError = allResults.find((r) => r.error)?.error ?? 'Unknown error';
    toast.error(`Sync failed: ${firstError}`);
  } else if (totalFailed > 0) {
    toast.warning(
      `Synced ${totalScanned + totalSynced}/${totalScanned + totalSynced + totalFailed} repos (${totalFailed} failed)`,
    );
  } else if (newCommits === 0 && newItems === 0) {
    toast.info('Sync complete — no new changes found');
  } else {
    const parts: string[] = [];
    if (newCommits > 0) parts.push(`${newCommits} new commits`);
    if (newItems > 0) parts.push(`${newItems} new PRs`);
    toast.success(`Synced: ${parts.join(', ')}`);
  }
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function SyncButton({
  variant,
  filters,
  showDropdown,
  showStatus,
  onComplete,
}: SyncButtonProps) {
  const syncAll = useSyncAll();
  const scanRepos = useScanRepos();
  const syncRepos = useSyncRepos();
  const projects = useProjects();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isPending = syncAll.isPending || scanRepos.isPending || syncRepos.isPending;

  // Status polling — only active when showStatus is true
  const scanStatus = useQuery({
    queryKey: queryKeys.scanStatus,
    queryFn: () => apiClient.get<ScanState[]>('/api/scan/status'),
    enabled: !!showStatus,
  });
  const syncStatus = useQuery({
    queryKey: queryKeys.syncStatus,
    queryFn: () => apiClient.get<SyncState[]>('/api/sync/status'),
    enabled: !!showStatus,
  });

  const lastSyncedText = useMemo(() => {
    if (!showStatus) return null;
    const dates: Date[] = [];
    for (const s of scanStatus.data ?? []) {
      if (s.lastScannedAt) dates.push(new Date(s.lastScannedAt));
    }
    for (const s of syncStatus.data ?? []) {
      if (s.lastSyncedAt) dates.push(new Date(s.lastSyncedAt));
    }
    if (dates.length === 0) return 'never';
    const mostRecent = new Date(Math.max(...dates.map((d) => d.getTime())));
    return formatDistanceToNow(mostRecent, { addSuffix: true });
  }, [showStatus, scanStatus.data, syncStatus.data]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dropdownOpen]);

  function handleSyncAll(overrideFilters?: SyncFilters) {
    setDropdownOpen(false);
    syncAll.mutate(overrideFilters ?? filters, {
      onSuccess: (result) => {
        formatSyncResult(result);
        onComplete?.(result);
      },
      onError: (err) => toast.error(`Sync failed: ${errorMessage(err)}`),
    });
  }

  function handleScanOnly() {
    setDropdownOpen(false);
    scanRepos.mutate(filters, {
      onSuccess: (result) => {
        if (result.reposFailed > 0) {
          toast.warning(
            `Scanned ${result.reposScanned}/${result.reposScanned + result.reposFailed} repos (${result.reposFailed} failed)`,
          );
        } else if (result.totalNewCommits === 0) {
          toast.info('Scan complete — no new commits found');
        } else {
          toast.success(
            `Scanned ${result.reposScanned} repos: ${result.totalNewCommits} new commits`,
          );
        }
      },
      onError: (err) => toast.error(`Scan failed: ${errorMessage(err)}`),
    });
  }

  function handleSyncOnly() {
    setDropdownOpen(false);
    syncRepos.mutate(filters, {
      onSuccess: (result) => {
        if (result.reposFailed > 0) {
          toast.warning(
            `Synced ${result.reposSynced}/${result.reposSynced + result.reposFailed} repos (${result.reposFailed} failed)`,
          );
        } else if (result.totalNewItems === 0) {
          toast.info('Sync complete — no new PRs found');
        } else {
          toast.success(`Synced ${result.reposSynced} repos: ${result.totalNewItems} new PRs`);
        }
      },
      onError: (err) => toast.error(`Sync failed: ${errorMessage(err)}`),
    });
  }

  const buttonStyles = {
    primary:
      'px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors',
    secondary:
      'px-3 py-1.5 bg-surface-raised border border-border text-text-secondary text-xs rounded-full hover:bg-surface-overlay disabled:opacity-50 transition-colors',
    compact:
      'text-sm text-accent-text hover:text-accent-hover disabled:opacity-50 transition-colors',
  };

  return (
    <div className="relative inline-flex items-center gap-0.5" ref={ref}>
      <button
        onClick={() => handleSyncAll()}
        disabled={isPending}
        className={`flex items-center gap-1.5 ${buttonStyles[variant]}`}
        data-testid="sync-button"
      >
        {isPending ? <Spinner /> : <span aria-hidden="true">&#8635;</span>}
        {isPending ? 'Syncing...' : 'Sync Now'}
      </button>

      {showStatus && lastSyncedText && (
        <span className="text-xs text-text-tertiary ml-2">Last synced: {lastSyncedText}</span>
      )}

      {showDropdown && (
        <>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isPending}
            className={`px-1 py-1.5 text-xs rounded-r-full disabled:opacity-50 ${
              variant === 'primary'
                ? 'bg-accent text-white hover:bg-accent-hover -ml-1.5 rounded-l-none'
                : 'bg-surface-raised border border-border text-text-secondary hover:bg-surface-overlay -ml-1.5 rounded-l-none'
            }`}
            aria-label="Sync options"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            &#9662;
          </button>

          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-surface-raised border border-border rounded shadow-lg z-50 py-1">
              <button
                onClick={handleScanOnly}
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
              >
                Scan local repos only
              </button>
              <button
                onClick={handleSyncOnly}
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
              >
                Sync API repos only
              </button>
              {projects.data && projects.data.length > 0 && (
                <>
                  <div className="border-t border-border my-1" />
                  {projects.data.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSyncAll({ projectId: p.id })}
                      className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay truncate"
                    >
                      {p.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
