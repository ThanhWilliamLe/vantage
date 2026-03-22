import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useUIStore } from '../stores/ui-store.js';
import { usePendingQueue } from '../hooks/api/core.js';

interface NavItem {
  label: string;
  to: string;
  badgeKey?: 'pending';
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    heading: 'Main',
    items: [
      { label: 'Dashboard', to: '/' },
      { label: 'Review Queue', to: '/reviews', badgeKey: 'pending' },
      { label: 'Review History', to: '/reviews/history' },
    ],
  },
  {
    heading: 'People',
    items: [
      { label: 'Members', to: '/members' },
      { label: 'Projects', to: '/projects' },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Evaluations', to: '/evaluations' },
      { label: 'Workload', to: '/workload' },
    ],
  },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const navigate = useNavigate();
  const pending = usePendingQueue();
  const pendingCount = pending.data?.total ?? 0;

  function getBadge(item: NavItem): number | undefined {
    if (item.badgeKey === 'pending' && pendingCount > 0) return pendingCount;
    return undefined;
  }

  function renderItem(item: NavItem) {
    const isActive = item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to);
    const badge = getBadge(item);
    return (
      <button
        key={item.to}
        onClick={() => navigate({ to: item.to as '/' })}
        className={`flex items-center gap-2 px-3 py-2 mx-1 rounded text-sm transition-colors w-full text-left ${
          isActive
            ? 'bg-surface-raised text-accent-text'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
        }`}
      >
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && badge !== undefined && (
          <span className="ml-auto bg-danger text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      data-testid="sidebar"
      className={`flex flex-col bg-surface border-r border-border transition-all ${collapsed ? 'w-14' : 'w-56'}`}
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!collapsed && (
          <span className="text-sm font-semibold text-text-primary tracking-wide">Vantage</span>
        )}
        <button
          onClick={toggleSidebar}
          className="text-text-tertiary hover:text-text-primary text-xs px-1"
          aria-label="Toggle sidebar"
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.heading} className="mb-1">
            {!collapsed && (
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
                {section.heading}
              </div>
            )}
            {section.items.map(renderItem)}
          </div>
        ))}

        {/* Settings — separated */}
        <div className="mt-auto border-t border-border-subtle mx-2 pt-1">
          {renderItem({ label: 'Settings', to: '/settings' })}
        </div>
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-border">
          <button
            onClick={toggleCommandPalette}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-surface-raised border border-border-subtle text-text-tertiary text-xs hover:text-text-secondary"
          >
            <span>Search...</span>
            <kbd className="ml-auto text-[10px] border border-border rounded px-1">Ctrl+K</kbd>
          </button>
        </div>
      )}
    </aside>
  );
}
