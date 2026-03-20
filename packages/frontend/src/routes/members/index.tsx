import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from '../__root.js';
import { useMembers } from '../../hooks/use-api.js';

function MembersList() {
  const navigate = useNavigate();
  const members = useMembers();

  if (members.isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Members</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-raised border border-border rounded animate-pulse" />
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
          <p className="text-sm text-text-secondary mt-0.5">Team members and their platform identities</p>
        </div>
        <button
          onClick={() => navigate({ to: '/settings', search: { tab: 'members' } })}
          className="text-sm text-accent hover:text-accent-hover"
        >
          Manage in Settings
        </button>
      </div>

      {data.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-text-secondary">No members configured yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Add team members in{' '}
            <button onClick={() => navigate({ to: '/settings', search: { tab: 'members' } })} className="text-accent hover:text-accent-hover">
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
                    <span className="text-xs text-accent hover:text-accent-hover">View</span>
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

export const membersIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: MembersList,
});
