export type ReviewStatus = 'pending' | 'reviewed' | 'flagged' | 'communicated' | 'resolved';
export type ProjectStatus = 'active' | 'archived';
export type MemberStatus = 'active' | 'inactive';
export type ScanStatus = 'idle' | 'scanning' | 'failed';
export type SyncStatus = 'idle' | 'syncing' | 'failed';
export type PRStatus = 'open' | 'merged' | 'closed' | 'draft';

export const REVIEW_STATUSES: readonly ReviewStatus[] = ['pending', 'reviewed', 'flagged', 'communicated', 'resolved'] as const;
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'archived'] as const;
export const MEMBER_STATUSES: readonly MemberStatus[] = ['active', 'inactive'] as const;
