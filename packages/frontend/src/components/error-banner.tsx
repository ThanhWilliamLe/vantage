import { create } from 'zustand';

interface ErrorBannerState {
  errors: Map<string, string>;
  addError: (key: string, message: string) => void;
  removeError: (key: string) => void;
  clearAll: () => void;
}

export const useErrorBannerStore = create<ErrorBannerState>((set) => ({
  errors: new Map(),
  addError: (key, message) =>
    set((s) => {
      const next = new Map(s.errors);
      next.set(key, message);
      return { errors: next };
    }),
  removeError: (key) =>
    set((s) => {
      const next = new Map(s.errors);
      next.delete(key);
      return { errors: next };
    }),
  clearAll: () => set({ errors: new Map() }),
}));

export function ErrorBanner() {
  const errors = useErrorBannerStore((s) => s.errors);
  const removeError = useErrorBannerStore((s) => s.removeError);

  if (errors.size === 0) return null;

  return (
    <div data-testid="error-banner" className="space-y-1">
      {Array.from(errors.entries()).map(([key, message]) => (
        <div
          key={key}
          className="flex items-center justify-between px-4 py-2 bg-danger/10 border-b border-danger/20 text-danger text-sm"
        >
          <span>{message}</span>
          <button
            onClick={() => removeError(key)}
            className="ml-4 text-danger/60 hover:text-danger text-xs"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
