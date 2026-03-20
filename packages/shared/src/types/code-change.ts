import type { ReviewStatus, PRStatus } from '../constants/statuses.js';
import type { AICategory, AIRiskLevel } from '../constants/categories.js';

export interface CodeChange {
  id: string;
  projectId: string;
  repoId: string;
  type: 'commit' | 'pr' | 'mr';
  platformId: string;
  branch: string | null;
  title: string;
  body: string | null;
  authorMemberId: string | null;
  authorRaw: string;
  authorName: string | null;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  authoredAt: string;
  fetchedAt: string;
  status: ReviewStatus;
  prStatus: PRStatus | null;
  aiSummary: string | null;
  aiCategory: AICategory | null;
  aiRiskLevel: AIRiskLevel | null;
  aiGeneratedAt: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  flaggedAt: string | null;
  flagReason: string | null;
  deferredAt: string | null;
  deferCount: number;
  communicatedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeepAnalysis {
  id: string;
  codeChangeId: string;
  findings: Finding[];
  repoFilesAccessed: string[] | null;
  analyzedAt: string;
  createdAt: string;
}

export interface Finding {
  severity: 'high' | 'medium' | 'low' | 'info';
  category: 'bug' | 'security' | 'quality' | 'performance' | 'style';
  description: string;
  file: string | null;
  line: number | null;
}

export interface DiffStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}
