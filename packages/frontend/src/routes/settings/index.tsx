import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useState } from 'react';
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useProjectRepositories,
  useCreateRepository,
  useDeleteRepository,
  useProjectTaskPatterns,
  useCreateTaskPattern,
  useDeleteTaskPattern,
  useMembers,
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
} from '../../hooks/use-api.js';
import { toast } from 'sonner';

type Section = 'projects' | 'members' | 'credentials' | 'ai' | 'password';

const validSections: Section[] = ['projects', 'members', 'credentials', 'ai', 'password'];

function Settings() {
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
                      ? 'bg-surface-raised text-accent'
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
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Projects</h2>

      {/* Create form */}
      <div className="bg-surface-raised border border-border rounded-lg p-4 mb-6">
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
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      {/* List */}
      {projects.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
          ))}
        </div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">No projects yet. Create your first project above.</p>
      ) : (
        <div className="space-y-3">
          {projects.data!.map((project) => (
            <div
              key={project.id}
              className="bg-surface-raised border border-border rounded-lg"
            >
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
                  <span className="text-sm text-text-primary font-medium truncate">{project.name}</span>
                  {project.description && (
                    <span className="text-xs text-text-tertiary truncate">{project.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      project.status === 'active' ? 'bg-success/20 text-success' : 'bg-surface-overlay text-text-tertiary'
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

function ProjectEditForm({ project }: { project: { id: string; name: string; description: string | null } }) {
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
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Edit Project</h4>
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
          className="px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Repositories</h4>

      {/* Existing repos */}
      {repos.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : repos.data && repos.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {repos.data.map((repo) => (
            <div key={repo.id} className="flex items-center justify-between px-3 py-1.5 bg-surface border border-border-subtle rounded text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs px-1.5 py-0.5 bg-surface-overlay rounded text-text-tertiary shrink-0">{repo.type}</span>
                <span className="text-text-secondary truncate">{repo.localPath ?? `${repo.apiOwner}/${repo.apiRepo}`}</span>
              </div>
              <button
                onClick={() => deleteRepo.mutate(repo.id, {
                  onSuccess: () => { toast.success('Repository removed'); repos.refetch(); },
                  onError: () => toast.error('Failed to remove repository'),
                })}
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
          className="px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Task Patterns</h4>
      <p className="text-xs text-text-tertiary mb-2">
        Define regex patterns to detect task IDs in commit messages. Use a capture group for the ID portion.
      </p>

      {/* Existing patterns */}
      {patterns.isLoading ? (
        <div className="h-8 bg-surface-overlay rounded animate-pulse mb-2" />
      ) : patterns.data && patterns.data.length > 0 ? (
        <div className="space-y-1 mb-3">
          {patterns.data.map((pat) => (
            <div key={pat.id} className="flex items-center justify-between px-3 py-1.5 bg-surface border border-border-subtle rounded text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <code className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">{pat.regex}</code>
                <span className="text-xs text-text-tertiary truncate">{pat.urlTemplate}</span>
              </div>
              <button
                onClick={() => deletePattern.mutate(pat.id, {
                  onSuccess: () => { toast.success('Pattern removed'); patterns.refetch(); },
                  onError: () => toast.error('Failed to remove pattern'),
                })}
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
          className="px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Members</h2>

      <div className="bg-surface-raised border border-border rounded-lg p-4 mb-6">
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
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {members.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
          ))}
        </div>
      ) : (members.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">No members yet. Add your first team member above.</p>
      ) : (
        <div className="space-y-2">
          {members.data!.map((member) => (
            <div key={member.id}>
              <div
                className={`flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg cursor-pointer hover:bg-surface-overlay transition-colors ${
                  expandedMemberId === member.id ? 'rounded-b-none border-b-0' : ''
                }`}
                onClick={() => setExpandedMemberId(expandedMemberId === member.id ? null : member.id)}
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
                      member.status === 'active' ? 'bg-success/20 text-success' : 'bg-surface-overlay text-text-tertiary'
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
              {expandedMemberId === member.id && (
                <MemberIdentityPanel memberId={member.id} />
              )}
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
    <div className="px-4 py-3 bg-surface-raised border border-border rounded-b-lg">
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
          className="px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Identity list */}
      {identities.isLoading ? (
        <div className="h-6 bg-surface border border-border rounded animate-pulse" />
      ) : (identities.data?.length ?? 0) === 0 ? (
        <p className="text-xs text-text-tertiary">No identities mapped. Add GitHub, GitLab, or email mappings above.</p>
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

      <div className="bg-surface-raised border border-border rounded-lg p-4 mb-6">
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
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
              className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg"
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
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  Test
                </button>
                <button
                  onClick={() => {
                    deleteCred.mutate(cred.id, { onSuccess: () => toast.success('Credential deleted') });
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

      <div className="bg-surface-raised border border-border rounded-lg p-4 mb-6">
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
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Add Provider
          </button>
        </div>
      </div>

      {providers.isLoading ? (
        <div className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
      ) : (providers.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-tertiary">
          No AI providers configured. Add one to enable AI-powered summaries, risk scoring, and deep analysis.
        </p>
      ) : (
        <div className="space-y-2">
          {providers.data!.map((prov) => (
            <div
              key={prov.id}
              className="flex items-center justify-between px-4 py-3 bg-surface-raised border border-border rounded-lg"
            >
              <div>
                <span className="text-sm text-text-primary font-medium">{prov.name}</span>
                <span className="ml-2 text-xs text-text-tertiary">{prov.type}</span>
                {prov.model && <span className="ml-2 text-xs text-text-tertiary">{prov.model}</span>}
                {prov.isActive && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-success/20 text-success rounded">Active</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!prov.isActive && (
                  <button
                    onClick={() => activateProvider.mutate(prov.id)}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => {
                    deleteProvider.mutate(prov.id, { onSuccess: () => toast.success('Provider deleted') });
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
        Optionally protect Vantage with an access password. Without a password, anyone on the local network can access the UI.
      </p>

      <div className="bg-surface-raised border border-border rounded-lg p-4 mb-4">
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
            disabled={password.length < 4 || password !== confirmPassword || setPasswordMut.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
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

export const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
});
