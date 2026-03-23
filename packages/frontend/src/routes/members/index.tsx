import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMembers, useIdentitySuggestions, useAcceptSuggestion } from '../../hooks/api/core.js';
import { useCreateMember } from '../../hooks/api/settings.js';
import { errorMessage } from '../../lib/api-client.js';
import { toast } from 'sonner';

function SuggestedMappings() {
  const { data: suggestions } = useIdentitySuggestions();
  const acceptMutation = useAcceptSuggestion();

  if (!suggestions?.length) return null;

  return (
    <div className="mb-6 p-4 rounded-sm border border-border bg-surface-raised">
      <h3 className="text-sm font-semibold text-text-primary mb-3">
        Suggested Identity Mappings
        <span className="ml-2 text-xs font-normal text-text-tertiary">
          ({suggestions.length} unresolved)
        </span>
      </h3>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.authorRaw}
            className="flex items-center justify-between p-2 rounded bg-surface border border-border-subtle"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-text-secondary">{s.authorRaw}</span>
              {s.authorName && (
                <span className="text-xs text-text-tertiary ml-2">({s.authorName})</span>
              )}
              <span className="mx-2 text-text-tertiary">{'\u2192'}</span>
              <span className="text-sm font-medium text-text-primary">{s.suggestedMemberName}</span>
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  s.confidence === 'high'
                    ? 'bg-success/20 text-success'
                    : s.confidence === 'medium'
                      ? 'bg-warning/20 text-warning'
                      : 'bg-surface-overlay text-text-tertiary'
                }`}
              >
                {s.confidence}
              </span>
              <span className="text-xs text-text-tertiary ml-2">{s.reason}</span>
            </div>
            <button
              className="px-3 py-1 text-xs rounded-full bg-accent text-white hover:bg-accent-hover"
              onClick={() =>
                acceptMutation.mutate({
                  authorRaw: s.authorRaw,
                  memberId: s.suggestedMemberId,
                  platform: 'email',
                })
              }
              disabled={acceptMutation.isPending}
            >
              Accept
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Members() {
  const navigate = useNavigate();
  const members = useMembers();
  const createMember = useCreateMember();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortField, setSortField] = useState<'name' | 'status' | 'createdAt'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  function handleCreate() {
    if (!name.trim()) return;
    createMember.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          toast.success('Member created');
          setName('');
          setShowAdd(false);
        },
        onError: (err) => toast.error(`Failed to create member: ${errorMessage(err)}`),
      },
    );
  }

  if (members.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Members</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 bg-surface-raised border border-border rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (members.isError) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Members</h1>
        <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
          Failed to load members. Please try again.
        </div>
      </div>
    );
  }

  const raw = members.data ?? [];
  const data = raw
    .filter((m) => statusFilter === 'all' || m.status === statusFilter)
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = sortField === 'createdAt' ? a.createdAt : a[sortField];
      const bv = sortField === 'createdAt' ? b.createdAt : b[sortField];
      const cmp = (av ?? '').localeCompare(bv ?? '');
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const sortIcon = (field: typeof sortField) =>
    sortField === field ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Members</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Team members and their platform identities
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
        >
          + Add Member
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-raised border border-border rounded-sm p-4 mb-4">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Member name"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              autoFocus
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
            <button
              onClick={() => {
                setShowAdd(false);
                setName('');
              }}
              className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SuggestedMappings />

      {raw.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No members configured yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Click{' '}
            <button
              onClick={() => setShowAdd(true)}
              className="text-accent-text hover:text-accent-hover"
            >
              + Add Member
            </button>{' '}
            to start tracking reviews and workload.
          </p>
        </div>
      ) : (
        <>
          {/* Search + filter */}
          <div className="flex gap-2 mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="px-3 py-1.5 bg-surface border border-border rounded text-sm text-text-secondary"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {data.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-4">
              No members match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('name')}
                    >
                      Name{sortIcon('name')}
                    </th>
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('status')}
                    >
                      Status{sortIcon('status')}
                    </th>
                    <th
                      className="px-3 py-2 text-xs text-text-tertiary font-medium cursor-pointer select-none"
                      onClick={() => toggleSort('createdAt')}
                    >
                      Created{sortIcon('createdAt')}
                    </th>
                    <th className="px-3 py-2 text-xs text-text-tertiary font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((member) => (
                    <tr
                      key={member.id}
                      tabIndex={0}
                      aria-label={`Open member ${member.name}`}
                      onClick={() => navigate({ to: '/members/$id', params: { id: member.id } })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate({ to: '/members/$id', params: { id: member.id } });
                        }
                      }}
                      className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:bg-surface-raised"
                    >
                      <td className="px-3 py-2.5 text-text-primary font-medium">{member.name}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            member.status === 'active'
                              ? 'bg-success/20 text-success'
                              : 'bg-surface-overlay text-text-tertiary'
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-tertiary">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs text-accent-text hover:text-accent-hover">
                          View
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
