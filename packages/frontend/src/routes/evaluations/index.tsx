import { useState, useMemo } from 'react';
import { errorMessage } from '../../lib/api-client.js';
import { useMembers, useProjects, useSearch, useDayActivity } from '../../hooks/api/core.js';
import {
  useEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
  useDailyPrefill,
  useQuarterlySynthesis,
} from '../../hooks/api/evaluations.js';
import { format } from 'date-fns/format';
import { toast } from 'sonner';
import type { EvaluationEntry } from '@twle/vantage-shared';

type Tab = 'daily' | 'log' | 'quarterly';
type QuarterlyMode = 'per-member' | 'per-member-per-project';

export function Evaluations() {
  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [dateStart, setDateStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateEnd, setDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${q}`;
  });
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [description, setDescription] = useState('');
  const [workloadScore, setWorkloadScore] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [logFilterMember, setLogFilterMember] = useState('');
  const [logFilterType, setLogFilterType] = useState('');

  // Bug 1: Project selection state for daily evaluations
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  // Bug 2: Quarterly mode toggle and project selection
  const [quarterlyMode, setQuarterlyMode] = useState<QuarterlyMode>('per-member');
  const [quarterlyProjectIds, setQuarterlyProjectIds] = useState<string[]>([]);

  const members = useMembers();
  const projects = useProjects();
  const evalFilters: Record<string, string> =
    activeTab === 'log'
      ? { limit: '50' }
      : { limit: '20', ...(selectedMemberId ? { memberId: selectedMemberId } : {}) };
  const evaluations = useEvaluations(evalFilters);
  const search = useSearch(searchQuery, 'evaluations');
  const createEval = useCreateEvaluation();
  const updateEval = useUpdateEvaluation();
  const deleteEval = useDeleteEvaluation();

  // Bug 3: AI pre-fill for daily evaluations
  const dailyPrefill = useDailyPrefill(dateStart, dateEnd, selectedMemberId);

  // Bug 4: AI synthesis for quarterly evaluations
  const quarterlySynthesis = useQuarterlySynthesis(selectedQuarter, selectedMemberId);

  // Bug 5: Day activity for member hints
  const dayActivity = useDayActivity(dateEnd);

  const [editingId, setEditingId] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'daily', label: 'Daily Check-Up' },
    { key: 'log', label: 'Evaluation Log' },
    { key: 'quarterly', label: 'Quarterly' },
  ];

  // Bug 5: Compute active member IDs from workload data
  const activeMemberIds = useMemo(() => {
    if (!dayActivity.data?.byMember) return new Set<string>();
    return new Set(
      dayActivity.data.byMember
        .filter((m) => m.memberId != null && m.commitCount > 0)
        .map((m) => m.memberId as string),
    );
  }, [dayActivity.data]);

  // Bug 5: Sort members — active first, then alphabetical
  const sortedMembers = useMemo(() => {
    if (!members.data) return [];
    return [...members.data].sort((a, b) => {
      const aActive = activeMemberIds.has(a.id);
      const bActive = activeMemberIds.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [members.data, activeMemberIds]);

  // Bug 1: Toggle project selection for daily
  function toggleDailyProject(projectId: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  }

  // Bug 2: Toggle project selection for quarterly per-project mode
  function toggleQuarterlyProject(projectId: string) {
    setQuarterlyProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  }

  function handleCreateDaily() {
    if (!selectedMemberId) {
      toast.error('Select a member first');
      return;
    }
    if (selectedProjectIds.length === 0) {
      toast.error('Select at least one project');
      return;
    }
    createEval.mutate(
      {
        type: 'daily',
        memberId: selectedMemberId,
        date: dateEnd,
        dateRangeStart: dateStart !== dateEnd ? dateStart : undefined,
        projectIds: selectedProjectIds,
        description: description || undefined,
        workloadScore: workloadScore ? parseInt(workloadScore, 10) : undefined,
        notes: evalNotes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Daily evaluation created');
          setDescription('');
          setWorkloadScore('');
          setEvalNotes('');
          setSelectedProjectIds([]);
        },
      },
    );
  }

  function handleCreateQuarterly() {
    if (!selectedMemberId) {
      toast.error('Select a member first');
      return;
    }

    if (quarterlyMode === 'per-member') {
      // Per-member mode: use all projects (require at least one project to exist)
      const allProjectIds = projects.data?.map((p) => p.id) ?? [];
      if (allProjectIds.length === 0) {
        toast.error('No projects available. Create a project first.');
        return;
      }
      createEval.mutate(
        {
          type: 'quarterly',
          memberId: selectedMemberId,
          quarter: selectedQuarter,
          projectIds: allProjectIds,
          description: description || undefined,
          workloadScore: workloadScore ? parseInt(workloadScore, 10) : undefined,
          notes: evalNotes || undefined,
        },
        {
          onSuccess: () => {
            toast.success('Quarterly evaluation created');
            setDescription('');
            setWorkloadScore('');
            setEvalNotes('');
          },
        },
      );
    } else {
      // Per-member-per-project mode: create separate evaluation per selected project
      if (quarterlyProjectIds.length === 0) {
        toast.error('Select at least one project');
        return;
      }
      let successCount = 0;
      let errorCount = 0;
      const total = quarterlyProjectIds.length;

      for (const projectId of quarterlyProjectIds) {
        createEval.mutate(
          {
            type: 'quarterly',
            memberId: selectedMemberId,
            quarter: selectedQuarter,
            projectIds: [projectId],
            description: description || undefined,
            workloadScore: workloadScore ? parseInt(workloadScore, 10) : undefined,
            notes: evalNotes || undefined,
          },
          {
            onSuccess: () => {
              successCount++;
              if (successCount + errorCount === total) {
                if (errorCount === 0) {
                  toast.success(`Created ${successCount} quarterly evaluation(s)`);
                } else {
                  toast.warning(`Created ${successCount}, failed ${errorCount}`);
                }
                setDescription('');
                setWorkloadScore('');
                setEvalNotes('');
                setQuarterlyProjectIds([]);
              }
            },
            onError: () => {
              errorCount++;
            },
          },
        );
      }
    }
  }

  // Bug 3: AI pre-fill handler
  function handleAiPrefill() {
    if (!selectedMemberId) {
      toast.error('Select a member first');
      return;
    }
    dailyPrefill
      .refetch()
      .then((result) => {
        if (result.data) {
          if (result.data.description) {
            setDescription(result.data.description);
          }
          if (result.data.workloadScore != null) {
            setWorkloadScore(String(result.data.workloadScore));
          }
          if (!result.data.description && result.data.workloadScore == null) {
            toast.info('AI pre-fill returned no data. AI may not be configured.');
          } else {
            toast.success('AI pre-fill applied');
          }
        }
      })
      .catch((err: unknown) => {
        toast.error(`AI pre-fill failed: ${errorMessage(err)}`, { duration: 8000 });
      });
  }

  // Bug 4: AI synthesis handler
  function handleAiSynthesis() {
    if (!selectedMemberId) {
      toast.error('Select a member first');
      return;
    }
    quarterlySynthesis
      .refetch()
      .then((result) => {
        if (result.data) {
          if (result.data.description) {
            setDescription(result.data.description);
          }
          if (result.data.workloadScore != null) {
            setWorkloadScore(String(result.data.workloadScore));
          }
          if (!result.data.description && result.data.workloadScore == null) {
            toast.info('AI synthesis returned no data. AI may not be configured.');
          } else {
            toast.success('AI synthesis applied');
          }
        }
      })
      .catch((err: unknown) => {
        toast.error(`AI synthesis failed: ${errorMessage(err)}`, { duration: 8000 });
      });
  }

  function handleSaveEdit(ev: EvaluationEntry) {
    updateEval.mutate(
      {
        id: ev.id,
        description,
        workloadScore: workloadScore ? parseInt(workloadScore, 10) : undefined,
        notes: evalNotes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Evaluation updated');
          setEditingId(null);
        },
      },
    );
  }

  function startEdit(ev: EvaluationEntry) {
    setEditingId(ev.id);
    setDescription(ev.description ?? '');
    setWorkloadScore(ev.workloadScore != null ? String(ev.workloadScore) : '');
    setEvalNotes(ev.notes ?? '');
  }

  const memberMap = useMemo(
    () => new Map(members.data?.map((m) => [m.id, m.name]) ?? []),
    [members.data],
  );
  const projectMap = useMemo(
    () => new Map(projects.data?.map((p) => [p.id, p.name]) ?? []),
    [projects.data],
  );

  const logItemsRaw =
    searchQuery.length >= 2
      ? (search.data?.evaluations?.map((h) => h.item as unknown as EvaluationEntry) ?? [])
      : (evaluations.data?.items ?? []);

  const logItems = logItemsRaw.filter((ev) => {
    if (logFilterMember && ev.memberId !== logFilterMember) return false;
    if (logFilterType && ev.type !== logFilterType) return false;
    return true;
  });

  // Sanitize CSV cell values to prevent formula injection in spreadsheet apps
  function csvSafe(val: string): string {
    const escaped = val.replace(/"/g, '""');
    // Prefix formula-triggering characters with a tab to neutralize them
    if (/^[=+\-@]/.test(escaped)) return `"\t${escaped}"`;
    return `"${escaped}"`;
  }

  function handleExportCsv() {
    const rows = [['Member', 'Type', 'Date', 'Description', 'Score', 'Notes'].join(',')];
    for (const ev of logItems) {
      const name = memberMap.get(ev.memberId) ?? ev.memberId;
      const desc = ev.description ?? '';
      const notes = ev.notes ?? '';
      rows.push(
        [
          csvSafe(name),
          ev.type,
          ev.date,
          csvSafe(desc),
          String(ev.workloadScore ?? ''),
          csvSafe(notes),
        ].join(','),
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluations-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Shared project checkbox list component
  function ProjectCheckboxes({
    selectedIds,
    onToggle,
  }: {
    selectedIds: string[];
    onToggle: (id: string) => void;
  }) {
    if (!projects.data || projects.data.length === 0) {
      return (
        <p className="text-xs text-text-tertiary">
          No projects available. Create a project in Settings first.
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {projects.data.map((p) => (
          <label
            key={p.id}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
              selectedIds.includes(p.id)
                ? 'bg-accent/10 border-accent text-accent-text'
                : 'bg-surface border-border text-text-secondary hover:border-border-hover'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(p.id)}
              onChange={() => onToggle(p.id)}
              className="sr-only"
            />
            <span
              className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                selectedIds.includes(p.id) ? 'bg-accent border-accent' : 'border-border'
              }`}
            >
              {selectedIds.includes(p.id) && (
                <svg
                  className="w-2 h-2 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={4}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            {p.name}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">Evaluations</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-4">
        Daily check-ups and quarterly evaluations
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-accent text-accent-text'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Daily tab */}
      {activeTab === 'daily' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Start Date</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">End Date</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary"
              >
                <option value="">Select member...</option>
                {sortedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {activeMemberIds.has(m.id) ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bug 5: Activity hint */}
          {activeMemberIds.size > 0 && (
            <div className="mb-4 px-3 py-2 bg-surface-overlay border border-border rounded text-xs text-text-secondary">
              <span className="font-medium text-text-primary">
                Members with activity{' '}
                {dateStart === dateEnd ? `on ${dateEnd}` : `from ${dateStart} to ${dateEnd}`}:
              </span>{' '}
              {Array.from(activeMemberIds)
                .map((id) => memberMap.get(id) ?? id)
                .join(', ')}
              <span className="ml-1 text-text-tertiary">(marked with * in dropdown)</span>
            </div>
          )}

          {selectedMemberId && (
            <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary">New Daily Check-Up</h3>
                {/* Bug 3: AI pre-fill button */}
                <button
                  onClick={handleAiPrefill}
                  disabled={dailyPrefill.isFetching}
                  className="px-3 py-1.5 bg-surface border border-border rounded text-xs text-text-secondary hover:text-accent-text hover:border-accent-text disabled:opacity-50 transition-colors"
                >
                  {dailyPrefill.isFetching ? 'Loading...' : 'AI Pre-fill'}
                </button>
              </div>
              <div className="space-y-3">
                {/* Bug 1: Project selector */}
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">
                    Projects <span className="text-danger">*</span>
                  </label>
                  <ProjectCheckboxes
                    selectedIds={selectedProjectIds}
                    onToggle={toggleDailyProject}
                  />
                  {selectedProjectIds.length === 0 && (
                    <p className="text-xs text-text-tertiary mt-1">
                      Select at least one project this work relates to.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What did this member work on today?"
                    className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary resize-none h-20 outline-none focus:border-accent"
                  />
                </div>
                <div className="flex gap-3">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">
                      Workload Score (1-10)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={workloadScore}
                      onChange={(e) => setWorkloadScore(e.target.value)}
                      className="w-24 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-text-tertiary mb-1">Notes</label>
                    <input
                      value={evalNotes}
                      onChange={(e) => setEvalNotes(e.target.value)}
                      placeholder="Additional notes..."
                      className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateDaily}
                  disabled={createEval.isPending || selectedProjectIds.length === 0}
                  className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {createEval.isPending ? 'Saving...' : 'Save Daily Check-Up'}
                </button>
              </div>
            </div>
          )}

          {/* Existing evaluations for the selected member */}
          {selectedMemberId && evaluations.data?.items && evaluations.data.items.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-2">Recent Evaluations</h3>
              <div className="space-y-2">
                {evaluations.data.items
                  .filter((ev) => ev.type === 'daily')
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="px-4 py-3 bg-surface-raised border border-border rounded-sm"
                    >
                      {editingId === ev.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary resize-none h-16 outline-none focus:border-accent"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={workloadScore}
                              onChange={(e) => setWorkloadScore(e.target.value)}
                              placeholder="Score"
                              className="w-20 px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
                            />
                            <button
                              onClick={() => handleSaveEdit(ev)}
                              className="px-3 py-1 bg-accent text-white text-xs rounded-full"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 text-xs text-text-tertiary hover:text-text-secondary"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-sm text-text-primary">
                              {ev.description || 'No description'}
                            </span>
                            <div className="flex gap-2 text-xs text-text-tertiary mt-0.5">
                              <span>{ev.date}</span>
                              {ev.projectIds && ev.projectIds.length > 0 && (
                                <span>
                                  {ev.projectIds
                                    .map((pid) => projectMap.get(pid) ?? pid)
                                    .join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {ev.workloadScore != null && (
                              <span className="text-xs text-text-secondary">
                                Score: {ev.workloadScore}
                              </span>
                            )}
                            <button
                              onClick={() => startEdit(ev)}
                              className="text-xs text-accent-text hover:text-accent-hover"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                deleteEval.mutate(ev.id, {
                                  onSuccess: () => toast.success('Deleted'),
                                });
                              }}
                              className="text-xs text-danger hover:text-danger/80"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!selectedMemberId && (
            <p className="text-sm text-text-tertiary text-center mt-8">
              Select a member above to create or view daily check-ups.
            </p>
          )}
        </div>
      )}

      {/* Log tab */}
      {activeTab === 'log' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evaluations..."
              className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent min-w-[200px]"
            />
            <select
              value={logFilterMember}
              onChange={(e) => setLogFilterMember(e.target.value)}
              className="px-2 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary"
            >
              <option value="">All members</option>
              {members.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={logFilterType}
              onChange={(e) => setLogFilterType(e.target.value)}
              className="px-2 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary"
            >
              <option value="">All types</option>
              <option value="daily">Daily</option>
              <option value="quarterly">Quarterly</option>
            </select>
            <button
              onClick={handleExportCsv}
              className="ml-auto px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
            >
              Export CSV
            </button>
          </div>

          {evaluations.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-surface-raised border border-border rounded animate-pulse"
                />
              ))}
            </div>
          ) : logItems.length === 0 ? (
            <div className="text-center mt-8">
              <p className="text-text-secondary">No evaluations found.</p>
              <p className="text-sm text-text-tertiary mt-1">
                Create evaluations using the Daily or Quarterly tabs.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Member</th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Type</th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Date</th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">
                      Description
                    </th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {logItems.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b border-border-subtle hover:bg-surface-raised transition-colors"
                    >
                      <td className="px-3 py-2.5 text-text-primary">
                        {memberMap.get(ev.memberId) ?? ev.memberId}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary">
                          {ev.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-tertiary">{ev.date}</td>
                      <td className="px-3 py-2.5 text-text-secondary truncate max-w-xs">
                        {ev.description || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">{ev.workloadScore ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quarterly tab */}
      {activeTab === 'quarterly' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Quarter</label>
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary"
              >
                {(() => {
                  const options = [];
                  const now = new Date();
                  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
                    for (let q = 4; q >= 1; q--) {
                      options.push(`${y}-Q${q}`);
                    }
                  }
                  return options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-secondary"
              >
                <option value="">Select member...</option>
                {members.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedMemberId && (
            <div className="bg-surface-raised border border-border rounded-sm p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary">New Quarterly Evaluation</h3>
                {/* Bug 4: AI synthesis button */}
                <button
                  onClick={handleAiSynthesis}
                  disabled={quarterlySynthesis.isFetching}
                  className="px-3 py-1.5 bg-surface border border-border rounded text-xs text-text-secondary hover:text-accent-text hover:border-accent-text disabled:opacity-50 transition-colors"
                >
                  {quarterlySynthesis.isFetching ? 'Loading...' : 'AI Synthesis'}
                </button>
              </div>
              <div className="space-y-3">
                {/* Bug 2: Mode toggle */}
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Evaluation Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setQuarterlyMode('per-member')}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        quarterlyMode === 'per-member'
                          ? 'bg-accent/10 border-accent text-accent-text'
                          : 'bg-surface border-border text-text-secondary hover:border-border-hover'
                      }`}
                    >
                      Per-member (all projects)
                    </button>
                    <button
                      onClick={() => setQuarterlyMode('per-member-per-project')}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        quarterlyMode === 'per-member-per-project'
                          ? 'bg-accent/10 border-accent text-accent-text'
                          : 'bg-surface border-border text-text-secondary hover:border-border-hover'
                      }`}
                    >
                      Per-member-per-project
                    </button>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">
                    {quarterlyMode === 'per-member'
                      ? 'One evaluation covering all projects for this member.'
                      : 'Create separate evaluations for each selected project.'}
                  </p>
                </div>

                {/* Bug 2: Project selection (only shown in per-project mode) */}
                {quarterlyMode === 'per-member-per-project' && (
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">
                      Projects <span className="text-danger">*</span>
                    </label>
                    <ProjectCheckboxes
                      selectedIds={quarterlyProjectIds}
                      onToggle={toggleQuarterlyProject}
                    />
                    {quarterlyProjectIds.length === 0 && (
                      <p className="text-xs text-text-tertiary mt-1">
                        Select at least one project.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Summary</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Quarterly evaluation summary..."
                    className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary resize-none h-24 outline-none focus:border-accent"
                  />
                </div>
                <div className="flex gap-3">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">
                      Workload Score (1-10)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={workloadScore}
                      onChange={(e) => setWorkloadScore(e.target.value)}
                      className="w-24 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-text-tertiary mb-1">Notes</label>
                    <input
                      value={evalNotes}
                      onChange={(e) => setEvalNotes(e.target.value)}
                      placeholder="Additional notes..."
                      className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateQuarterly}
                  disabled={
                    createEval.isPending ||
                    (quarterlyMode === 'per-member-per-project' && quarterlyProjectIds.length === 0)
                  }
                  className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {createEval.isPending ? 'Saving...' : 'Save Quarterly Evaluation'}
                </button>
              </div>
            </div>
          )}

          {/* Existing quarterly evaluations */}
          {evaluations.data?.items &&
            evaluations.data.items.filter((e) => e.type === 'quarterly').length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-text-primary mb-2">
                  Quarterly Evaluations
                </h3>
                <div className="space-y-2">
                  {evaluations.data.items
                    .filter((ev) => ev.type === 'quarterly')
                    .map((ev) => (
                      <div
                        key={ev.id}
                        className="px-4 py-3 bg-surface-raised border border-border rounded-sm flex items-start justify-between"
                      >
                        <div>
                          <span className="text-sm text-text-primary">
                            {ev.description || 'No description'}
                          </span>
                          <div className="flex gap-2 text-xs text-text-tertiary mt-0.5">
                            <span>{memberMap.get(ev.memberId) ?? ev.memberId}</span>
                            <span>{ev.quarter ?? ev.date}</span>
                            {ev.projectIds && ev.projectIds.length > 0 && (
                              <span>
                                {ev.projectIds.map((pid) => projectMap.get(pid) ?? pid).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ev.workloadScore != null && (
                            <span className="text-xs text-text-secondary">
                              Score: {ev.workloadScore}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              deleteEval.mutate(ev.id, {
                                onSuccess: () => toast.success('Deleted'),
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
              </div>
            )}

          {!selectedMemberId && (
            <p className="text-sm text-text-tertiary text-center mt-8">
              Select a member above to create or view quarterly evaluations.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
