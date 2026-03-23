import { useState, useRef } from 'react';
import { useProjects, useMembers } from '../../hooks/api/core.js';
import { apiClient, errorMessage } from '../../lib/api-client.js';
import {
  useCredentials,
  useCreateCredential,
  useUpdateCredential,
  useTestCredential,
  useDeleteCredential,
  useAIProviders,
  useCreateAIProvider,
  useUpdateAIProvider,
  useActivateAIProvider,
  useDeleteAIProvider,
  useSetPassword,
  useRemovePassword,
  useDeleteAllData,
} from '../../hooks/api/settings.js';
import { toast } from 'sonner';

type Section = 'credentials' | 'ai' | 'password' | 'data';

const validSections: Section[] = ['credentials', 'ai', 'password', 'data'];

export function Settings() {
  const [section, setSection] = useState<Section>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab && validSections.includes(tab as Section) ? (tab as Section) : 'credentials';
  });

  const sections: { key: Section; label: string }[] = [
    { key: 'credentials', label: 'Credentials' },
    { key: 'ai', label: 'AI Provider' },
    { key: 'password', label: 'Access Password' },
    { key: 'data', label: 'Data Management' },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-4">
        Credentials, AI provider, access, and data management
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
          {section === 'credentials' && <CredentialsSection />}
          {section === 'ai' && <AIProviderSection />}
          {section === 'password' && <PasswordSection />}
          {section === 'data' && <DataManagementSection />}
        </div>
      </div>
    </div>
  );
}

function CredentialsSection() {
  const credentials = useCredentials();
  const createCred = useCreateCredential();
  const updateCred = useUpdateCredential();
  const testCred = useTestCredential();
  const deleteCred = useDeleteCredential();
  const [credName, setCredName] = useState('');
  const [platform, setPlatform] = useState('github');
  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editCredName, setEditCredName] = useState('');
  const [editCredToken, setEditCredToken] = useState('');

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
      },
    );
  }

  function handleTest(id: string) {
    testCred.mutate(id, {
      onSuccess: (data) => {
        setTestResult((prev) => ({ ...prev, [id]: data.message }));
        toast.success('Test passed');
      },
      onError: (err: unknown) => {
        setTestResult((prev) => ({ ...prev, [id]: `Test failed: ${errorMessage(err)}` }));
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
            <div key={cred.id} className="bg-surface-raised border border-border rounded-sm">
              <div className="flex items-center justify-between px-4 py-3">
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
                      setEditingCredId(editingCredId === cred.id ? null : cred.id);
                      setEditCredName(cred.name);
                      setEditCredToken('');
                    }}
                    className="text-xs text-accent-text hover:text-accent-hover"
                  >
                    Edit
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
              {editingCredId === cred.id && (
                <div className="border-t border-border px-4 py-3">
                  <div className="space-y-2 max-w-md">
                    <input
                      value={editCredName}
                      onChange={(e) => setEditCredName(e.target.value)}
                      placeholder="Name"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                    <input
                      type="password"
                      value={editCredToken}
                      onChange={(e) => setEditCredToken(e.target.value)}
                      placeholder="New token (leave empty to keep current)"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const data: { id: string; name?: string; token?: string } = {
                            id: cred.id,
                          };
                          if (editCredName.trim() && editCredName !== cred.name)
                            data.name = editCredName.trim();
                          if (editCredToken.trim()) data.token = editCredToken.trim();
                          if (!data.name && !data.token) return;
                          updateCred.mutate(data, {
                            onSuccess: () => {
                              toast.success('Credential updated');
                              setEditingCredId(null);
                            },
                            onError: (err) => toast.error(`Failed to update: ${errorMessage(err)}`),
                          });
                        }}
                        disabled={
                          (!editCredName.trim() || editCredName === cred.name) &&
                          !editCredToken.trim()
                        }
                        className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCredId(null)}
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
      )}
    </div>
  );
}

function AIProviderSection() {
  const providers = useAIProviders();
  const createProvider = useCreateAIProvider();
  const updateProvider = useUpdateAIProvider();
  const activateProvider = useActivateAIProvider();
  const deleteProvider = useDeleteAIProvider();
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState('api');
  const [preset, setPreset] = useState('openai');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [cliCommand, setCliCommand] = useState('');
  const [editingProvId, setEditingProvId] = useState<string | null>(null);
  const [editProvName, setEditProvName] = useState('');
  const [editEndpointUrl, setEditEndpointUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editCliCommand, setEditCliCommand] = useState('');

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
            <div key={prov.id} className="bg-surface-raised border border-border rounded-sm">
              <div className="flex items-center justify-between px-4 py-3">
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
                      setEditingProvId(editingProvId === prov.id ? null : prov.id);
                      setEditProvName(prov.name);
                      setEditEndpointUrl(prov.endpointUrl ?? '');
                      setEditApiKey('');
                      setEditModel(prov.model ?? '');
                      setEditCliCommand(prov.cliCommand ?? '');
                    }}
                    className="text-xs text-accent-text hover:text-accent-hover"
                  >
                    Edit
                  </button>
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
              {editingProvId === prov.id && (
                <div className="border-t border-border px-4 py-3">
                  <div className="space-y-2 max-w-md">
                    <input
                      value={editProvName}
                      onChange={(e) => setEditProvName(e.target.value)}
                      placeholder="Provider name"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                    {prov.type === 'api' && (
                      <>
                        <input
                          value={editEndpointUrl}
                          onChange={(e) => setEditEndpointUrl(e.target.value)}
                          placeholder="Endpoint URL"
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                        />
                        <input
                          type="password"
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          placeholder="New API key (leave empty to keep current)"
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                        />
                        <input
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          placeholder="Model name"
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                        />
                      </>
                    )}
                    {prov.type === 'cli' && (
                      <input
                        value={editCliCommand}
                        onChange={(e) => setEditCliCommand(e.target.value)}
                        placeholder="CLI command"
                        className="w-full px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const data: Record<string, string> & { id: string } = { id: prov.id };
                          if (editProvName.trim() && editProvName !== prov.name)
                            data.name = editProvName.trim();
                          if (prov.type === 'api') {
                            if (editEndpointUrl.trim() !== (prov.endpointUrl ?? ''))
                              data.endpointUrl = editEndpointUrl.trim();
                            if (editApiKey.trim()) data.apiKey = editApiKey.trim();
                            if (editModel.trim() !== (prov.model ?? ''))
                              data.model = editModel.trim();
                          }
                          if (
                            prov.type === 'cli' &&
                            editCliCommand.trim() !== (prov.cliCommand ?? '')
                          ) {
                            data.cliCommand = editCliCommand.trim();
                          }
                          if (Object.keys(data).length <= 1) return;
                          updateProvider.mutate(data, {
                            onSuccess: () => {
                              toast.success('Provider updated');
                              setEditingProvId(null);
                            },
                            onError: (err) => toast.error(`Failed to update: ${errorMessage(err)}`),
                          });
                        }}
                        className="px-3 py-1.5 bg-accent text-white text-xs rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingProvId(null)}
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
    });
  }

  function handleRemovePassword() {
    removePasswordMut.mutate(undefined, {
      onSuccess: () => toast.success('Password removed'),
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = apiClient.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers,
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
    } catch (err) {
      toast.error(`Failed to create backup: ${errorMessage(err)}`, { duration: 8000 });
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
    } catch (err) {
      toast.error(`Restore failed: ${errorMessage(err)}`, { duration: 8000 });
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

      {/* Data Location */}
      <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-1">Data Location</h3>
          <p className="text-xs text-text-secondary">
            Open the folder where Vantage stores its database and configuration.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await apiClient.post('/api/system/open-data-dir', {});
            } catch {
              toast.error('Could not open data folder');
            }
          }}
          className="px-4 py-2 border border-border text-text-primary text-sm rounded-full hover:bg-surface transition-colors shrink-0"
        >
          Open Data Location
        </button>
      </div>

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

      {/* Delete All Data */}
      <DeleteAllDataPanel />
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
    } catch (err) {
      setCsvError(`Validation failed: ${errorMessage(err)}`);
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
    } catch (err) {
      setCsvError(`Import failed: ${errorMessage(err)}`);
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

function DeleteAllDataPanel() {
  const deleteAll = useDeleteAllData();
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="bg-surface-raised border border-danger/30 rounded-sm p-4 mt-4">
      <h3 className="text-sm font-medium text-danger mb-1">Delete All Data</h3>
      <p className="text-xs text-text-secondary mb-3">
        Permanently delete all projects, members, reviews, evaluations, credentials, and AI
        providers. App settings (password, preferences) are preserved. A backup file is created
        automatically before deletion.
      </p>
      <div className="flex items-center gap-3">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='Type "DELETE ALL" to confirm'
          className="px-3 py-1.5 bg-surface border border-danger/30 rounded-lg text-sm text-text-primary outline-none focus:border-danger w-56"
        />
        <button
          onClick={() => {
            deleteAll.mutate(undefined, {
              onSuccess: () => {
                toast.success('All data deleted');
                setConfirmText('');
              },
            });
          }}
          disabled={confirmText !== 'DELETE ALL' || deleteAll.isPending}
          className="px-4 py-2 bg-danger text-white text-sm rounded-full hover:bg-danger/80 disabled:opacity-50 transition-colors"
        >
          {deleteAll.isPending ? 'Deleting...' : 'Delete All Data'}
        </button>
      </div>
    </div>
  );
}
