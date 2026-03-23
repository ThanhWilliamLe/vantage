export interface BatchResult<T = unknown> {
  succeeded: T[];
  failed: Array<{ id: string; error: string }>;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AIQueueStatus {
  total: number;
  completed: number;
  failed: number;
  processing: boolean;
}

/** Filters for scan and sync operations. */
export interface SyncFilters {
  projectId?: string;
  repoId?: string;
  since?: string; // ISO 8601 date
}

/** Result from POST /api/scan */
export interface ScanBatchResult {
  reposScanned: number;
  reposSkipped: number;
  reposFailed: number;
  totalNewCommits: number;
  results: Array<{
    repoId: string;
    projectId: string;
    localPath: string;
    status: 'scanned' | 'skipped' | 'failed';
    newCommits: number;
    error?: string;
  }>;
}

/** Result from POST /api/sync */
export interface SyncBatchResult {
  reposSynced: number;
  reposSkipped: number;
  reposFailed: number;
  totalNewItems: number;
  results: Array<{
    repoId: string;
    projectId: string;
    platform: string;
    status: 'synced' | 'skipped' | 'failed';
    newItems: number;
    updatedItems: number;
    error?: string;
  }>;
}

/** Combined result from useSyncAll (calls both scan + sync) */
export interface CombinedSyncResult {
  scan: ScanBatchResult;
  sync: SyncBatchResult;
}
