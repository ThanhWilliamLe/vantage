import { AppError } from './app-error.js';

export type AIErrorType =
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_AUTH_FAILED'
  | 'AI_PARSE_FAILED'
  | 'AI_CONTEXT_TOO_LARGE'
  | 'AI_TIMEOUT'
  | 'AI_UNKNOWN';

export class AIError extends AppError {
  readonly code: AIErrorType;

  get statusCode(): number {
    switch (this.code) {
      case 'AI_PROVIDER_UNAVAILABLE': return 503;
      case 'AI_RATE_LIMITED': return 429;
      case 'AI_AUTH_FAILED': return 502;
      case 'AI_PARSE_FAILED': return 502;
      case 'AI_CONTEXT_TOO_LARGE': return 502;
      case 'AI_TIMEOUT': return 504;
      default: return 502;
    }
  }

  constructor(message: string, code: AIErrorType, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}
