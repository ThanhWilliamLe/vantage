import { AppError } from './app-error.js';

export class ExternalAPIError extends AppError {
  readonly statusCode = 502;
  readonly code = 'EXTERNAL_API_ERROR';

  constructor(
    message: string,
    details?: {
      platform?: 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'jira' | 'clickup';
      httpStatus?: number;
      rateLimitReset?: string;
    },
  ) {
    super(message, details as Record<string, unknown>);
  }
}
