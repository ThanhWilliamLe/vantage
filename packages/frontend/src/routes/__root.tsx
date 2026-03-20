import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Sidebar } from '../components/sidebar.js';
import { CommandPalette } from '../components/command-palette.js';
import { ErrorBanner } from '../components/error-banner.js';
import { ToastProvider } from '../components/toast-provider.js';
import { useUIStore } from '../stores/ui-store.js';

function RootLayout() {
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  // Global keyboard shortcuts (M10)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K → command palette (handled in CommandPalette too, but kept for consistency)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      // '/' → command palette (spec: interaction-model.md line 46)
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      // Escape → close overlays
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleCommandPalette, setCommandPaletteOpen]);

  return (
    <div className="flex h-screen bg-base text-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBanner />
        <div className="p-6">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <ToastProvider />
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
