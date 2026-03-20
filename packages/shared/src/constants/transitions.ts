import type { ReviewStatus } from './statuses.js';

export const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending: ['reviewed', 'flagged'],
  reviewed: ['flagged'],
  flagged: ['communicated', 'reviewed'],
  communicated: ['resolved', 'reviewed'],
  resolved: [],
};

export function isValidTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
