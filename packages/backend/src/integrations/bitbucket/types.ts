/** Metadata returned from Bitbucket PR list endpoint */
export interface BitbucketPRMetadata {
  id: number;
  title: string;
  description: string | null;
  state: string;
  draft: boolean;
  headBranch: string;
  authorLogin: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

/** Extended metadata from a single Bitbucket PR detail fetch */
export interface BitbucketPRDetailMetadata extends BitbucketPRMetadata {
  commitSHAs: string[];
}
