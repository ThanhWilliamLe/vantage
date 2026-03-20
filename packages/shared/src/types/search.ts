export interface SearchResults {
  changes: SearchHit<CodeChangeSearchResult>[];
  evaluations: SearchHit<EvaluationSearchResult>[];
}

export interface SearchHit<T> {
  score: number;
  item: T;
}

export interface CodeChangeSearchResult {
  id: string;
  title: string;
  aiSummary: string | null;
  status: string;
  authoredAt: string;
  authorMemberId: string | null;
  authorRaw: string;
  authorName: string | null;
  linesAdded: number;
  linesDeleted: number;
  projectId: string;
}

export interface EvaluationSearchResult {
  id: string;
  type: 'daily' | 'quarterly';
  date: string;
  memberId: string;
  description: string | null;
}
