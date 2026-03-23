import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUIStore } from '../stores/ui-store.js';
import { apiClient } from '../lib/api-client.js';
import type { Member, Project } from '@twle/vantage-shared';

const navCommands = [
  { label: 'Go to Dashboard', to: '/' },
  { label: 'Go to Review Queue', to: '/reviews' },
  { label: 'Go to Review History', to: '/reviews/history' },
  { label: 'Go to Members', to: '/members' },
  { label: 'Go to Projects', to: '/projects' },
  { label: 'Go to Evaluations', to: '/evaluations' },
  { label: 'Go to Workload', to: '/workload' },
  { label: 'Go to Settings', to: '/settings' },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const navigate = useNavigate();
  const [searchResults, setSearchResults] = useState<{ members: Member[]; projects: Project[] }>({
    members: [],
    projects: [],
  });
  const [query, setQuery] = useState('');

  // Ctrl+K and Escape are handled globally in __root.tsx.
  // Search members and projects when query changes
  useEffect(() => {
    if (!open || query.length < 1) {
      setSearchResults({ members: [], projects: [] });
      return;
    }
    let cancelled = false;
    const encoded = encodeURIComponent(query);
    Promise.all([
      apiClient.get<Member[]>(`/api/members/search?q=${encoded}`).catch(() => []),
      apiClient.get<Project[]>(`/api/projects/search?q=${encoded}`).catch(() => []),
    ]).then(([members, projects]) => {
      if (!cancelled) setSearchResults({ members, projects });
    });
    return () => {
      cancelled = true;
    };
  }, [query, open]);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearchResults({ members: [], projects: [] });
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
    >
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <Command
        className="relative w-full max-w-lg bg-surface-overlay border border-border rounded-sm shadow-2xl overflow-hidden"
        label="Command palette"
      >
        <Command.Input
          placeholder="Type a command or search..."
          value={query}
          onValueChange={setQuery}
          className="w-full px-4 py-3 bg-transparent text-text-primary text-sm border-b border-border outline-none placeholder:text-text-tertiary"
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-6 text-sm text-text-tertiary text-center">
            No results found.
          </Command.Empty>

          {/* Member search results */}
          {searchResults.members.length > 0 && (
            <Command.Group heading="Members" className="text-xs text-text-tertiary px-2 py-1">
              {searchResults.members.map((m) => (
                <Command.Item
                  key={`member-${m.id}`}
                  value={`member ${m.name}`}
                  onSelect={() => {
                    navigate({ to: '/members/$id', params: { id: m.id } });
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary rounded cursor-pointer data-[selected=true]:bg-surface-raised data-[selected=true]:text-text-primary"
                >
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center">
                    {m.name[0]}
                  </span>
                  {m.name}
                  <span className="ml-auto text-xs text-text-tertiary">{m.status}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Project search results */}
          {searchResults.projects.length > 0 && (
            <Command.Group heading="Projects" className="text-xs text-text-tertiary px-2 py-1">
              {searchResults.projects.map((p) => (
                <Command.Item
                  key={`project-${p.id}`}
                  value={`project ${p.name}`}
                  onSelect={() => {
                    navigate({ to: '/projects/$id', params: { id: p.id } });
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary rounded cursor-pointer data-[selected=true]:bg-surface-raised data-[selected=true]:text-text-primary"
                >
                  {p.name}
                  <span className="ml-auto text-xs text-text-tertiary">{p.status}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Navigation commands */}
          <Command.Group heading="Navigation" className="text-xs text-text-tertiary px-2 py-1">
            {navCommands.map((cmd) => (
              <Command.Item
                key={cmd.to}
                value={cmd.label}
                onSelect={() => {
                  navigate({ to: cmd.to as '/' });
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary rounded cursor-pointer data-[selected=true]:bg-surface-raised data-[selected=true]:text-text-primary"
              >
                {cmd.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
