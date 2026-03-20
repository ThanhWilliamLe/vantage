import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useMember, useMemberAssignments, useCodeChanges, useEvaluations, useProjects, useCreateAssignment, useEndAssignment, useMemberIdentities, useAddIdentity, useRemoveIdentity } from '../../hooks/use-api.js';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

function MemberDrillDown() {
  const { id } = memberIdRoute.useParams();
  const navigate = useNavigate();
  const member = useMember(id);
  const assignments = useMemberAssignments(id);
  const pendingReviews = useCodeChanges({ memberId: id, status: 'pending' });
  const evaluations = useEvaluations({ memberId: id, limit: '10' });
  const projects = useProjects();

  const projectMap = new Map(projects.data?.map((p) => [p.id, p.name]) ?? []);

  if (member.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Member Detail</h1>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
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
        className="text-sm text-accent hover:text-accent-hover mb-4 inline-block"
      >
        &larr; Back to Members
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-semibold">
          {m.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{m.name}</h1>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              m.status === 'active' ? 'bg-success/20 text-success' : 'bg-surface-overlay text-text-tertiary'
            }`}
          >
            {m.status}
          </span>
        </div>
      </div>

      {/* Pending reviews */}
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
                className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg cursor-pointer hover:bg-surface-overlay transition-colors"
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

      {/* Identity mappings */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Identity Mappings
        </h2>
        <MemberIdentitySection memberId={id} />
      </section>

      {/* Project assignments */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Project Assignments
        </h2>
        <AssignToProjectForm memberId={id} projects={projects.data ?? []} onAssigned={() => assignments.refetch()} />
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
                onNavigate={() => navigate({ to: '/projects/$id', params: { id: a.projectId } })}
                onEnded={() => assignments.refetch()}
              />
            ))}
          </div>
        )}
      </section>

      {/* Evaluation history */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Evaluation History
        </h2>
        {evaluations.isLoading ? (
          <div className="h-16 bg-surface-raised border border-border rounded animate-pulse" />
        ) : (evaluations.data?.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-tertiary">
            No evaluations yet. Create one in{' '}
            <button onClick={() => navigate({ to: '/evaluations' })} className="text-accent hover:text-accent-hover">
              Evaluations
            </button>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {evaluations.data!.items.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg"
              >
                <div>
                  <span className="text-sm text-text-primary">{ev.description || 'No description'}</span>
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
    </div>
  );
}

function MemberIdentitySection({ memberId }: { memberId: string }) {
  const identities = useMemberIdentities(memberId);
  const addIdentity = useAddIdentity();
  const removeIdentity = useRemoveIdentity();
  const [platform, setPlatform] = useState<string>('github');
  const [value, setValue] = useState('');

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
        onError: () => toast.error('Failed to add identity'),
      },
    );
  }

  function handleRemove(identityId: string) {
    removeIdentity.mutate(identityId, {
      onSuccess: () => {
        toast.success('Identity removed');
        identities.refetch();
      },
      onError: () => toast.error('Failed to remove identity'),
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
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={platform === 'email' ? 'email@example.com' : 'username'}
          className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!value.trim() || addIdentity.isPending}
          className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Identity list */}
      {identities.isLoading ? (
        <div className="h-10 bg-surface-raised border border-border rounded animate-pulse" />
      ) : (identities.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">No identities mapped. Add GitHub, GitLab, or email mappings above.</p>
      ) : (
        <div className="space-y-2">
          {identities.data!.map((identity) => (
            <div
              key={identity.id}
              className="flex items-center justify-between px-4 py-2 bg-surface-raised border border-border rounded-lg"
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
        onError: () => toast.error('Failed to create assignment'),
      },
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-text-primary mb-3">Assign to Project</h3>
      <div className="flex flex-wrap gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-secondary"
        >
          <option value="">Select project...</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
          className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
  assignment: { id: string; projectId: string; role: string | null; startDate: string; endDate: string | null };
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
        onError: () => toast.error('Failed to end assignment'),
      },
    );
  }

  return (
    <div
      onClick={onNavigate}
      className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg cursor-pointer hover:bg-surface-overlay transition-colors"
    >
      <div>
        <span className="text-sm text-accent hover:text-accent-hover">{projectName}</span>
        {assignment.role && <span className="ml-2 text-xs text-text-tertiary">{assignment.role}</span>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-tertiary">
          {format(new Date(assignment.startDate), 'MMM d, yyyy')}
          {assignment.endDate ? ` - ${format(new Date(assignment.endDate), 'MMM d, yyyy')}` : ' - present'}
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

export const memberIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members/$id',
  component: MemberDrillDown,
});
