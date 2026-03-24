import { useNavigate, useParams } from '@tanstack/react-router';
import {
  useMember,
  useMemberAssignments,
  useCodeChanges,
  useProjects,
  useUnmappedAuthors,
} from '../../hooks/api/core.js';
import { useEvaluations } from '../../hooks/api/evaluations.js';
import {
  useCreateAssignment,
  useEndAssignment,
  useMemberIdentities,
  useAddIdentity,
  useRemoveIdentity,
  useUpdateMember,
  useDeleteMember,
} from '../../hooks/api/settings.js';
import { errorMessage } from '../../lib/api-client.js';
import { format } from 'date-fns/format';
import { useState } from 'react';
import { SearchableSelect } from '../../components/searchable-select.js';
import { toast } from 'sonner';

export function MemberDetail() {
  const { id } = useParams({ from: '/members/$id' });
  const navigate = useNavigate();
  const member = useMember(id);
  const assignments = useMemberAssignments(id);
  const pendingReviews = useCodeChanges({ memberId: id, status: 'pending' });
  const evaluations = useEvaluations({ memberId: id, limit: '10' });
  const projects = useProjects();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'commits' | 'evaluations'>('settings');

  const projectMap = new Map(projects.data?.map((p) => [p.id, p.name]) ?? []);

  if (member.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Member Detail</h1>
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

  if (member.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Member Detail</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load member. The member may not exist.
        </div>
      </div>
    );
  }

  const m = member.data;
  if (!m) return null;

  return (
    <div>
      <button
        onClick={() => navigate({ to: '/members' })}
        className="text-sm text-accent-text hover:text-accent-hover mb-4 inline-block"
      >
        &larr; Back to Members
      </button>

      {/* Header with actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-semibold">
            {m.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{m.name}</h1>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                m.status === 'active'
                  ? 'bg-success/20 text-success'
                  : 'bg-surface-overlay text-text-tertiary'
              }`}
            >
              {m.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(!editing);
              setEditName(m.name);
            }}
            className="text-sm text-accent-text hover:text-accent-hover"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          {m.status === 'active' ? (
            <button
              onClick={() => {
                if (confirm(`Deactivate "${m.name}"? They won't appear in assignment dropdowns.`))
                  updateMember.mutate(
                    { id: m.id, status: 'inactive' },
                    { onError: (err) => toast.error(`Failed: ${errorMessage(err)}`) },
                  );
              }}
              className="text-sm text-text-tertiary hover:text-danger"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() =>
                updateMember.mutate(
                  { id: m.id, status: 'active' },
                  { onError: (err) => toast.error(`Failed: ${errorMessage(err)}`) },
                )
              }
              className="text-sm text-text-tertiary hover:text-success"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Delete "${m.name}"? This removes their identities and assignments.`)) {
                deleteMember.mutate(m.id, {
                  onSuccess: () => {
                    toast.success('Member deleted');
                    navigate({ to: '/members' });
                  },
                  onError: (err) => toast.error(`Failed: ${errorMessage(err)}`),
                });
              }
            }}
            className="text-sm text-danger hover:text-danger/80"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mb-6 bg-surface-raised border border-border rounded-sm p-4">
          <div className="flex gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Member name"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editName.trim() && editName !== m.name) {
                  updateMember.mutate(
                    { id: m.id, name: editName.trim() },
                    {
                      onSuccess: () => {
                        toast.success('Member renamed');
                        setEditing(false);
                      },
                      onError: (err) => toast.error(`Failed to rename: ${errorMessage(err)}`),
                    },
                  );
                }
              }}
            />
            <button
              onClick={() => {
                if (editName.trim() && editName !== m.name) {
                  updateMember.mutate(
                    { id: m.id, name: editName.trim() },
                    {
                      onSuccess: () => {
                        toast.success('Member renamed');
                        setEditing(false);
                      },
                      onError: (err) => toast.error(`Failed to rename: ${errorMessage(err)}`),
                    },
                  );
                }
              }}
              disabled={!editName.trim() || editName === m.name || updateMember.isPending}
              className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-6">
        {(['settings', 'commits', 'evaluations'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent-text'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab === 'settings' ? 'Settings' : tab === 'commits' ? 'Commits' : 'Evaluations'}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <>
          {/* Aliases (internal — for identity matching) */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-1">
              Aliases
            </h2>
            <p className="text-xs text-text-tertiary mb-3">
              Comma-separated nicknames for identity matching (e.g., "Will, WL"). Not displayed
              publicly.
            </p>
            <AliasEditor memberId={m.id} currentAliases={m.aliases} />
          </section>

          {/* Identity mappings */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-1">
              Identity Mappings
            </h2>
            <p className="text-xs text-text-tertiary mb-3">
              Link this member's git usernames and emails so their commits are attributed correctly
              across platforms.
            </p>
            <MemberIdentitySection memberId={id} />
          </section>

          {/* Project assignments */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
              Project Assignments
            </h2>
            <AssignToProjectForm
              memberId={id}
              projects={projects.data ?? []}
              onAssigned={() => assignments.refetch()}
            />
            {assignments.isLoading ? (
              <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
            ) : (assignments.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-text-tertiary">No project assignments.</p>
            ) : (
              <div className="space-y-2">
                {assignments.data!.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    projectName={projectMap.get(a.projectId) ?? a.projectId}
                    onNavigate={() =>
                      navigate({ to: '/projects/$id', params: { id: a.projectId } })
                    }
                    onEnded={() => assignments.refetch()}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'commits' && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Pending Reviews ({pendingReviews.data?.total ?? 0})
          </h2>
          {pendingReviews.isLoading ? (
            <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
          ) : (pendingReviews.data?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-tertiary">No pending reviews for this member.</p>
          ) : (
            <div className="space-y-2">
              {pendingReviews.data!.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate({ to: '/reviews' })}
                  className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm cursor-pointer hover:bg-surface-overlay transition-colors"
                >
                  <div>
                    <span className="text-sm text-text-primary">{item.title}</span>
                    <span className="ml-2 text-xs text-text-tertiary">
                      {format(new Date(item.authoredAt), 'MMM d')}
                    </span>
                    {item.branch && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-secondary">
                        {item.branch}
                      </span>
                    )}
                  </div>
                  {item.aiRiskLevel && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        item.aiRiskLevel === 'high'
                          ? 'bg-danger/20 text-danger'
                          : item.aiRiskLevel === 'medium'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-success/20 text-success'
                      }`}
                    >
                      {item.aiRiskLevel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'evaluations' && (
        <section>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Evaluation History
          </h2>
          {evaluations.isLoading ? (
            <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
          ) : (evaluations.data?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-tertiary">
              No evaluations yet. Create one in{' '}
              <button
                onClick={() => navigate({ to: '/evaluations' })}
                className="text-accent-text hover:text-accent-hover"
              >
                Evaluations
              </button>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {evaluations.data!.items.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm"
                >
                  <div>
                    <span className="text-sm text-text-primary">
                      {ev.description || 'No description'}
                    </span>
                    <span className="ml-2 text-xs text-text-tertiary">{ev.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.workloadScore != null && (
                      <span className="text-xs text-text-secondary">Score: {ev.workloadScore}</span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary">
                      {ev.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function MemberIdentitySection({ memberId }: { memberId: string }) {
  const identities = useMemberIdentities(memberId);
  const addIdentity = useAddIdentity();
  const removeIdentity = useRemoveIdentity();
  const [platform, setPlatform] = useState<string>('github');
  const [value, setValue] = useState('');
  const unmappedAuthors = useUnmappedAuthors(platform);

  function handleAdd() {
    if (!value.trim()) return;
    addIdentity.mutate(
      { memberId, platform, value: value.trim() },
      {
        onSuccess: () => {
          toast.success('Identity added');
          setValue('');
          identities.refetch();
        },
        onError: (err) => toast.error(`Failed to add identity: ${errorMessage(err)}`),
      },
    );
  }

  function handleRemove(identityId: string) {
    removeIdentity.mutate(identityId, {
      onSuccess: () => {
        toast.success('Identity removed');
        identities.refetch();
      },
      onError: (err) => toast.error(`Failed to remove identity: ${errorMessage(err)}`),
    });
  }

  const platformLabels: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    email: 'Email',
  };

  return (
    <div>
      {/* Add identity form */}
      <div className="flex gap-2 mb-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-secondary"
        >
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
          <option value="email">Email</option>
        </select>
        <div className="flex-1">
          <SearchableSelect
            options={[
              ...(unmappedAuthors.data?.map((a) => ({
                value: a.value,
                label: `${a.value} (${a.commitCount} commits)`,
              })) ?? []),
            ]}
            value={value}
            onChange={setValue}
            placeholder={platform === 'email' ? 'email@example.com' : 'username'}
            className="w-full"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!value.trim() || addIdentity.isPending}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Identity list */}
      {identities.isLoading ? (
        <div className="h-10 bg-surface-raised border border-border rounded animate-pulse" />
      ) : (identities.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No identities mapped. Add GitHub, GitLab, or email mappings above.
        </p>
      ) : (
        <div className="space-y-2">
          {identities.data!.map((identity) => (
            <div
              key={identity.id}
              className="flex items-center justify-between px-4 py-2 bg-surface-raised border border-border rounded-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary font-medium">
                  {platformLabels[identity.platform] ?? identity.platform}
                </span>
                <span className="text-sm text-text-primary">{identity.value}</span>
              </div>
              <button
                onClick={() => handleRemove(identity.id)}
                disabled={removeIdentity.isPending}
                className="text-xs text-text-tertiary hover:text-danger disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignToProjectForm({
  memberId,
  projects,
  onAssigned,
}: {
  memberId: string;
  projects: Array<{ id: string; name: string; status?: string }>;
  onAssigned: () => void;
}) {
  const createAssignment = useCreateAssignment();
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [role, setRole] = useState('');

  const activeProjects = projects.filter((p) => p.status === 'active');

  function handleAssign() {
    if (!projectId || !startDate) return;
    createAssignment.mutate(
      { memberId, projectId, startDate, role: role.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Assignment created');
          setProjectId('');
          setRole('');
          onAssigned();
        },
        onError: (err) => toast.error(`Failed to assign: ${errorMessage(err)}`),
      },
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
      <h3 className="text-sm font-medium text-text-primary mb-3">Assign to Project</h3>
      <div className="flex flex-wrap gap-2">
        <SearchableSelect
          options={activeProjects.map((p) => ({ value: p.id, label: p.name }))}
          value={projectId}
          onChange={setProjectId}
          placeholder="Search projects..."
          className="w-48"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (optional)"
          className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
        />
        <button
          onClick={handleAssign}
          disabled={!projectId || !startDate || createAssignment.isPending}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Assign
        </button>
      </div>
    </div>
  );
}

function AssignmentRow({
  assignment,
  projectName,
  onNavigate,
  onEnded,
}: {
  assignment: {
    id: string;
    projectId: string;
    role: string | null;
    startDate: string;
    endDate: string | null;
  };
  projectName: string;
  onNavigate: () => void;
  onEnded: () => void;
}) {
  const endAssignment = useEndAssignment();
  const isActive = !assignment.endDate;

  function handleEnd(e: React.MouseEvent) {
    e.stopPropagation();
    const today = new Date().toISOString().slice(0, 10);
    endAssignment.mutate(
      { id: assignment.id, endDate: today },
      {
        onSuccess: () => {
          toast.success('Assignment ended');
          onEnded();
        },
      },
    );
  }

  return (
    <div
      onClick={onNavigate}
      className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm cursor-pointer hover:bg-surface-overlay transition-colors"
    >
      <div>
        <span className="text-sm text-accent-text hover:text-accent-hover">{projectName}</span>
        {assignment.role && (
          <span className="ml-2 text-xs text-text-tertiary">{assignment.role}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-tertiary">
          {format(new Date(assignment.startDate), 'MMM d, yyyy')}
          {assignment.endDate
            ? ` - ${format(new Date(assignment.endDate), 'MMM d, yyyy')}`
            : ' - present'}
        </span>
        {isActive && (
          <button
            onClick={handleEnd}
            disabled={endAssignment.isPending}
            className="text-xs text-text-tertiary hover:text-danger disabled:opacity-50"
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}

function AliasEditor({
  memberId,
  currentAliases,
}: {
  memberId: string;
  currentAliases: string | null;
}) {
  const updateMember = useUpdateMember();
  const [aliases, setAliases] = useState(currentAliases ?? '');

  function handleSave() {
    updateMember.mutate(
      { id: memberId, aliases: aliases.trim() || '' },
      { onSuccess: () => toast.success('Aliases updated') },
    );
  }

  return (
    <div className="flex gap-2">
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="e.g., Will, WL, william.le"
        className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
        }}
      />
      <button
        onClick={handleSave}
        disabled={updateMember.isPending}
        className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        Save
      </button>
    </div>
  );
}
