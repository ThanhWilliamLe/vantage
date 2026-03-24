export interface EvaluationEntry {
  id: string;
  memberId: string;
  type: 'daily' | 'quarterly';
  date: string;
  dateRangeStart: string | null;
  quarter: string | null;
  projectIds: string[];
  description: string | null;
  workloadScore: number | null;
  notes: string | null;
  aiInsights: AIInsight[] | null;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIInsight {
  type: 'trend' | 'workload_shift' | 'consistency' | 'focus_shift';
  description: string;
}
