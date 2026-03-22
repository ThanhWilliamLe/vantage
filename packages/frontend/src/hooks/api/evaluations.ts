import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client.js';
import type { EvaluationEntry } from '@twle/vantage-shared';
import { queryKeys } from './core.js';
import type {
  EvaluationsResponse,
  DailyPrefillResponse,
  QuarterlySynthesisResponse,
} from './core.js';

// ── Evaluation query hooks ──────────────────────────────────

export function useEvaluations(filters?: Record<string, string>) {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return useQuery({
    queryKey: queryKeys.evaluations(filters),
    queryFn: () => apiClient.get<EvaluationsResponse>(`/api/evaluations${params}`),
  });
}

export function useDailyPrefill(date: string, memberId: string) {
  return useQuery({
    queryKey: ['daily-prefill', date, memberId] as const,
    queryFn: () =>
      apiClient.get<DailyPrefillResponse>(
        `/api/evaluations/daily-prefill?date=${encodeURIComponent(date)}&memberId=${encodeURIComponent(memberId)}`,
      ),
    enabled: false, // Only fetch on demand via refetch()
  });
}

export function useQuarterlySynthesis(quarter: string, memberId: string) {
  return useQuery({
    queryKey: ['quarterly-synthesis', quarter, memberId] as const,
    queryFn: () =>
      apiClient.get<QuarterlySynthesisResponse>(
        `/api/evaluations/quarterly-synthesis?quarter=${encodeURIComponent(quarter)}&memberId=${encodeURIComponent(memberId)}`,
      ),
    enabled: false, // Only fetch on demand via refetch()
  });
}

// ── Evaluation mutation hooks ───────────────────────────────

export function useCreateEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      memberId: string;
      date?: string;
      quarter?: string;
      projectIds: string[];
      description?: string;
      workloadScore?: number;
      notes?: string;
    }) => apiClient.post<EvaluationEntry>('/api/evaluations', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

export function useUpdateEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      description?: string;
      workloadScore?: number;
      notes?: string;
    }) => apiClient.put<EvaluationEntry>(`/api/evaluations/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

export function useDeleteEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/evaluations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}
