/** Metadata returned from GitLab MR list endpoint */
export interface MRMetadata {
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  draft: boolean;
  sourceBranch: string;
  authorUsername: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

/** Extended metadata from a single MR detail fetch */
export interface MRDetailMetadata extends MRMetadata {
  commitSHAs: string[];
}
