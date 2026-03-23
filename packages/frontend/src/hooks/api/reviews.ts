import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client.js';
import type { CodeChange } from '@twle/vantage-shared';
import { queryKeys } from './core.js';
import type { HistoryResponse, DiffResponse, DeepAnalysisResponse } from './core.js';

// ── Review query hooks ──────────────────────────────────────

export function useHistory(filters?: Record<string, string>) {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return useQuery({
    queryKey: queryKeys.history(filters),
    queryFn: () => apiClient.get<HistoryResponse>(`/api/code-changes/history${params}`),
  });
}

export function useCodeChangeDiff(id: string) {
  return useQuery({
    queryKey: [...queryKeys.codeChange(id), 'diff'] as const,
    queryFn: () => apiClient.get<DiffResponse>(`/api/code-changes/${id}/diff`),
    enabled: !!id,
  });
}

export function useDeepAnalysis(codeChangeId: string) {
  return useQuery({
    queryKey: queryKeys.deepAnalysis(codeChangeId),
    queryFn: () =>
      apiClient.get<DeepAnalysisResponse>(`/api/code-changes/${codeChangeId}/deep-analysis`),
    enabled: !!codeChangeId,
    retry: false,
  });
}

// ── Review mutation hooks ───────────────────────────────────

export function useReviewAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      notes,
      reason,
    }: {
      id: string;
      action: 'review' | 'flag' | 'defer';
      notes?: string;
      reason?: string;
    }) => {
      if (action === 'review') return apiClient.post(`/api/code-changes/${id}/review`, { notes });
      if (action === 'flag') return apiClient.post(`/api/code-changes/${id}/flag`, { reason });
      return apiClient.post(`/api/code-changes/${id}/defer`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] as const });
      qc.invalidateQueries({ queryKey: ['code-changes'] as const });
      qc.invalidateQueries({ queryKey: ['history'] as const });
    },
  });
}

export function useBatchAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      ids: string[];
      action: 'review' | 'flag' | 'defer';
      notes?: string;
      flagReason?: string;
    }) => apiClient.post('/api/code-changes/batch-action', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] as const });
      qc.invalidateQueries({ queryKey: ['code-changes'] as const });
      qc.invalidateQueries({ queryKey: ['history'] as const });
    },
  });
}

export function useCommunicateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<CodeChange>(`/api/code-changes/${id}/communicate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] as const });
      qc.invalidateQueries({ queryKey: ['code-changes'] as const });
      qc.invalidateQueries({ queryKey: ['history'] as const });
    },
  });
}

export function useResolveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<CodeChange>(`/api/code-changes/${id}/resolve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] as const });
      qc.invalidateQueries({ queryKey: ['code-changes'] as const });
      qc.invalidateQueries({ queryKey: ['history'] as const });
    },
  });
}

export function useRequestDeepAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ codeChangeId, force }: { codeChangeId: string; force?: boolean }) =>
      apiClient.post<DeepAnalysisResponse>('/api/ai/deep-analysis', { codeChangeId, force }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.deepAnalysis(variables.codeChangeId) });
    },
  });
}

export function useRecentChangesByProject(projectId: string, enabled: boolean) {
  const params = new URLSearchParams({ projectId, limit: '10' }).toString();
  return useQuery({
    queryKey: ['code-changes', 'recent-by-project', projectId] as const,
    queryFn: () =>
      apiClient.get<{ items: CodeChange[]; total: number }>(`/api/code-changes?${params}`),
    enabled: enabled && !!projectId,
  });
}
