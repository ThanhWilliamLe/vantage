import { AppError } from './app-error.js';

export type GitErrorCode =
  | 'GIT_NOT_INSTALLED'
  | 'GIT_REPO_NOT_FOUND'
  | 'GIT_NOT_A_REPO'
  | 'GIT_PERMISSION_DENIED'
  | 'GIT_INVALID_HASH'
  | 'GIT_TIMEOUT'
  | 'GIT_CORRUPT_REPO'
  | 'GIT_UNKNOWN';

export class GitError extends AppError {
  readonly statusCode = 502;
  readonly code: GitErrorCode;
  readonly cause?: Error;

  constructor(
    message: string,
    code: GitErrorCode,
    details?: { repoPath?: string },
    cause?: Error,
  ) {
    super(message, details as Record<string, unknown>);
    this.code = code;
    this.cause = cause;
  }
}
