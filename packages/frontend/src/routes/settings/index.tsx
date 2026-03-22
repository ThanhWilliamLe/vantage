import { useState, useRef } from 'react';
import { useProjects, useMembers } from '../../hooks/api/core.js';
import { apiClient } from '../../lib/api-client.js';
import {
  useCreateProject,
  useUpdateProject,
  useProjectRepositories,
  useCreateRepository,
  useDeleteRepository,
  useProjectTaskPatterns,
  useCreateTaskPattern,
  useDeleteTaskPattern,
  useCreateMember,
  useUpdateMember,
  useMemberIdentities,
  useAddIdentity,
  useRemoveIdentity,
  useCredentials,
  useCreateCredential,
  useTestCredential,
  useDeleteCredential,
  useAIProviders,
  useCreateAIProvider,
  useActivateAIProvider,
  useDeleteAIProvider,
  useSetPassword,
  useRemovePassword,
} from '../../hooks/api/settings.js';
import { toast } from 'sonner';

type Section = 'projects' | 'members' | 'credentials' | 'ai' | 'password' | 'data';

const validSections: Section[] = ['projects', 'members', 'credentials', 'ai', 'password', 'data'];

export function Settings() {
  const [section, setSection] = useState<Section>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab && validSections.includes(tab as Section) ? (tab as Section) : 'projects';
  });

  const sections: { key: Section; label: string }[] = [
    { key: 'projects', label: 'Projects' },
    { key: 'members', label: 'Members' },
    { key: 'credentials', label: 'Credentials' },
    { key: 'ai', label: 'AI Provider' },
    { key: 'password', label: 'Access Password' },
    { key: 'data', label: 'Data Management' },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-4">
        Application configuration, projects, members, credentials, and AI settings
      </p>

      <div className="flex gap-6">
        {/* Section nav */}
        <nav className="w-40 shrink-0">
          <ul className="space-y-1">
            {sections.map((s) => (
              <li key={s.key}>
                <button
                  onClick={() => setSection(s.key)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    section === s.key
                      ? 'bg-surface-raised text-accent-text'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === 'projects' && <ProjectsSection />}
          {section === 'members' && <MembersSection />}
          {section === 'credentials' && <CredentialsSection />}
          {section === 'ai' && <AIProviderSection />}
          {section === 'password' && <PasswordSection />}
          {section === 'data' && <DataManagementSection />}
        </div>
      </div>
    </div>
  );
}

function ProjectsSection() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), description: desc.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Project created');
          setName('');
          setDesc('');
        },
        onError: () => toast.error('Failed to create project'),
      },
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        Projects
      </h2>

      {/* Create form */}
      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">Create Project</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createProject.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      {/* List */}
      {projects.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-12 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No projects yet. Create your first project above.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.data!.map((project) => (
            <div key={project.id} className="bg-surface-raised border border-border rounded-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
                    className="text-text-tertiary hover:text-text-secondary text-xs shrink-0"
                    aria-expanded={expandedId === project.id}
                    aria-label={expandedId === project.id ? 'Collapse project' : 'Expand project'}
                  >
                    {expandedId === project.id ? '\u25BC' : '\u25B6'}
                  </button>
                  <span className="text-sm text-text-primary font-medium truncate">
                    {project.name}
                  </span>
                  {project.description && (
                    <span className="text-xs text-text-tertiary truncate">
                      {project.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      project.status === 'active'
                        ? 'bg-success/20 text-success'
                        : 'bg-surface-overlay text-text-tertiary'
                    }`}
                  >
                    {project.status}
                  </span>
                  {project.status === 'active' ? (
                    <button
                      onClick={() => updateProject.mutate({ id: project.id, status: 'archived' })}
                      className="text-xs text-text-tertiary hover:text-danger"
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      onClick={() => updateProject.mutate({ id: project.id, status: 'active' })}
                      className="text-xs text-text-tertiary hover:text-success"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>

              {expandedId === project.id && (
                <div className="border-t border-border px-4 py-4 space-y-5">
                  <ProjectEditForm project={project} />
                  <ProjectRepositories projectId={project.id} />
                  <ProjectTaskPatterns projectId={project.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectEditForm({
  project,
}: {
  project: { id: string; name: string; description: string | null };
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
        onSuccess: () => toast.success('Project updated'),
        onError: () => toast.error('Failed to update project'),
      },
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        Edit Project
      </h4>
      <div className="flex flex-wrap gap-2">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Project name"
          className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
        />
        <input
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
        />
        <button
          onClick={handleSave}
          disabled={!editName.trim() || !isDirty || updateProject.isPending}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ProjectRepositories({ projectId }: { projectId: string }) {
  const repos = useProjectRepositories(projectId);
  const createRepo = useCreateRepository();
  const deleteRepo = useDeleteRepository();
  const [repoType, setRepoType] = useState<'local' | 'github' | 'gitlab'>('local');
  const [localPath, setLocalPath] = useState('');

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
        onError: () => toast.error('Failed to add repository'),
      },
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        Repositories
      </h4>

      {/* Existing repos */}
      {repos.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : repos.data && repos.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {repos.data.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between px-3 py-1.5 bg-surface border border-border-subtle rounded text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-tertiary shrink-0">
                  {repo.type}
                </span>
                <span className="text-text-secondary truncate">
                  {repo.localPath ?? `${repo.apiOwner}/${repo.apiRepo}`}
                </span>
              </div>
              <button
                onClick={() =>
                  deleteRepo.mutate(repo.id, {
                    onSuccess: () => {
                      toast.success('Repository removed');
                      repos.refetch();
                    },
                    onError: () => toast.error('Failed to remove repository'),
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
        onError: () => toast.error('Failed to add task pattern. Check your regex syntax.'),
      },
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        Task Patterns
      </h4>
      <p className="text-xs text-text-tertiary mb-2">
        Define regex patterns to detect task IDs in commit messages. Use a capture group for the ID
        portion.
      </p>

      {/* Existing patterns */}
      {patterns.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : patterns.data && patterns.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {patterns.data.map((pat) => (
            <div
              key={pat.id}
              className="flex items-center justify-between px-3 py-1.5 bg-surface border border-border-subtle rounded text-sm"
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
                    onError: () => toast.error('Failed to remove pattern'),
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

function MembersSection() {
  const members = useMembers();
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const [name, setName] = useState('');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    createMember.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          toast.success('Member created');
          setName('');
        },
        onError: () => toast.error('Failed to create member'),
      },
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        Members
      </h2>

      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">Add Member</h3>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Member name"
            className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createMember.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {members.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-12 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      ) : (members.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No members yet. Add your first team member above.
        </p>
      ) : (
        <div className="space-y-2">
          {members.data!.map((member) => (
            <div key={member.id}>
              <div
                className={`flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm cursor-pointer hover:bg-surface-overlay transition-colors ${
                  expandedMemberId === member.id ? 'rounded-b-none border-b-0' : ''
                }`}
                onClick={() =>
                  setExpandedMemberId(expandedMemberId === member.id ? null : member.id)
                }
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-3 h-3 text-text-tertiary transition-transform ${expandedMemberId === member.id ? 'rotate-90' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-text-primary font-medium">{member.name}</span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      member.status === 'active'
                        ? 'bg-success/20 text-success'
                        : 'bg-surface-overlay text-text-tertiary'
                    }`}
                  >
                    {member.status}
                  </span>
                  {member.status === 'active' ? (
                    <button
                      onClick={() => updateMember.mutate({ id: member.id, status: 'inactive' })}
                      className="text-xs text-text-tertiary hover:text-danger"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => updateMember.mutate({ id: member.id, status: 'active' })}
                      className="text-xs text-text-tertiary hover:text-success"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {expandedMemberId === member.id && <MemberIdentityPanel memberId={member.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberIdentityPanel({ memberId }: { memberId: string }) {
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
    <div className="px-4 py-3 bg-surface-raised border border-border rounded-b-sm">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        Identity Mappings
      </h4>

      {/* Add identity form */}
      <div className="flex gap-2 mb-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="px-2 py-1.5 bg-surface border border-border rounded text-xs text-text-secondary"
        >
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
          <option value="email">Email</option>
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={platform === 'email' ? 'email@example.com' : 'username'}
          className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!value.trim() || addIdentity.isPending}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Identity list */}
      {identities.isLoading ? (
        <div className="h-6 bg-surface border border-border rounded animate-pulse" />
      ) : (identities.data?.length ?? 0) === 0 ? (
        <p className="text-xs text-text-tertiary">
          No identities mapped. Add GitHub, GitLab, or email mappings above.
        </p>
      ) : (
        <div className="space-y-1">
          {identities.data!.map((identity) => (
            <div
              key={identity.id}
              className="flex items-center justify-between px-3 py-1.5 bg-surface border border-border rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary font-medium">
                  {platformLabels[identity.platform] ?? identity.platform}
                </span>
                <span className="text-xs text-text-primary">{identity.value}</span>
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

function CredentialsSection() {
  const credentials = useCredentials();
  const createCred = useCreateCredential();
  const testCred = useTestCredential();
  const deleteCred = useDeleteCredential();
  const [credName, setCredName] = useState('');
  const [platform, setPlatform] = useState('github');
  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function handleCreate() {
    if (!credName.trim() || !token.trim()) return;
    createCred.mutate(
      {
        name: credName.trim(),
        platform,
        token: token.trim(),
        instanceUrl: instanceUrl.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Credential created');
          setCredName('');
          setToken('');
          setInstanceUrl('');
        },
        onError: () => toast.error('Failed to create credential'),
      },
    );
  }

  function handleTest(id: string) {
    testCred.mutate(id, {
      onSuccess: (data) => {
        setTestResult((prev) => ({ ...prev, [id]: data.message }));
        toast.success('Test passed');
      },
      onError: () => {
        setTestResult((prev) => ({ ...prev, [id]: 'Test failed' }));
        toast.error('Test failed');
      },
    });
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        Git Credentials
      </h2>

      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">Add Credential</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder="Name"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-secondary"
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="API Token"
            className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          {platform === 'gitlab' && (
            <input
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              placeholder="Instance URL (e.g. https://gitlab.example.com)"
              className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
          )}
          <button
            onClick={handleCreate}
            disabled={!credName.trim() || !token.trim() || createCred.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Add Credential
          </button>
        </div>
      </div>

      {credentials.isLoading ? (
        <div className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
      ) : (credentials.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No credentials stored. Add credentials to enable GitHub/GitLab API integration.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.data!.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm"
            >
              <div>
                <span className="text-sm text-text-primary font-medium">{cred.name}</span>
                <span className="ml-2 text-xs text-text-tertiary">{cred.platform}</span>
                {cred.instanceUrl && (
                  <span className="ml-2 text-xs text-text-tertiary">{cred.instanceUrl}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {testResult[cred.id] && (
                  <span className="text-xs text-text-secondary">{testResult[cred.id]}</span>
                )}
                <button
                  onClick={() => handleTest(cred.id)}
                  disabled={testCred.isPending}
                  className="text-xs text-accent-text hover:text-accent-hover"
                >
                  Test
                </button>
                <button
                  onClick={() => {
                    deleteCred.mutate(cred.id, {
                      onSuccess: () => toast.success('Credential deleted'),
                    });
                  }}
                  className="text-xs text-danger hover:text-danger/80"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIProviderSection() {
  const providers = useAIProviders();
  const createProvider = useCreateAIProvider();
  const activateProvider = useActivateAIProvider();
  const deleteProvider = useDeleteAIProvider();
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState('api');
  const [preset, setPreset] = useState('openai');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [cliCommand, setCliCommand] = useState('');

  function handleCreate() {
    if (!provName.trim()) return;
    createProvider.mutate(
      {
        name: provName.trim(),
        type: provType,
        preset: provType === 'api' ? preset : undefined,
        endpointUrl: provType === 'api' ? endpointUrl.trim() || undefined : undefined,
        apiKey: provType === 'api' ? apiKey.trim() || undefined : undefined,
        model: provType === 'api' ? model.trim() || undefined : undefined,
        cliCommand: provType === 'cli' ? cliCommand.trim() || undefined : undefined,
      },
      {
        onSuccess: () => {
          toast.success('AI provider created');
          setProvName('');
          setEndpointUrl('');
          setApiKey('');
          setModel('');
          setCliCommand('');
        },
        onError: () => toast.error('Failed to create provider'),
      },
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        AI Provider
      </h2>

      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">Add Provider</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={provName}
              onChange={(e) => setProvName(e.target.value)}
              placeholder="Provider name"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <select
              value={provType}
              onChange={(e) => setProvType(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded text-sm text-text-secondary"
            >
              <option value="api">API</option>
              <option value="cli">CLI</option>
            </select>
          </div>
          {provType === 'api' && (
            <>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-secondary"
              >
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">Custom</option>
              </select>
              <input
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="Endpoint URL"
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              />
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model name"
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              />
            </>
          )}
          {provType === 'cli' && (
            <input
              value={cliCommand}
              onChange={(e) => setCliCommand(e.target.value)}
              placeholder="CLI command (e.g., claude)"
              className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
          )}
          <button
            onClick={handleCreate}
            disabled={!provName.trim() || createProvider.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Add Provider
          </button>
        </div>
      </div>

      {providers.isLoading ? (
        <div className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
      ) : (providers.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No AI providers configured. Add one to enable AI-powered summaries, risk scoring, and deep
          analysis.
        </p>
      ) : (
        <div className="space-y-2">
          {providers.data!.map((prov) => (
            <div
              key={prov.id}
              className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-sm"
            >
              <div>
                <span className="text-sm text-text-primary font-medium">{prov.name}</span>
                <span className="ml-2 text-xs text-text-tertiary">{prov.type}</span>
                {prov.model && (
                  <span className="ml-2 text-xs text-text-tertiary">{prov.model}</span>
                )}
                {prov.isActive && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-success/20 text-success rounded">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!prov.isActive && (
                  <button
                    onClick={() => activateProvider.mutate(prov.id)}
                    className="text-xs text-accent-text hover:text-accent-hover"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => {
                    deleteProvider.mutate(prov.id, {
                      onSuccess: () => toast.success('Provider deleted'),
                    });
                  }}
                  className="text-xs text-danger hover:text-danger/80"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PasswordSection() {
  const setPasswordMut = useSetPassword();
  const removePasswordMut = useRemovePassword();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handleSetPassword() {
    if (password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setPasswordMut.mutate(password, {
      onSuccess: () => {
        toast.success('Password set');
        setPassword('');
        setConfirmPassword('');
      },
      onError: () => toast.error('Failed to set password'),
    });
  }

  function handleRemovePassword() {
    removePasswordMut.mutate(undefined, {
      onSuccess: () => toast.success('Password removed'),
      onError: () => toast.error('Failed to remove password'),
    });
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        Access Password
      </h2>
      <p className="text-sm text-text-secondary mb-4">
        Optionally protect Vantage with an access password. Without a password, anyone on the local
        network can access the UI.
      </p>

      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Set / Change Password</h3>
        <div className="space-y-2 max-w-sm">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 4 chars)"
            className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          <button
            onClick={handleSetPassword}
            disabled={
              password.length < 4 || password !== confirmPassword || setPasswordMut.isPending
            }
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Set Password
          </button>
        </div>
      </div>

      <button
        onClick={handleRemovePassword}
        disabled={removePasswordMut.isPending}
        className="text-sm text-danger hover:text-danger/80 disabled:opacity-50"
      >
        Remove Password (allow unauthenticated access)
      </button>
    </div>
  );
}

// ── Data Management (v1.1 — M13/M14) ──────────────────────

interface ValidationResult {
  compatible: boolean;
  requiresMigration: boolean;
  entityCounts: Record<string, number>;
  duplicateCounts?: Record<string, number>;
  errors: string[];
}

interface RestoreResult {
  mode: string;
  inserted: number;
  skipped: number;
  errors: string[];
}

function DataManagementSection() {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<unknown>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [confirmText, setConfirmText] = useState('');
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vantage-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Failed to create backup');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileSelect(file: File) {
    setRestoreFile(file);
    setRestoreResult(null);
    setConfirmText('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setRestoreData(data);

      // Validate
      const result = await apiClient.post<ValidationResult>('/api/backup/validate', {
        backup: data,
        mode: restoreMode,
      });
      setValidation(result);
    } catch {
      setValidation({
        compatible: false,
        requiresMigration: false,
        entityCounts: {},
        errors: ['Invalid backup file — could not parse JSON'],
      });
    }
  }

  async function handleRestore() {
    if (!restoreData) return;
    if (restoreMode === 'replace' && confirmText !== 'REPLACE') return;
    setIsRestoring(true);
    try {
      const result = await apiClient.post<RestoreResult>('/api/backup/restore', {
        backup: restoreData,
        mode: restoreMode,
      });
      setRestoreResult(result);
      if (result.errors.length === 0) {
        toast.success(`Restore complete: ${result.inserted} entities imported`);
      } else {
        toast.error(`Restore completed with ${result.errors.length} errors`);
      }
    } catch {
      toast.error('Restore failed');
    } finally {
      setIsRestoring(false);
    }
  }

  function resetRestore() {
    setRestoreFile(null);
    setRestoreData(null);
    setValidation(null);
    setRestoreResult(null);
    setConfirmText('');
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-2">
        Data Management
      </h2>
      <p className="text-sm text-text-secondary mb-6">
        Back up your data, restore from backups, or import historical evaluations.
      </p>

      {/* Full Backup */}
      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-text-primary mb-1">Full Backup</h3>
        <p className="text-xs text-text-secondary mb-3">
          Export all Vantage data to a portable JSON file. Excludes API tokens and credentials.
        </p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {isExporting ? 'Exporting...' : 'Create Backup'}
        </button>
      </div>

      {/* Restore from Backup */}
      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-text-primary mb-1">Restore from Backup</h3>
        <p className="text-xs text-text-secondary mb-3">
          Import a previously exported backup file. You can replace all current data or merge with
          existing data.
        </p>

        {!restoreFile && !restoreResult && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
            >
              Choose Backup File
            </button>
          </>
        )}

        {/* Validation result */}
        {validation && !restoreResult && (
          <div className="mt-3">
            {!validation.compatible ? (
              <div className="p-3 bg-danger/10 border border-danger/20 rounded text-sm text-danger mb-3">
                {validation.errors.join('. ')}
              </div>
            ) : (
              <>
                <div className="p-3 bg-surface border border-border rounded text-sm text-text-secondary mb-3">
                  <div className="font-medium text-text-primary mb-1">{restoreFile?.name}</div>
                  {Object.entries(validation.entityCounts).map(([key, count]) => (
                    <span key={key} className="inline-block mr-3 text-xs">
                      {key}: <span className="text-text-primary font-medium">{count}</span>
                    </span>
                  ))}
                  {validation.duplicateCounts &&
                    Object.keys(validation.duplicateCounts).length > 0 && (
                      <div className="mt-2 text-xs text-warning">
                        Duplicates (will be skipped):{' '}
                        {Object.entries(validation.duplicateCounts)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </div>
                    )}
                </div>

                {/* Mode selection */}
                <div className="space-y-2 mb-3">
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input
                      type="radio"
                      value="merge"
                      checked={restoreMode === 'merge'}
                      onChange={() => {
                        setRestoreMode('merge');
                        setConfirmText('');
                      }}
                      className="accent-accent"
                    />
                    Merge — add backup data alongside existing data, skip duplicates
                  </label>
                  <label className="flex items-center gap-2 text-sm text-danger cursor-pointer">
                    <input
                      type="radio"
                      value="replace"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                      className="accent-danger"
                    />
                    Full replace — wipe current data and restore from backup
                  </label>
                </div>

                {/* Confirm for replace */}
                {restoreMode === 'replace' && (
                  <div className="mb-3">
                    <p className="text-xs text-danger mb-1">
                      Type &quot;REPLACE&quot; to confirm. This will permanently delete all current
                      data.
                    </p>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder='Type "REPLACE"'
                      className="px-3 py-1.5 bg-surface border border-danger/30 rounded-lg text-sm text-text-primary outline-none focus:border-danger w-48"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRestore}
                    disabled={
                      isRestoring || (restoreMode === 'replace' && confirmText !== 'REPLACE')
                    }
                    className={`px-4 py-2 text-white text-sm rounded-full disabled:opacity-50 transition-colors ${
                      restoreMode === 'replace'
                        ? 'bg-danger hover:bg-danger/80'
                        : 'bg-accent hover:bg-accent-hover'
                    }`}
                  >
                    {isRestoring
                      ? 'Restoring...'
                      : restoreMode === 'replace'
                        ? 'Replace All Data'
                        : 'Merge Data'}
                  </button>
                  <button
                    onClick={resetRestore}
                    className="text-xs text-text-tertiary hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Restore result */}
        {restoreResult && (
          <div className="mt-3">
            <div
              className={`p-3 rounded text-sm mb-3 ${
                restoreResult.errors.length === 0
                  ? 'bg-success/10 border border-success/20 text-success'
                  : 'bg-warning/10 border border-warning/20 text-warning'
              }`}
            >
              {restoreResult.errors.length === 0
                ? `Restore complete: ${restoreResult.inserted} entities imported, ${restoreResult.skipped} skipped.`
                : `Restore completed with errors: ${restoreResult.inserted} inserted, ${restoreResult.skipped} skipped. ${restoreResult.errors.length} errors.`}
            </div>
            {restoreResult.errors.length > 0 && (
              <div className="text-xs text-text-tertiary space-y-1">
                {restoreResult.errors.slice(0, 10).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
            <button
              onClick={resetRestore}
              className="mt-2 text-xs text-accent-text hover:underline"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Import Historical Evaluations */}
      <CSVImportPanel />
    </div>
  );
}

// ── CSV Import Panel (v1.1 — M14, features 10.4–10.8) ─────

type ImportStep = 'idle' | 'parsed' | 'validated' | 'importing' | 'done';

interface ParseResultData {
  fileId: string;
  headers: string[];
  rowCount: number;
  preview: Record<string, string>[];
}

interface ValidateResultData {
  memberMatches: Array<{
    csvName: string;
    matchedMemberId: string | null;
    matchedMemberName: string | null;
    rowCount: number;
  }>;
  projectMatches: Array<{
    csvName: string;
    matchedProjectId: string | null;
    matchedProjectName: string | null;
    rowCount: number;
  }>;
  dateErrors: Array<{ row: number; value: string }>;
  duplicates: number;
  readyCount: number;
  totalRows: number;
}

interface ImportResultData {
  imported: number;
  skipped: number;
  newMembers: number;
  newProjects: number;
  errors: string[];
}

function CSVImportPanel() {
  const [step, setStep] = useState<ImportStep>('idle');
  const [parseResult, setParseResult] = useState<ParseResultData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validateResult, setValidateResult] = useState<ValidateResultData | null>(null);
  const [memberResolutions, setMemberResolutions] = useState<Record<string, string>>({});
  const [projectResolutions, setProjectResolutions] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const membersData = useMembers();
  const projectsData = useProjects();

  function resetImport() {
    setStep('idle');
    setParseResult(null);
    setMapping({});
    setValidateResult(null);
    setMemberResolutions({});
    setProjectResolutions({});
    setImportResult(null);
    setCsvError(null);
  }

  async function handleCSVSelect(file: File) {
    setCsvError(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const result = await apiClient.post<ParseResultData>('/api/import/parse', {
        fileContent: base64,
        filename: file.name,
      });
      setParseResult(result);
      // Auto-detect mappings by header name
      const auto: Record<string, string> = {};
      const lowerHeaders = result.headers.map((h) => h.toLowerCase());
      const guessMap: Record<string, string[]> = {
        memberName: ['name', 'member', 'member name', 'employee'],
        date: ['date', 'day', 'evaluation date'],
        description: ['description', 'desc', 'summary'],
        projectName: ['project', 'project name'],
        workloadScore: ['score', 'workload', 'workload score', 'rating'],
        notes: ['notes', 'additional notes', 'comments'],
      };
      for (const [field, guesses] of Object.entries(guessMap)) {
        for (const guess of guesses) {
          const idx = lowerHeaders.indexOf(guess);
          if (idx >= 0) {
            auto[field] = result.headers[idx];
            break;
          }
        }
      }
      setMapping(auto);
      setStep('parsed');
    } catch {
      setCsvError('Could not parse CSV file. Check the format and try again.');
    }
  }

  async function handleValidate() {
    if (!parseResult) return;
    setCsvError(null);
    try {
      const result = await apiClient.post<ValidateResultData>('/api/import/validate', {
        fileId: parseResult.fileId,
        mapping,
      });
      setValidateResult(result);
      const mRes: Record<string, string> = {};
      for (const m of result.memberMatches) {
        mRes[m.csvName] = m.matchedMemberId ?? `create:${m.csvName}`;
      }
      setMemberResolutions(mRes);
      const pRes: Record<string, string> = {};
      for (const p of result.projectMatches) {
        pRes[p.csvName] = p.matchedProjectId ?? `create:${p.csvName}`;
      }
      setProjectResolutions(pRes);
      setStep('validated');
    } catch {
      setCsvError('Validation failed. Check your column mappings.');
    }
  }

  async function handleExecute() {
    if (!parseResult) return;
    setStep('importing');
    try {
      const result = await apiClient.post<ImportResultData>('/api/import/execute', {
        fileId: parseResult.fileId,
        mapping,
        memberResolutions,
        projectResolutions,
      });
      setImportResult(result);
      setStep('done');
      if (result.errors.length === 0) {
        toast.success(`Imported ${result.imported} evaluations`);
      }
    } catch {
      setCsvError('Import failed.');
      setStep('validated');
    }
  }

  const requiredMapped = ['memberName', 'date', 'description'].every((f) => mapping[f]);

  return (
    <div className="bg-surface-raised border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-text-primary">Import Historical Evaluations</h3>
        {step !== 'idle' && (
          <button
            onClick={resetImport}
            className="text-xs text-text-tertiary hover:text-text-secondary"
          >
            Cancel import
          </button>
        )}
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Import evaluation records from a CSV spreadsheet. Maps your columns to Vantage fields.
      </p>

      {csvError && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded text-sm text-danger mb-3">
          {csvError}
        </div>
      )}

      {/* Upload */}
      {step === 'idle' && (
        <>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCSVSelect(f);
            }}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
          >
            Choose CSV File
          </button>
        </>
      )}

      {/* Parsed — column mapping */}
      {step === 'parsed' && parseResult && (
        <div>
          <div className="text-xs text-text-secondary mb-3">
            Found <span className="text-text-primary font-medium">{parseResult.rowCount}</span> rows
            with columns: {parseResult.headers.join(', ')}
          </div>
          <div className="space-y-2 mb-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Map Columns
            </h4>
            {[
              { key: 'memberName', label: 'Member name', req: true },
              { key: 'date', label: 'Date', req: true },
              { key: 'description', label: 'Description', req: true },
              { key: 'projectName', label: 'Project name', req: false },
              { key: 'workloadScore', label: 'Workload score', req: false },
              { key: 'notes', label: 'Notes', req: false },
            ].map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="text-xs text-text-primary w-32 shrink-0">
                  {f.label} {f.req && <span className="text-danger">*</span>}
                </label>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-xs text-text-secondary outline-none focus:border-accent"
                >
                  <option value="">— Skip —</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {mapping[f.key] && parseResult.preview[0] && (
                  <span className="text-xs text-text-tertiary truncate max-w-[150px]">
                    {parseResult.preview[0][mapping[f.key]]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleValidate}
            disabled={!requiredMapped}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Validate
          </button>
          {!requiredMapped && (
            <span className="ml-2 text-xs text-text-tertiary">
              Map all required fields (*) to proceed
            </span>
          )}
        </div>
      )}

      {/* Validated — resolve matches + confirm */}
      {step === 'validated' && validateResult && (
        <div>
          {validateResult.memberMatches.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Member Matching
              </h4>
              <div className="space-y-1">
                {validateResult.memberMatches.map((m) => (
                  <div key={m.csvName} className="flex items-center gap-3 text-xs">
                    <span className="text-text-primary w-32 truncate">{m.csvName}</span>
                    <span className="text-text-tertiary">({m.rowCount} rows)</span>
                    <select
                      value={memberResolutions[m.csvName] ?? ''}
                      onChange={(e) =>
                        setMemberResolutions((p) => ({ ...p, [m.csvName]: e.target.value }))
                      }
                      className="flex-1 px-2 py-1 bg-surface border border-border rounded text-xs outline-none focus:border-accent"
                    >
                      {m.matchedMemberId && (
                        <option value={m.matchedMemberId}>Match: {m.matchedMemberName}</option>
                      )}
                      <option value={`create:${m.csvName}`}>Create new: {m.csvName}</option>
                      <option value="skip">Skip these rows</option>
                      {membersData.data
                        ?.filter((mem) => mem.id !== m.matchedMemberId)
                        .map((mem) => (
                          <option key={mem.id} value={mem.id}>
                            Map to: {mem.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {validateResult.projectMatches.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Project Matching
              </h4>
              <div className="space-y-1">
                {validateResult.projectMatches.map((p) => (
                  <div key={p.csvName} className="flex items-center gap-3 text-xs">
                    <span className="text-text-primary w-32 truncate">{p.csvName}</span>
                    <span className="text-text-tertiary">({p.rowCount} rows)</span>
                    <select
                      value={projectResolutions[p.csvName] ?? ''}
                      onChange={(e) =>
                        setProjectResolutions((prev) => ({ ...prev, [p.csvName]: e.target.value }))
                      }
                      className="flex-1 px-2 py-1 bg-surface border border-border rounded text-xs outline-none focus:border-accent"
                    >
                      {p.matchedProjectId && (
                        <option value={p.matchedProjectId}>Match: {p.matchedProjectName}</option>
                      )}
                      <option value={`create:${p.csvName}`}>Create new: {p.csvName}</option>
                      <option value="skip">Skip</option>
                      {projectsData.data
                        ?.filter((proj) => proj.id !== p.matchedProjectId)
                        .map((proj) => (
                          <option key={proj.id} value={proj.id}>
                            Map to: {proj.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="p-3 bg-surface border border-border rounded text-xs text-text-secondary mb-3">
            <div>{validateResult.readyCount} entries ready to import</div>
            {validateResult.duplicates > 0 && (
              <div className="text-warning">
                {validateResult.duplicates} duplicates will be skipped
              </div>
            )}
            {validateResult.dateErrors.length > 0 && (
              <div className="text-danger">
                {validateResult.dateErrors.length} rows with unparseable dates
              </div>
            )}
          </div>
          <button
            onClick={handleExecute}
            disabled={validateResult.readyCount === 0}
            className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Import {validateResult.readyCount} entries
          </button>
        </div>
      )}

      {step === 'importing' && <div className="text-sm text-text-secondary py-2">Importing...</div>}

      {step === 'done' && importResult && (
        <div>
          <div
            className={`p-3 rounded text-sm mb-3 ${importResult.errors.length === 0 ? 'bg-success/10 border border-success/20 text-success' : 'bg-warning/10 border border-warning/20 text-warning'}`}
          >
            Imported {importResult.imported} evaluations.
            {importResult.skipped > 0 && ` ${importResult.skipped} skipped.`}
            {importResult.newMembers > 0 && ` ${importResult.newMembers} new members created.`}
          </div>
          <button onClick={resetImport} className="text-xs text-accent-text hover:underline">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
