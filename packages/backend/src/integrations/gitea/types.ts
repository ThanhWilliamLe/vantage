/** Metadata returned from Gitea PR list endpoint */
export interface GiteaPRMetadata {
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

/** Extended metadata from a single Gitea PR detail fetch */
export interface GiteaPRDetailMetadata extends GiteaPRMetadata {
  commitSHAs: string[];
}
