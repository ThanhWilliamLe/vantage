/** Metadata returned from GitHub PR list endpoint */
export interface PRMetadata {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  headBranch: string;
  authorLogin: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

/** Extended metadata from a single PR detail fetch */
export interface PRDetailMetadata extends PRMetadata {
  commitSHAs: string[];
}
