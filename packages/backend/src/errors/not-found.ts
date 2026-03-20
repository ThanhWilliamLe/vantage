import { AppError } from './app-error.js';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(entity: string, id: string) {
    super(`${entity} not found`, { entity, id });
  }
}
