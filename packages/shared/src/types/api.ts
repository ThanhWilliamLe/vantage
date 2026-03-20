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
