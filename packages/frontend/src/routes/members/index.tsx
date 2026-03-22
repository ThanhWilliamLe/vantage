import { useNavigate } from '@tanstack/react-router';
import { useMembers, useIdentitySuggestions, useAcceptSuggestion } from '../../hooks/api/core.js';

function SuggestedMappings() {
  const { data: suggestions } = useIdentitySuggestions();
  const acceptMutation = useAcceptSuggestion();

  if (!suggestions?.length) return null;

  return (
    <div className="mb-6 p-4 rounded-lg border border-border-primary bg-surface-secondary">
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
            className="flex items-center justify-between p-2 rounded bg-surface-primary"
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
                    ? 'bg-green-500/20 text-green-400'
                    : s.confidence === 'medium'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {s.confidence}
              </span>
              <span className="text-xs text-text-tertiary ml-2">{s.reason}</span>
            </div>
            <button
              className="px-3 py-1 text-xs rounded bg-accent-primary text-white hover:bg-accent-primary/80"
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

  const data = members.data ?? [];

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
          onClick={() => navigate({ to: '/settings', search: { tab: 'members' } })}
          className="text-sm text-accent-text hover:text-accent-hover"
        >
          Manage in Settings
        </button>
      </div>

      <SuggestedMappings />

      {data.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No members configured yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Add team members in{' '}
            <button
              onClick={() => navigate({ to: '/settings', search: { tab: 'members' } })}
              className="text-accent-text hover:text-accent-hover"
            >
              Settings
            </button>{' '}
            to start tracking reviews and workload.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Name</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Status</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium">Created</th>
                <th className="px-3 py-2 text-xs text-text-tertiary font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => navigate({ to: '/members/$id', params: { id: member.id } })}
                  className="border-b border-border-subtle hover:bg-surface-raised cursor-pointer transition-colors"
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
                    <span className="text-xs text-accent-text hover:text-accent-hover">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
