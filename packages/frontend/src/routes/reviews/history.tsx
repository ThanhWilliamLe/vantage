import { createRoute, useNavigate, Link } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useState, useMemo } from 'react';
import {
  useHistory,
  useProjects,
  useMembers,
  useSearch,
  useCodeChange,
  useCommunicateAction,
  useResolveAction,
  useRecentChangesByProject,
} from '../../hooks/use-api.js';
import { format } from 'date-fns';
import type { CodeChange } from '@twle/vantage-shared';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    reviewed: 'bg-success/20 text-success',
    flagged: 'bg-danger/20 text-danger',
    communicated: 'bg-warning/20 text-warning',
    resolved: 'bg-accent/20 text-accent',
    pending: 'bg-surface-overlay text-text-tertiary',
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${styles[status] ?? 'bg-surface-overlay text-text-tertiary'}`}
    >
      {status}
    </span>
  );
}

function HistoryFlaggedActions({ item }: { item: CodeChange }) {
  const communicate = useCommunicateAction();
  const resolve = useResolveAction();

  const isFlagged = item.status === 'flagged' && !!item.flaggedAt;
  const recentChanges = useRecentChangesByProject(item.projectId, isFlagged);

  const hasNewerCommits = useMemo(() => {
    if (!isFlagged || !item.flaggedAt || !recentChanges.data?.items) return false;
    const flagDate = new Date(item.flaggedAt).getTime();
    return recentChanges.data.items.some(
      (c) => new Date(c.authoredAt).getTime() > flagDate && c.id !== item.id,
    );
  }, [isFlagged, item.flaggedAt, item.id, recentChanges.data?.items]);

  return (
    <div className="mt-4">
      {item.flagReason && (
        <div className="mb-3 p-3 bg-danger/10 border border-danger/20 rounded">
          <span className="text-xs text-text-tertiary block mb-1">Flag Reason</span>
          <p className="text-sm text-danger">{item.flagReason}</p>
        </div>
      )}

      {isFlagged && hasNewerCommits && (
        <div className="mb-3 px-3 py-2 bg-accent/10 border border-accent/20 rounded text-xs text-accent">
          Newer commits detected after flag date — may indicate resolution.
        </div>
      )}

      <div className="flex gap-2">
        {item.status === 'flagged' && (
          <button
            onClick={() => communicate.mutate(item.id)}
            disabled={communicate.isPending}
            className="px-4 py-2 bg-warning text-base text-sm rounded hover:bg-warning/90 disabled:opacity-50 transition-colors"
          >
            {communicate.isPending ? 'Updating...' : 'Mark Communicated'}
          </button>
        )}
        {item.status === 'communicated' && (
          <button
            onClick={() => resolve.mutate(item.id)}
            disabled={resolve.isPending}
            className="px-4 py-2 bg-success text-white text-sm rounded hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {resolve.isPending ? 'Updating...' : 'Mark Resolved'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewHistory() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterStatus, setFilterStatus] = useState(
    () => new URLSearchParams(window.location.search).get('status') ?? '',
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filters: Record<string, string> = {};
  if (filterProject) filters.projectId = filterProject;
  if (filterMember) filters.memberId = filterMember;
  if (filterStatus) filters.status = filterStatus;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  const history = useHistory(Object.keys(filters).length > 0 ? filters : undefined);
  const projects = useProjects();
  const members = useMembers();
  const search = useSearch(searchQuery, 'changes');
  const detail = useCodeChange(selectedId ?? '');

  const items =
    searchQuery.length >= 2
      ? (search.data?.changes?.map((h) => h.item as unknown as CodeChange) ?? [])
      : (history.data?.items ?? []);
  const isLoading = searchQuery.length >= 2 ? search.isLoading : history.isLoading;
  const isError = searchQuery.length >= 2 ? search.isError : history.isError;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Review History</h1>
          <p className="text-sm text-text-secondary mt-0.5">Completed and archived reviews</p>
        </div>
        <button
          onClick={() => navigate({ to: '/reviews' })}
          className="text-sm text-accent hover:text-accent-hover"
        >
          Back to Queue
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search reviews..."
          className="px-3 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent min-w-[200px]"
        />
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
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        >
          <option value="">All statuses</option>
          <option value="reviewed">Reviewed</option>
          <option value="flagged">Flagged</option>
          <option value="communicated">Communicated</option>
          <option value="resolved">Resolved</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-2 py-1.5 bg-surface-raised border border-border rounded text-sm text-text-secondary"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load history. Please try again.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No review history found.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Completed reviews will appear here. Try adjusting your filters.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Title</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Author</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Status</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Date</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors ${selectedId === item.id ? 'bg-surface-overlay' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="text-text-primary">{item.title}</span>
                    {item.aiSummary && (
                      <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">
                        {item.aiSummary}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-text-secondary">
                    {item.authorMemberId ? (
                      <Link
                        to="/members/$id"
                        params={{ id: item.authorMemberId }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent hover:text-accent-hover"
                      >
                        {item.authorName ?? item.authorRaw}
                      </Link>
                    ) : (
                      (item.authorName ?? item.authorRaw)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-2.5 text-text-tertiary">
                    {format(new Date(item.authoredAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-3 py-2.5 text-text-tertiary">
                    +{item.linesAdded} -{item.linesDeleted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!searchQuery && history.data && history.data.total > history.data.items.length && (
        <p className="mt-4 text-xs text-text-tertiary text-center">
          Showing {history.data.items.length} of {history.data.total} results
        </p>
      )}

      {/* Detail panel */}
      {selectedId && (
        <div className="mt-4 bg-surface-raised border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary">Detail View</span>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              Close
            </button>
          </div>
          {detail.isLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-2/3 bg-surface-overlay rounded" />
              <div className="h-4 w-1/2 bg-surface-overlay rounded" />
              <div className="h-20 bg-surface-overlay rounded" />
            </div>
          ) : detail.data ? (
            <div>
              <h2 className="text-lg font-medium text-text-primary">{detail.data.title}</h2>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-tertiary">
                <span>
                  By{' '}
                  {detail.data.authorMemberId ? (
                    <Link
                      to="/members/$id"
                      params={{ id: detail.data.authorMemberId }}
                      className="text-accent hover:text-accent-hover"
                    >
                      {detail.data.authorName ?? detail.data.authorRaw}
                    </Link>
                  ) : (
                    (detail.data.authorName ?? detail.data.authorRaw)
                  )}
                </span>
                <span>{format(new Date(detail.data.authoredAt), 'MMM d, yyyy')}</span>
                <span>
                  +{detail.data.linesAdded} -{detail.data.linesDeleted}
                </span>
                <span>{detail.data.filesChanged} files</span>
                <StatusBadge status={detail.data.status} />
                {detail.data.aiRiskLevel && (
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      detail.data.aiRiskLevel === 'high'
                        ? 'bg-danger/20 text-danger'
                        : detail.data.aiRiskLevel === 'medium'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-success/20 text-success'
                    }`}
                  >
                    {detail.data.aiRiskLevel} risk
                  </span>
                )}
                {detail.data.aiCategory && (
                  <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                    {detail.data.aiCategory}
                  </span>
                )}
              </div>

              {detail.data.aiSummary && (
                <div className="mt-4 p-3 bg-surface-overlay border border-border-subtle rounded text-sm text-text-secondary">
                  <span className="text-xs text-text-tertiary block mb-1">AI Summary</span>
                  {detail.data.aiSummary}
                </div>
              )}

              {detail.data.body && (
                <div className="mt-4">
                  <span className="text-xs text-text-tertiary">Description</span>
                  <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
                    {detail.data.body}
                  </p>
                </div>
              )}

              {detail.data.taskIds && detail.data.taskIds.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs text-text-tertiary">Linked Tasks</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {detail.data.taskIds.map((task) => {
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

              {detail.data.reviewNotes && (
                <div className="mt-4">
                  <span className="text-xs text-text-tertiary">Review Notes</span>
                  <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
                    {detail.data.reviewNotes}
                  </p>
                </div>
              )}

              {/* Flagged lifecycle actions */}
              {(detail.data.status === 'flagged' || detail.data.status === 'communicated') && (
                <HistoryFlaggedActions item={detail.data} />
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-tertiary">
                {detail.data.reviewedAt && (
                  <span>Reviewed: {format(new Date(detail.data.reviewedAt), 'MMM d, yyyy')}</span>
                )}
                {detail.data.flaggedAt && (
                  <span>Flagged: {format(new Date(detail.data.flaggedAt), 'MMM d, yyyy')}</span>
                )}
                {detail.data.communicatedAt && (
                  <span>
                    Communicated: {format(new Date(detail.data.communicatedAt), 'MMM d, yyyy')}
                  </span>
                )}
                {detail.data.resolvedAt && (
                  <span>Resolved: {format(new Date(detail.data.resolvedAt), 'MMM d, yyyy')}</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const reviewsHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews/history',
  component: ReviewHistory,
});
