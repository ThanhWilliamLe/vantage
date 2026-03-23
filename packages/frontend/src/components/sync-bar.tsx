import { SyncButton } from './sync-button.js';

export function SyncBar() {
  return (
    <div
      className="mt-4 flex items-center px-4 py-2 bg-surface-raised border border-border rounded-sm"
      data-testid="sync-bar"
    >
      <SyncButton variant="primary" showDropdown showStatus />
    </div>
  );
}
