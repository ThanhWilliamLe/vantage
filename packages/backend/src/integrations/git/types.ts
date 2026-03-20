export interface RawCommit {
  hash: string;
  authorEmail: string;
  authorName: string;
  authorDate: string;
  subject: string;
  body: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  branch: string | null;
}

export interface DiffStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}
