import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  usePendingQueue,
  useCodeChange,
  useCodeChangeDiff,
  useReviewAction,
  useBatchAction,
  useCommunicateAction,
  useResolveAction,
  useRecentChangesByProject,
  useDeepAnalysis,
  useRequestDeepAnalysis,
  useProjects,
  useMembers,
  useAIStatus,
  type DetectedTask,
} from '../../hooks/use-api.js';
import { formatDistanceToNow } from 'date-fns';
import type { CodeChange } from '@twle/vantage-shared';

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    high: 'bg-danger/20 text-danger',
    medium: 'bg-warning/20 text-warning',
    low: 'bg-success/20 text-success',
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${colors[level] ?? 'bg-surface-overlay text-text-tertiary'}`}
    >
      {level}
    </span>
  );
}

/** Renders a unified diff with syntax coloring for additions, deletions, and headers. */
function DiffViewer({ id }: { id: string }) {
  const diff = useCodeChangeDiff(id);
  const [collapsed, setCollapsed] = useState(false);

  if (diff.isLoading) {
    return (
      <div className="mt-4">
        <span className="text-xs text-text-tertiary">Diff</span>
        <div className="mt-1 h-32 bg-surface-overlay border border-border-subtle rounded animate-pulse" />
      </div>
    );
  }

  if (diff.isError) {
    return (
      <div className="mt-4">
        <span className="text-xs text-text-tertiary">Diff</span>
        <div className="mt-1 p-3 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
          Failed to load diff. The repository may not be accessible.
        </div>
      </div>
    );
  }

  if (!diff.data || !diff.data.diff) {
    return null;
  }

  const lines = diff.data.diff.split('\n');

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-tertiary">Diff</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <div className="border border-border-subtle rounded overflow-hidden">
          <pre className="text-xs leading-5 overflow-x-auto max-h-[400px] overflow-y-auto bg-surface p-0 m-0">
            {lines.map((line, i) => {
              let className = 'px-3 block';
              if (line.startsWith('+++') || line.startsWith('---')) {
                className += ' text-accent font-medium bg-accent/5';
              } else if (line.startsWith('@@')) {
                className += ' text-accent bg-accent/10';
              } else if (line.startsWith('diff ')) {
                className += ' text-accent font-medium bg-accent/5';
              } else if (line.startsWith('+')) {
                className += ' text-success bg-success/10';
              } else if (line.startsWith('-')) {
                className += ' text-danger bg-danger/10';
              } else {
                className += ' text-text-secondary';
              }
              return (
                <code key={i} className={className}>
                  {line || '\n'}
                </code>
              );
            })}
          </pre>
          {diff.data.truncated && (
            <div className="px-3 py-2 bg-warning/10 border-t border-border-subtle text-xs text-warning">
              Diff truncated due to size. Showing partial content.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shows communicate/resolve lifecycle buttons for flagged items, plus resolution hints. */
function FlaggedLifecycleActions({
  item,
  selectedId,
}: {
  item: CodeChange & { taskIds?: DetectedTask[] };
  selectedId: string;
}) {
  const communicateAction = useCommunicateAction();
  const resolveAction = useResolveAction();

  // Resolution hint: check for newer commits from the same project after the flag date
  const isFlagged = item.status === 'flagged' && !!item.flaggedAt;
  const recentChanges = useRecentChangesByProject(item.projectId, isFlagged);

  const hasNewerCommits = useMemo(() => {
    if (!isFlagged || !item.flaggedAt || !recentChanges.data?.items) return false;
    const flagDate = new Date(item.flaggedAt).getTime();
    return recentChanges.data.items.some(
      (c) => new Date(c.authoredAt).getTime() > flagDate && c.id !== item.id,
    );
  }, [isFlagged, item.flaggedAt, item.id, recentChanges.data?.items]);

  // Only render for flagged or communicated items
  if (item.status !== 'flagged' && item.status !== 'communicated') {
    return null;
  }

  return (
    <div className="mt-4">
      {/* Resolution hint for flagged items */}
      {isFlagged && hasNewerCommits && (
        <div className="mb-3 px-3 py-2 bg-accent/10 border border-accent/20 rounded text-xs text-accent">
          Newer commits detected after flag date — may indicate resolution.
        </div>
      )}

      {/* Flag reason display */}
      {item.flagReason && (
        <div className="mb-3">
          <span className="text-xs text-text-tertiary">Flag Reason</span>
          <p className="mt-1 text-sm text-danger">{item.flagReason}</p>
        </div>
      )}

      {/* Lifecycle action buttons */}
      <div className="flex gap-2">
        {item.status === 'flagged' && (
          <button
            onClick={() => communicateAction.mutate(selectedId)}
            disabled={communicateAction.isPending}
            className="px-4 py-2 bg-warning text-base text-sm rounded hover:bg-warning/90 disabled:opacity-50 transition-colors"
          >
            {communicateAction.isPending ? 'Updating...' : 'Mark Communicated'}
          </button>
        )}
        {item.status === 'communicated' && (
          <button
            onClick={() => resolveAction.mutate(selectedId)}
            disabled={resolveAction.isPending}
            className="px-4 py-2 bg-success text-white text-sm rounded hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {resolveAction.isPending ? 'Updating...' : 'Mark Resolved'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Severity badge colors for deep analysis findings. */
const severityStyles: Record<string, string> = {
  high: 'bg-danger/20 text-danger',
  medium: 'bg-warning/20 text-warning',
  low: 'bg-success/20 text-success',
  info: 'bg-accent/20 text-accent',
};

/** Panel showing deep analysis results or a request button. */
function DeepAnalysisPanel({ codeChangeId }: { codeChangeId: string }) {
  const deepAnalysis = useDeepAnalysis(codeChangeId);
  const requestAnalysis = useRequestDeepAnalysis();

  const hasResults = deepAnalysis.data && deepAnalysis.data.findings?.length > 0;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-tertiary">Deep Analysis</span>
        {hasResults && (
          <span className="text-xs text-text-tertiary">
            {deepAnalysis.data!.findings.length} finding
            {deepAnalysis.data!.findings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {hasResults ? (
        <div className="border border-border-subtle rounded overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {deepAnalysis.data!.findings.map((finding, i) => (
              <div key={i} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${severityStyles[finding.severity] ?? 'bg-surface-overlay text-text-tertiary'}`}
                  >
                    {finding.severity}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                    {finding.category}
                  </span>
                  {finding.file && (
                    <span className="text-xs text-text-tertiary">
                      {finding.file}
                      {finding.line ? `:${finding.line}` : ''}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-text-secondary">{finding.description}</p>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 bg-surface-overlay border-t border-border-subtle flex items-center justify-between">
            <span className="text-xs text-text-tertiary">
              Analyzed {new Date(deepAnalysis.data!.analyzedAt).toLocaleString()}
            </span>
            <button
              onClick={() => requestAnalysis.mutate({ codeChangeId, force: true })}
              disabled={requestAnalysis.isPending}
              className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
            >
              {requestAnalysis.isPending ? 'Re-analyzing...' : 'Re-analyze'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => requestAnalysis.mutate({ codeChangeId })}
            disabled={requestAnalysis.isPending}
            className="px-3 py-1.5 bg-accent/10 text-accent text-sm rounded hover:bg-accent/20 disabled:opacity-50 transition-colors"
          >
            {requestAnalysis.isPending ? 'Requesting...' : 'Request Deep Analysis'}
          </button>
          {requestAnalysis.isError && (
            <span className="text-xs text-danger">
              {(requestAnalysis.error as Error)?.message?.includes('No active AI provider')
                ? 'No AI provider configured. Add one in Settings.'
                : 'Failed to request analysis. Try again.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewQueue() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterProject, setFilterProject] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [notes, setNotes] = useState('');
  const [flagReason, setFlagReason] = useState('');

  const filters: Record<string, string> = {};
  if (filterProject) filters.projectId = filterProject;
  if (filterMember) filters.memberId = filterMember;
  if (filterRisk) filters.riskLevel = filterRisk;

  const pending = usePendingQueue(Object.keys(filters).length > 0 ? filters : undefined);
  const detail = useCodeChange(selectedId ?? '');
  const projects = useProjects();
  const members = useMembers();
  const aiStatus = useAIStatus();

  const reviewAction = useReviewAction();
  const batchAction = useBatchAction();

  const items = pending.data?.items ?? [];

  // Auto-select first item
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = items.findIndex((i) => i.id === selectedId);
      if (e.key === 'j' && currentIndex < items.length - 1) {
        e.preventDefault();
        setSelectedId(items[currentIndex + 1].id);
      }
      if (e.key === 'k' && currentIndex > 0) {
        e.preventDefault();
        setSelectedId(items[currentIndex - 1].id);
      }
      if (e.key === 'r' && selectedId && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        reviewAction.mutate({ id: selectedId, action: 'review', notes: notes || undefined });
      }
      if (e.key === 'f' && selectedId && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (flagReason) {
          reviewAction.mutate({ id: selectedId, action: 'flag', reason: flagReason });
        }
      }
      if (e.key === 'd' && selectedId && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        reviewAction.mutate({ id: selectedId, action: 'defer' });
      }
    },
    [items, selectedId, reviewAction, notes, flagReason],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function handleBatch(action: 'review' | 'flag' | 'defer') {
    batchAction.mutate({
      ids: Array.from(selectedIds),
      action,
      notes: action === 'review' ? notes || undefined : undefined,
      flagReason: action === 'flag' ? flagReason || undefined : undefined,
    });
    setSelectedIds(new Set());
  }

  if (pending.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Review Queue</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (pending.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Review Queue</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load review queue. Please try again.
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div data-testid="review-queue-empty">
        <h1 className="text-xl font-semibold text-text-primary">Review Queue</h1>
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success text-lg">
            ✓
          </div>
          <h2 className="text-text-primary">No pending items — all caught up!</h2>
          <p className="text-sm text-text-secondary max-w-sm">
            New code changes will appear here after a repository scan. Check{' '}
            <button
              onClick={() => navigate({ to: '/reviews/history', search: {} })}
              className="text-accent hover:text-accent-hover"
            >
              review history
            </button>{' '}
            for completed items.
          </p>
        </div>
      </div>
    );
  }

  const detailData = detail.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Review Queue</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {pending.data?.total ?? 0} pending items
          </p>
        </div>
      </div>

      {aiStatus.data?.processing && (
        <div className="mb-4 px-4 py-2 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          AI processing — {aiStatus.data.completed}/{aiStatus.data.total} complete
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        >
          <option value="">All projects</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        >
          <option value="">All members</option>
          {members.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        >
          <option value="">All risk levels</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-surface-overlay border border-border rounded-lg">
          <span className="text-sm text-text-secondary">{selectedIds.size} selected</span>
          <button
            onClick={() => handleBatch('review')}
            className="px-3 py-1 bg-success/20 text-success text-xs rounded hover:bg-success/30"
          >
            Review All
          </button>
          <button
            onClick={() => handleBatch('defer')}
            className="px-3 py-1 bg-warning/20 text-warning text-xs rounded hover:bg-warning/30"
          >
            Defer All
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-text-tertiary hover:text-text-secondary"
          >
            Clear
          </button>
        </div>
      )}

      {/* Split pane */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: '60vh' }}>
        {/* List pane */}
        <div className="lg:col-span-2 space-y-1 overflow-y-auto max-h-[70vh] pr-1">
          <button
            onClick={selectAll}
            className="w-full text-left text-xs text-text-tertiary hover:text-text-secondary px-3 py-1"
          >
            {selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
          </button>
          {items.map((item: CodeChange) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border ${
                selectedId === item.id
                  ? 'bg-surface-overlay border-accent/40'
                  : 'bg-surface-raised border-border hover:bg-surface-overlay'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-primary truncate">{item.title}</span>
                  {item.prStatus === 'draft' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                      DRAFT
                    </span>
                  )}
                  <RiskBadge level={item.aiRiskLevel} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                  <span>{item.authorName ?? item.authorRaw}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(item.authoredAt), { addSuffix: true })}</span>
                </div>
                {item.aiSummary && (
                  <p className="mt-1 text-xs text-text-secondary line-clamp-2">{item.aiSummary}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-3 bg-surface-raised border border-border rounded-lg p-5 overflow-y-auto max-h-[70vh]">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
              Select an item to view details
            </div>
          ) : detail.isLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-2/3 bg-surface-overlay rounded" />
              <div className="h-4 w-1/2 bg-surface-overlay rounded" />
              <div className="h-20 bg-surface-overlay rounded" />
            </div>
          ) : detailData ? (
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-text-primary">{detailData.title}</h2>
                {detailData.prStatus === 'draft' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">
                    DRAFT
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-tertiary">
                <span>By {detailData.authorName ?? detailData.authorRaw}</span>
                <span>{new Date(detailData.authoredAt).toLocaleDateString()}</span>
                <span>
                  +{detailData.linesAdded} -{detailData.linesDeleted}
                </span>
                <span>{detailData.filesChanged} files</span>
                {detailData.prStatus && detailData.prStatus !== 'draft' && (
                  <span
                    className={`px-1.5 py-0.5 rounded ${detailData.prStatus === 'merged' ? 'bg-success/20 text-success' : detailData.prStatus === 'closed' ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent'}`}
                  >
                    PR: {detailData.prStatus}
                  </span>
                )}
                <RiskBadge level={detailData.aiRiskLevel} />
                {detailData.aiCategory && (
                  <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                    {detailData.aiCategory}
                  </span>
                )}
              </div>

              {detailData.aiSummary && (
                <div className="mt-4 p-3 bg-surface-overlay border border-border-subtle rounded text-sm text-text-secondary">
                  <span className="text-xs text-text-tertiary block mb-1">AI Summary</span>
                  {detailData.aiSummary}
                </div>
              )}

              {/* Deep analysis */}
              <DeepAnalysisPanel codeChangeId={selectedId} />

              {detailData.body && (
                <div className="mt-4">
                  <span className="text-xs text-text-tertiary">Description</span>
                  <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
                    {detailData.body}
                  </p>
                </div>
              )}

              {detailData.taskIds && detailData.taskIds.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs text-text-tertiary">Linked Tasks</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {detailData.taskIds.map((task) => {
                      const taskId = typeof task === 'string' ? task : task.taskId;
                      const taskUrl = typeof task === 'string' ? null : task.url;
                      return taskUrl ? (
                        <a
                          key={taskId}
                          href={taskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded hover:bg-accent/20 transition-colors underline"
                        >
                          {taskId}
                        </a>
                      ) : (
                        <span
                          key={taskId}
                          className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded"
                        >
                          {taskId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Diff viewer */}
              <DiffViewer id={selectedId} />

              {/* Flagged item lifecycle actions + resolution hints */}
              <FlaggedLifecycleActions item={detailData} selectedId={selectedId} />

              {/* Review notes input */}
              <div className="mt-6">
                <label className="block text-xs text-text-tertiary mb-1">Review Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary resize-none h-20 outline-none focus:border-accent"
                />
              </div>

              <div className="mt-3">
                <label className="block text-xs text-text-tertiary mb-1">
                  Flag Reason (for flag action)
                </label>
                <input
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="Reason for flagging..."
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() =>
                    reviewAction.mutate({
                      id: selectedId,
                      action: 'review',
                      notes: notes || undefined,
                    })
                  }
                  disabled={reviewAction.isPending}
                  className="px-4 py-2 bg-success text-white text-sm rounded hover:bg-success/90 disabled:opacity-50 transition-colors"
                >
                  Review (r)
                </button>
                <button
                  onClick={() => {
                    if (flagReason) {
                      reviewAction.mutate({ id: selectedId, action: 'flag', reason: flagReason });
                    }
                  }}
                  disabled={reviewAction.isPending || !flagReason}
                  className="px-4 py-2 bg-danger text-white text-sm rounded hover:bg-danger/90 disabled:opacity-50 transition-colors"
                >
                  Flag (f)
                </button>
                <button
                  onClick={() => reviewAction.mutate({ id: selectedId, action: 'defer' })}
                  disabled={reviewAction.isPending}
                  className="px-4 py-2 bg-warning text-base text-sm rounded hover:bg-warning/90 disabled:opacity-50 transition-colors"
                >
                  Defer (d)
                </button>
              </div>
              <p className="mt-2 text-xs text-text-tertiary">Use j/k to navigate, r/f/d to act</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const reviewsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews',
  component: ReviewQueue,
});
