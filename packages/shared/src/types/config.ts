export interface AppConfig {
  id: string;
  accessPasswordHash: string | null;
  aiAutoTier1: boolean;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScanState {
  id: string;
  repoId: string;
  lastCommitHash: string | null;
  lastScannedAt: string | null;
  status: 'idle' | 'scanning' | 'failed';
  errorMessage: string | null;
  updatedAt: string;
}

export interface SyncState {
  id: string;
  repoId: string;
  lastSyncCursor: string | null;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'failed';
  errorMessage: string | null;
  updatedAt: string;
}
