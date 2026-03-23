import { useState, useMemo } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { SearchableSelect } from '../../components/searchable-select.js';
import {
  useProject,
  useProjectAssignments,
  useCodeChanges,
  useMembers,
  useScanRepos,
  useSyncRepos,
  useSyncAll,
  useScanStatus,
  useSyncStatus,
} from '../../hooks/api/core.js';
import {
  useUpdateProject,
  useProjectRepositories,
  useCreateRepository,
  useDeleteRepository,
  useCreateAssignment,
  useEndAssignment,
  useDeleteAssignment,
  useProjectTaskPatterns,
  useCreateTaskPattern,
  useDeleteTaskPattern,
  useTaskTrackerCredentials,
  useCreateTaskTrackerCredential,
  useUpdateTaskTrackerCredential,
  useDeleteTaskTrackerCredential,
} from '../../hooks/api/settings.js';
import { errorMessage } from '../../lib/api-client.js';
import { format } from 'date-fns/format';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { toast } from 'sonner';

export function ProjectDetail() {
  const { id } = useParams({ from: '/projects/$id' });
  const navigate = useNavigate();
  const project = useProject(id);
  const recentChanges = useCodeChanges({ projectId: id, limit: '10' });
  const members = useMembers();
  const updateProject = useUpdateProject();
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const memberMap = useMemo(
    () => new Map(members.data?.map((m) => [m.id, m.name]) ?? []),
    [members.data],
  );

  if (project.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Project Detail</h1>
        <div className="mt-4 space-y-3">
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

  if (project.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Project Detail</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load project. The project may not exist.
        </div>
      </div>
    );
  }

  const p = project.data;
  if (!p) return null;

  return (
    <div>
      <button
        onClick={() => navigate({ to: '/projects' })}
        className="text-sm text-accent-text hover:text-accent-hover mb-4 inline-block"
      >
        &larr; Back to Projects
      </button>

      {/* Header with edit + status */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{p.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                p.status === 'active'
                  ? 'bg-success/20 text-success'
                  : 'bg-surface-overlay text-text-tertiary'
              }`}
            >
              {p.status}
            </span>
            {p.description && <span className="text-sm text-text-secondary">{p.description}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-accent-text hover:text-accent-hover"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          {p.status === 'active' ? (
            <button
              onClick={() => {
                if (confirm(`Archive "${p.name}"? You can reactivate it later.`))
                  updateProject.mutate(
                    { id: p.id, status: 'archived' },
                    { onError: (err) => toast.error(`Failed to archive: ${errorMessage(err)}`) },
                  );
              }}
              className="text-sm text-text-tertiary hover:text-danger"
            >
              Archive
            </button>
          ) : (
            <button
              onClick={() =>
                updateProject.mutate(
                  { id: p.id, status: 'active' },
                  { onError: (err) => toast.error(`Failed to activate: ${errorMessage(err)}`) },
                )
              }
              className="text-sm text-text-tertiary hover:text-success"
            >
              Activate
            </button>
          )}
        </div>
      </div>

      {editing && <ProjectEditForm project={p} onDone={() => setEditing(false)} />}

      {/* Repositories */}
      <section className="mb-6">
        <button
          onClick={() => setCollapsed((c) => ({ ...c, repos: !c.repos }))}
          aria-expanded={!collapsed.repos}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 w-full text-left cursor-pointer"
        >
          <span className="text-text-tertiary text-xs" aria-hidden="true">
            {collapsed.repos ? '\u25B6' : '\u25BC'}
          </span>
          Repositories
        </button>
        {!collapsed.repos && <ProjectRepositories projectId={id} />}
      </section>

      {/* Team composition */}
      <section className="mb-6">
        <button
          onClick={() => setCollapsed((c) => ({ ...c, team: !c.team }))}
          aria-expanded={!collapsed.team}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 w-full text-left cursor-pointer"
        >
          <span className="text-text-tertiary text-xs" aria-hidden="true">
            {collapsed.team ? '\u25B6' : '\u25BC'}
          </span>
          Team
        </button>
        {!collapsed.team && (
          <ProjectAssignments projectId={id} memberMap={memberMap} members={members.data ?? []} />
        )}
      </section>

      {/* Task patterns */}
      <section className="mb-6">
        <button
          onClick={() => setCollapsed((c) => ({ ...c, tasks: !c.tasks }))}
          aria-expanded={!collapsed.tasks}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 w-full text-left cursor-pointer"
        >
          <span className="text-text-tertiary text-xs" aria-hidden="true">
            {collapsed.tasks ? '\u25B6' : '\u25BC'}
          </span>
          Task Patterns
        </button>
        {!collapsed.tasks && <ProjectTaskPatterns projectId={id} />}
      </section>

      {/* Task tracker credentials */}
      <section className="mb-6">
        <button
          onClick={() => setCollapsed((c) => ({ ...c, creds: !c.creds }))}
          aria-expanded={!collapsed.creds}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 w-full text-left cursor-pointer"
        >
          <span className="text-text-tertiary text-xs" aria-hidden="true">
            {collapsed.creds ? '\u25B6' : '\u25BC'}
          </span>
          Task Tracker Credentials
        </button>
        {!collapsed.creds && <ProjectTaskTrackerCredentials projectId={id} />}
      </section>

      {/* Recent code changes */}
      <section>
        <button
          onClick={() => setCollapsed((c) => ({ ...c, changes: !c.changes }))}
          aria-expanded={!collapsed.changes}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 w-full text-left cursor-pointer"
        >
          <span className="text-text-tertiary text-xs" aria-hidden="true">
            {collapsed.changes ? '\u25B6' : '\u25BC'}
          </span>
          Recent Code Changes
        </button>
        {collapsed.changes ? null : recentChanges.isLoading ? (
          <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
        ) : (recentChanges.data?.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-tertiary">No code changes found for this project.</p>
        ) : (
          <div className="space-y-2">
            {recentChanges.data!.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm"
              >
                <div>
                  <span className="text-sm text-text-primary">{item.title}</span>
                  <div className="flex gap-2 mt-0.5 text-xs text-text-tertiary">
                    {item.authorMemberId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: '/members/$id', params: { id: item.authorMemberId! } });
                        }}
                        className="text-accent-text hover:text-accent-hover"
                      >
                        {item.authorName ?? item.authorRaw}
                      </button>
                    ) : (
                      <span>{item.authorName ?? item.authorRaw}</span>
                    )}
                    <span>{format(new Date(item.authoredAt), 'MMM d')}</span>
                    {item.branch && (
                      <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                        {item.branch}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">
                    +{item.linesAdded} -{item.linesDeleted}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.status === 'pending'
                        ? 'bg-warning/20 text-warning'
                        : item.status === 'reviewed'
                          ? 'bg-success/20 text-success'
                          : item.status === 'flagged'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-surface-overlay text-text-tertiary'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function ProjectEditForm({
  project,
  onDone,
}: {
  project: { id: string; name: string; description: string | null };
  onDone: () => void;
}) {
  const updateProject = useUpdateProject();
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description ?? '');
  const isDirty = editName !== project.name || editDesc !== (project.description ?? '');

  function handleSave() {
    if (!editName.trim()) return;
    updateProject.mutate(
      { id: project.id, name: editName.trim(), description: editDesc.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Project updated');
          onDone();
        },
        onError: (err) => toast.error(`Failed to update: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div className="mb-6 bg-surface-raised border border-border rounded-sm p-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Project name"
          className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isDirty) handleSave();
          }}
        />
        <input
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isDirty) handleSave();
          }}
        />
        <button
          onClick={handleSave}
          disabled={!editName.trim() || !isDirty || updateProject.isPending}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RepoRow({
  repo,
  scanState,
  syncState,
  onDeleted,
}: {
  repo: import('@twle/vantage-shared').Repository;
  scanState?: import('@twle/vantage-shared').ScanState;
  syncState?: import('@twle/vantage-shared').SyncState;
  onDeleted: () => void;
}) {
  const deleteRepo = useDeleteRepository();
  const scanRepos = useScanRepos();
  const syncReposHook = useSyncRepos();

  const isLocal = repo.type === 'local';
  const lastTime = isLocal ? scanState?.lastScannedAt : syncState?.lastSyncedAt;
  const repoError = isLocal ? scanState?.errorMessage : syncState?.errorMessage;
  const isSyncing = isLocal ? scanRepos.isPending : syncReposHook.isPending;

  return (
    <div className="px-3 py-1.5 bg-surface-raised border border-border-subtle rounded text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-tertiary shrink-0">
            {repo.type}
          </span>
          <span className="text-text-secondary truncate">
            {repo.localPath ?? `${repo.apiOwner}/${repo.apiRepo}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={() => {
              const mutation = isLocal ? scanRepos : syncReposHook;
              mutation.mutate(
                { repoId: repo.id },
                {
                  onSuccess: () => toast.success('Sync complete'),
                  onError: (err) => toast.error(`Sync failed: ${errorMessage(err)}`),
                },
              );
            }}
            disabled={isSyncing}
            className="text-xs text-accent-text hover:text-accent-hover disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : '\u21BB Sync'}
          </button>
          <button
            onClick={() =>
              deleteRepo.mutate(repo.id, {
                onSuccess: () => {
                  toast.success('Repository removed');
                  onDeleted();
                },
                onError: (err) => toast.error(`Failed to remove: ${errorMessage(err)}`),
              })
            }
            className="text-xs text-danger hover:text-danger/80"
          >
            Remove
          </button>
        </div>
      </div>
      {(lastTime || repoError) && (
        <div className="mt-0.5 text-xs text-text-tertiary ml-[calc(1.5rem+0.75rem)]">
          {lastTime && (
            <span>Last synced: {formatDistanceToNow(new Date(lastTime), { addSuffix: true })}</span>
          )}
          {repoError && (
            <span className="text-danger ml-2">
              {'\u26A0'} {repoError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectSyncFooter({
  projectId,
  repos,
  scanStatusData,
  syncStatusData,
  syncAll,
  sinceDate,
  setSinceDate,
}: {
  projectId: string;
  repos: import('@twle/vantage-shared').Repository[];
  scanStatusData?: import('@twle/vantage-shared').ScanState[];
  syncStatusData?: import('@twle/vantage-shared').SyncState[];
  syncAll: ReturnType<typeof useSyncAll>;
  sinceDate: string;
  setSinceDate: (v: string) => void;
}) {
  const hasNeverSynced = repos.some((repo) => {
    if (repo.type === 'local')
      return !(scanStatusData ?? []).find((s) => s.repoId === repo.id)?.lastScannedAt;
    return !(syncStatusData ?? []).find((s) => s.repoId === repo.id)?.lastSyncedAt;
  });

  return (
    <div className="flex items-center gap-2 mt-2 mb-3">
      <button
        onClick={() =>
          syncAll.mutate(
            { projectId, ...(sinceDate ? { since: sinceDate } : {}) },
            {
              onSuccess: () => toast.success('Project sync complete'),
              onError: (err) => toast.error(`Sync failed: ${errorMessage(err)}`),
            },
          )
        }
        disabled={syncAll.isPending}
        className="px-3 py-1.5 bg-surface-raised border border-border text-text-secondary text-xs rounded-full hover:bg-surface-overlay disabled:opacity-50 transition-colors"
      >
        {syncAll.isPending ? 'Syncing...' : 'Sync All Project Repos'}
      </button>
      {hasNeverSynced && (
        <input
          type="date"
          value={sinceDate}
          onChange={(e) => setSinceDate(e.target.value)}
          className="px-2 py-1 bg-surface border border-border rounded text-xs text-text-secondary outline-none focus:border-accent"
          title="Only fetch changes since this date (first scan only)"
        />
      )}
    </div>
  );
}

function ProjectRepositories({ projectId }: { projectId: string }) {
  const repos = useProjectRepositories(projectId);
  const createRepo = useCreateRepository();
  const [repoType, setRepoType] = useState<'local' | 'github' | 'gitlab'>('local');
  const [localPath, setLocalPath] = useState('');
  const syncAll = useSyncAll();
  const scanStatus = useScanStatus(true);
  const syncStatus = useSyncStatus(true);
  const [sinceDate, setSinceDate] = useState('');

  function handleAdd() {
    if (repoType === 'local' && !localPath.trim()) return;
    createRepo.mutate(
      { projectId, type: repoType, localPath: repoType === 'local' ? localPath.trim() : undefined },
      {
        onSuccess: () => {
          toast.success('Repository added');
          setLocalPath('');
          repos.refetch();
        },
        onError: (err) => toast.error(`Failed to add repository: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div>
      {/* Existing repos */}
      {repos.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : repos.data && repos.data.length > 0 ? (
        <>
          <div className="space-y-1 mb-3">
            {repos.data.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                scanState={(scanStatus.data ?? []).find((s) => s.repoId === repo.id)}
                syncState={(syncStatus.data ?? []).find((s) => s.repoId === repo.id)}
                onDeleted={() => repos.refetch()}
              />
            ))}
          </div>
          <ProjectSyncFooter
            projectId={projectId}
            repos={repos.data}
            scanStatusData={scanStatus.data}
            syncStatusData={syncStatus.data}
            syncAll={syncAll}
            sinceDate={sinceDate}
            setSinceDate={setSinceDate}
          />
        </>
      ) : (
        <p className="text-xs text-text-tertiary mb-2">No repositories connected.</p>
      )}

      {/* Add repo form */}
      <div className="flex flex-wrap gap-2 items-end">
        <select
          value={repoType}
          onChange={(e) => setRepoType(e.target.value as 'local' | 'github' | 'gitlab')}
          className="px-2 py-1.5 bg-surface border border-border rounded text-sm text-text-secondary"
        >
          <option value="local">Local</option>
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
        </select>
        {repoType === 'local' && (
          <input
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="Local path (e.g. /home/user/repos/my-project)"
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent min-w-[200px]"
          />
        )}
        <button
          onClick={handleAdd}
          disabled={createRepo.isPending || (repoType === 'local' && !localPath.trim())}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProjectAssignments({
  projectId,
  memberMap,
  members,
}: {
  projectId: string;
  memberMap: Map<string, string>;
  members: Array<{ id: string; name: string; status?: string }>;
}) {
  const assignments = useProjectAssignments(projectId);
  const createAssignment = useCreateAssignment();
  const endAssignment = useEndAssignment();
  const deleteAssignment = useDeleteAssignment();
  const navigate = useNavigate();
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [role, setRole] = useState('');

  const assignedMemberIds = new Set(
    (assignments.data ?? []).filter((a) => !a.endDate).map((a) => a.memberId),
  );
  const availableMembers = members.filter((m) => !assignedMemberIds.has(m.id));
  const activeAssignments = (assignments.data ?? []).filter((a) => !a.endDate);

  function handleAssign() {
    if (!selectedMemberId) return;
    createAssignment.mutate(
      {
        memberId: selectedMemberId,
        projectId,
        role: role.trim() || undefined,
        startDate: new Date().toISOString().split('T')[0],
      },
      {
        onSuccess: () => {
          toast.success('Member assigned');
          setSelectedMemberId('');
          setRole('');
          assignments.refetch();
        },
        onError: (err) => toast.error(`Failed to assign member: ${errorMessage(err)}`),
      },
    );
  }

  function handleEnd(assignmentId: string) {
    endAssignment.mutate(
      { id: assignmentId, endDate: new Date().toISOString().split('T')[0] },
      {
        onSuccess: () => {
          toast.success('Assignment ended');
          assignments.refetch();
        },
        onError: (err) => toast.error(`Failed to end assignment: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div>
      {/* Current assignments */}
      {assignments.isLoading ? (
        <div className="h-16 bg-surface-raised border border-border rounded animate-pulse mb-3" />
      ) : activeAssignments.length > 0 ? (
        <div className="space-y-2 mb-3">
          {activeAssignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-semibold">
                  {(memberMap.get(a.memberId) ?? '?').charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={() => navigate({ to: '/members/$id', params: { id: a.memberId } })}
                  className="text-sm text-accent-text hover:text-accent-hover"
                >
                  {memberMap.get(a.memberId) ?? a.memberId}
                </button>
                {a.role && (
                  <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                    {a.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-tertiary">
                  {format(new Date(a.startDate), 'MMM d, yyyy')}
                </span>
                <button
                  onClick={() => handleEnd(a.id)}
                  className="text-xs text-text-tertiary hover:text-warning"
                  title="End assignment (keep history)"
                >
                  End
                </button>
                <button
                  onClick={() => {
                    if (!confirm('Delete this assignment permanently?')) return;
                    deleteAssignment.mutate(a.id, {
                      onSuccess: () => {
                        toast.success('Assignment deleted');
                        assignments.refetch();
                      },
                      onError: (err) => toast.error(`Failed to delete: ${errorMessage(err)}`),
                    });
                  }}
                  className="text-xs text-danger hover:text-danger/80"
                  title="Delete assignment permanently"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary mb-3">
          No team members assigned yet. Use the form below to assign members.
        </p>
      )}

      {/* Assign new member */}
      <div className="flex flex-wrap gap-2">
        <SearchableSelect
          options={availableMembers.map((m) => ({ value: m.id, label: m.name }))}
          value={selectedMemberId}
          onChange={setSelectedMemberId}
          placeholder="Search members..."
          className="w-48"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (optional)"
          className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
        />
        <button
          onClick={handleAssign}
          disabled={!selectedMemberId || createAssignment.isPending}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Assign
        </button>
      </div>

      {availableMembers.length === 0 && activeAssignments.length > 0 && (
        <p className="text-xs text-text-tertiary mt-2">All members are assigned to this project.</p>
      )}
      {members.length === 0 && (
        <p className="text-xs text-text-tertiary mt-2">
          No members created yet.{' '}
          <button
            onClick={() => navigate({ to: '/members' })}
            className="text-accent-text hover:text-accent-hover"
          >
            Add members
          </button>{' '}
          first.
        </p>
      )}
    </div>
  );
}

function ProjectTaskPatterns({ projectId }: { projectId: string }) {
  const patterns = useProjectTaskPatterns(projectId);
  const createPattern = useCreateTaskPattern();
  const deletePattern = useDeleteTaskPattern();
  const [regex, setRegex] = useState('');
  const [urlTemplate, setUrlTemplate] = useState('');

  function handleAdd() {
    if (!regex.trim() || !urlTemplate.trim()) return;
    createPattern.mutate(
      { projectId, regex: regex.trim(), urlTemplate: urlTemplate.trim() },
      {
        onSuccess: () => {
          toast.success('Task pattern added');
          setRegex('');
          setUrlTemplate('');
          patterns.refetch();
        },
        onError: (err) => toast.error(`Failed to add pattern: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-2">
        Automatically link commit messages to Jira/ClickUp tickets. For example, the pattern{' '}
        <code className="text-xs text-accent bg-accent/10 px-1 rounded">(PROJ-\d+)</code> matches
        "PROJ-123" in commit messages and creates clickable links.
      </p>

      {/* Existing patterns */}
      {patterns.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : patterns.data && patterns.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {patterns.data.map((pat) => (
            <div
              key={pat.id}
              className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border border-border-subtle rounded text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <code className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
                  {pat.regex}
                </code>
                <span className="text-xs text-text-tertiary truncate">{pat.urlTemplate}</span>
              </div>
              <button
                onClick={() =>
                  deletePattern.mutate(pat.id, {
                    onSuccess: () => {
                      toast.success('Pattern removed');
                      patterns.refetch();
                    },
                    onError: (err) => toast.error(`Failed to remove: ${errorMessage(err)}`),
                  })
                }
                className="text-xs text-danger hover:text-danger/80 shrink-0 ml-2"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary mb-2">No task patterns configured.</p>
      )}

      {/* Add pattern form */}
      <div className="flex flex-wrap gap-2 items-end">
        <input
          value={regex}
          onChange={(e) => setRegex(e.target.value)}
          placeholder="Regex (e.g. (PROJ-\d+))"
          className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent font-mono min-w-[180px]"
        />
        <input
          value={urlTemplate}
          onChange={(e) => setUrlTemplate(e.target.value)}
          placeholder="URL template (e.g. https://jira.example.com/browse/{id})"
          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent min-w-[200px]"
        />
        <button
          onClick={handleAdd}
          disabled={!regex.trim() || !urlTemplate.trim() || createPattern.isPending}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProjectTaskTrackerCredentials({ projectId }: { projectId: string }) {
  const creds = useTaskTrackerCredentials(projectId);
  const createCred = useCreateTaskTrackerCredential();
  const updateCred = useUpdateTaskTrackerCredential();
  const deleteCred = useDeleteTaskTrackerCredential();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<'jira' | 'clickup'>('jira');
  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editToken, setEditToken] = useState('');
  const [editInstanceUrl, setEditInstanceUrl] = useState('');

  function handleAdd() {
    if (!name.trim() || !token.trim()) return;
    if (platform === 'jira' && !instanceUrl.trim()) return;
    createCred.mutate(
      {
        projectId,
        name: name.trim(),
        platform,
        token: token.trim(),
        instanceUrl: platform === 'jira' ? instanceUrl.trim() : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Task tracker credential added');
          setName('');
          setToken('');
          setInstanceUrl('');
          creds.refetch();
        },
        onError: (err) => toast.error(`Failed to add: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-2">
        Connect your issue tracker so Vantage can fetch ticket titles and statuses for task IDs
        found in commits.
      </p>

      {/* Existing credentials */}
      {creds.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : creds.data && creds.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {creds.data.map((c) => (
            <div
              key={c.id}
              className="bg-surface-raised border border-border-subtle rounded text-sm"
            >
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-tertiary shrink-0">
                    {c.platform}
                  </span>
                  <span className="text-text-secondary truncate">{c.name}</span>
                  {c.instanceUrl && (
                    <span className="text-xs text-text-tertiary truncate">{c.instanceUrl}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => {
                      setEditingId(editingId === c.id ? null : c.id);
                      setEditName(c.name);
                      setEditToken('');
                      setEditInstanceUrl(c.instanceUrl ?? '');
                    }}
                    className="text-xs text-accent-text hover:text-accent-hover"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() =>
                      deleteCred.mutate(c.id, {
                        onSuccess: () => {
                          toast.success('Credential removed');
                          creds.refetch();
                        },
                        onError: (err) => toast.error(`Failed to remove: ${errorMessage(err)}`),
                      })
                    }
                    className="text-xs text-danger hover:text-danger/80"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {editingId === c.id && (
                <div className="border-t border-border-subtle px-3 py-2">
                  <div className="space-y-2 max-w-md">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                    <input
                      type="password"
                      value={editToken}
                      onChange={(e) => setEditToken(e.target.value)}
                      placeholder="New token (leave empty to keep current)"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                    {c.platform === 'jira' && (
                      <input
                        value={editInstanceUrl}
                        onChange={(e) => setEditInstanceUrl(e.target.value)}
                        placeholder="Instance URL"
                        className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const data: {
                            id: string;
                            name?: string;
                            token?: string;
                            instanceUrl?: string;
                          } = { id: c.id };
                          if (editName.trim() && editName !== c.name) data.name = editName.trim();
                          if (editToken.trim()) data.token = editToken.trim();
                          if (
                            c.platform === 'jira' &&
                            editInstanceUrl.trim() !== (c.instanceUrl ?? '')
                          )
                            data.instanceUrl = editInstanceUrl.trim();
                          if (Object.keys(data).length <= 1) return;
                          updateCred.mutate(data, {
                            onSuccess: () => {
                              toast.success('Credential updated');
                              setEditingId(null);
                              creds.refetch();
                            },
                            onError: (err) => toast.error(`Failed to update: ${errorMessage(err)}`),
                          });
                        }}
                        className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-text-tertiary hover:text-text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary mb-2">No task tracker credentials configured.</p>
      )}

      {/* Add credential form */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Credential name"
            className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent min-w-[150px]"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as 'jira' | 'clickup')}
            className="px-2 py-1.5 bg-surface border border-border rounded text-sm text-text-secondary"
          >
            <option value="jira">Jira</option>
            <option value="clickup">ClickUp</option>
          </select>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API Token"
          className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent max-w-md"
        />
        {platform === 'jira' && (
          <input
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            placeholder="Instance URL (e.g. https://myteam.atlassian.net)"
            className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent max-w-md"
          />
        )}
        <button
          onClick={handleAdd}
          disabled={
            !name.trim() ||
            !token.trim() ||
            (platform === 'jira' && !instanceUrl.trim()) ||
            createCred.isPending
          }
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
