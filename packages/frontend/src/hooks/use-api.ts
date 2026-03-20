import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client.js';
import type {
  Project,
  Repository,
  TaskPattern,
  Member,
  MemberIdentity,
  CodeChange,
  EvaluationEntry,
  GitCredential,
  AIProvider,
  Assignment,
  SearchResults,
  AIQueueStatus,
} from '@twle/vantage-shared';

// ── Query keys ──────────────────────────────────────────────

export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectAssignments: (id: string) => ['projects', id, 'assignments'] as const,
  members: ['members'] as const,
  member: (id: string) => ['members', id] as const,
  memberAssignments: (id: string) => ['members', id, 'assignments'] as const,
  memberIdentities: (id: string) => ['members', id, 'identities'] as const,
  codeChanges: (filters?: Record<string, string>) => ['code-changes', filters] as const,
  codeChange: (id: string) => ['code-changes', id] as const,
  pendingQueue: (filters?: Record<string, string>) => ['pending-queue', filters] as const,
  history: (filters?: Record<string, string>) => ['history', filters] as const,
  evaluations: (filters?: Record<string, string>) => ['evaluations', filters] as const,
  workload: (startDate: string, endDate: string) => ['workload', startDate, endDate] as const,
  search: (query: string, scope: string) => ['search', query, scope] as const,
  aiStatus: ['ai-status'] as const,
  projectRepositories: (projectId: string) => ['projects', projectId, 'repositories'] as const,
  projectTaskPatterns: (projectId: string) => ['projects', projectId, 'task-patterns'] as const,
  deepAnalysis: (codeChangeId: string) => ['deep-analysis', codeChangeId] as const,
  credentials: ['credentials'] as const,
  aiProviders: ['ai-providers'] as const,
};

// ── Query response types ────────────────────────────────────

interface PaginatedCodeChanges {
  items: CodeChange[];
  total: number;
  limit: number;
  offset: number;
}

interface HistoryResponse {
  items: CodeChange[];
  total: number;
  limit: number;
  offset: number;
}

interface WorkloadResponse {
  startDate: string;
  endDate: string;
  byMember: Array<{
    memberId: string | null;
    authorName: string | null;
    commitCount: number;
    linesAdded: number;
    linesDeleted: number;
    filesChanged: number;
  }>;
  byProject: Array<{
    projectId: string;
    commitCount: number;
    linesAdded: number;
    linesDeleted: number;
    filesChanged: number;
  }>;
}

interface EvaluationsResponse {
  items: EvaluationEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ── Query hooks ─────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiClient.get<Project[]>('/api/projects'),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => apiClient.get<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectAssignments(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectAssignments(projectId),
    queryFn: () => apiClient.get<Assignment[]>(`/api/projects/${projectId}/assignments`),
    enabled: !!projectId,
  });
}

export function useMembers() {
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => apiClient.get<Member[]>('/api/members'),
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: queryKeys.member(id),
    queryFn: () => apiClient.get<Member>(`/api/members/${id}`),
    enabled: !!id,
  });
}

export function useMemberAssignments(memberId: string) {
  return useQuery({
    queryKey: queryKeys.memberAssignments(memberId),
    queryFn: () => apiClient.get<Assignment[]>(`/api/members/${memberId}/assignments`),
    enabled: !!memberId,
  });
}

export function useCodeChanges(filters?: Record<string, string>) {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return useQuery({
    queryKey: queryKeys.codeChanges(filters),
    queryFn: () => apiClient.get<PaginatedCodeChanges>(`/api/code-changes${params}`),
  });
}

export interface DetectedTask {
  taskId: string;
  url: string;
}

export function useCodeChange(id: string) {
  return useQuery({
    queryKey: queryKeys.codeChange(id),
    queryFn: () =>
      apiClient.get<CodeChange & { taskIds?: DetectedTask[] }>(`/api/code-changes/${id}`),
    enabled: !!id,
  });
}

export function usePendingQueue(filters?: Record<string, string>) {
  const base = { status: 'pending', ...(filters || {}) };
  const params = '?' + new URLSearchParams(base).toString();
  return useQuery({
    queryKey: queryKeys.pendingQueue(filters),
    queryFn: () => apiClient.get<PaginatedCodeChanges>(`/api/code-changes${params}`),
  });
}

export function useHistory(filters?: Record<string, string>) {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return useQuery({
    queryKey: queryKeys.history(filters),
    queryFn: () => apiClient.get<HistoryResponse>(`/api/code-changes/history${params}`),
  });
}

export function useEvaluations(filters?: Record<string, string>) {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return useQuery({
    queryKey: queryKeys.evaluations(filters),
    queryFn: () => apiClient.get<EvaluationsResponse>(`/api/evaluations${params}`),
  });
}

export function useWorkload(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.workload(startDate, endDate),
    queryFn: () =>
      apiClient.get<WorkloadResponse>(
        `/api/workload?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      ),
    enabled: !!startDate && !!endDate,
  });
}

export function useSearch(query: string, scope = 'all') {
  return useQuery({
    queryKey: queryKeys.search(query, scope),
    queryFn: () =>
      apiClient.get<SearchResults>(`/api/search?q=${encodeURIComponent(query)}&scope=${scope}`),
    enabled: query.length >= 2,
  });
}

export function useAIStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => apiClient.get<AIQueueStatus>('/api/ai/status'),
    refetchInterval: 5000,
  });
}

export function useCredentials() {
  return useQuery({
    queryKey: queryKeys.credentials,
    queryFn: () => apiClient.get<GitCredential[]>('/api/credentials'),
  });
}

export function useAIProviders() {
  return useQuery({
    queryKey: queryKeys.aiProviders,
    queryFn: () => apiClient.get<AIProvider[]>('/api/ai-providers'),
  });
}

// ── Mutation hooks ──────────────────────────────────────────

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiClient.post<Project>('/api/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      status?: string;
    }) => apiClient.put<Project>(`/api/projects/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => apiClient.post<Member>('/api/members', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; status?: string }) =>
      apiClient.put<Member>(`/api/members/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

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
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
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
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

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

export function useCreateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; platform: string; token: string; instanceUrl?: string }) =>
      apiClient.post('/api/credentials', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}

export function useTestCredential() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/api/credentials/${id}/test`, {}),
  });
}

export function useDeleteCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/credentials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}

export function useCreateAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    }) => apiClient.post('/api/ai-providers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiProviders });
    },
  });
}

export function useActivateAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/ai-providers/${id}/activate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiProviders });
    },
  });
}

export function useDeleteAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/ai-providers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiProviders });
    },
  });
}

export function useSetPassword() {
  return useMutation({
    mutationFn: (password: string) => apiClient.post('/api/auth/set-password', { password }),
  });
}

export function useRemovePassword() {
  return useMutation({
    mutationFn: () => apiClient.del('/api/auth/password'),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { memberId: string; projectId: string; role?: string; startDate: string }) =>
      apiClient.post<Assignment>('/api/assignments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useEndAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: string }) =>
      apiClient.put<Assignment>(`/api/assignments/${id}`, { endDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useMemberIdentities(memberId: string) {
  return useQuery({
    queryKey: queryKeys.memberIdentities(memberId),
    queryFn: async () => {
      const member = await apiClient.get<Member & { identities: MemberIdentity[] }>(
        `/api/members/${memberId}`,
      );
      return member.identities ?? [];
    },
    enabled: !!memberId,
  });
}

export function useAddIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      platform,
      value,
    }: {
      memberId: string;
      platform: string;
      value: string;
    }) =>
      apiClient.post<MemberIdentity>(`/api/members/${memberId}/identities`, { platform, value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useRemoveIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (identityId: string) => apiClient.del(`/api/identities/${identityId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

// ── Repository hooks ───────────────────────────────────────

export function useProjectRepositories(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectRepositories(projectId),
    queryFn: () => apiClient.get<Repository[]>(`/api/projects/${projectId}/repositories`),
    enabled: !!projectId,
  });
}

export function useCreateRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...data
    }: {
      projectId: string;
      type: string;
      localPath?: string;
      apiOwner?: string;
      apiRepo?: string;
      apiUrl?: string;
      credentialId?: string;
    }) => apiClient.post<Repository>(`/api/projects/${projectId}/repositories`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/repositories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ── Task Pattern hooks ─────────────────────────────────────

export function useProjectTaskPatterns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectTaskPatterns(projectId),
    queryFn: () => apiClient.get<TaskPattern[]>(`/api/projects/${projectId}/task-patterns`),
    enabled: !!projectId,
  });
}

export function useCreateTaskPattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...data
    }: {
      projectId: string;
      regex: string;
      urlTemplate: string;
    }) => apiClient.post<TaskPattern>(`/api/projects/${projectId}/task-patterns`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteTaskPattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/task-patterns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ── Evaluation AI hooks ────────────────────────────────────

interface DailyPrefillResponse {
  description: string;
  workloadScore: number | null;
}

interface QuarterlySynthesisResponse {
  description: string;
  workloadScore: number | null;
  insights: Array<{ type: string; description: string }>;
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

export function useDayActivity(date: string) {
  const startDate = `${date}T00:00:00.000Z`;
  const endDate = `${date}T23:59:59.999Z`;
  return useQuery({
    queryKey: ['day-activity', date] as const,
    queryFn: () =>
      apiClient.get<WorkloadResponse>(
        `/api/workload?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      ),
    enabled: !!date,
  });
}

// ── Diff viewer hook ─────────────────────────────────────────

interface DiffResponse {
  diff: string;
  truncated: boolean;
}

export function useCodeChangeDiff(id: string) {
  return useQuery({
    queryKey: [...queryKeys.codeChange(id), 'diff'] as const,
    queryFn: () => apiClient.get<DiffResponse>(`/api/code-changes/${id}/diff`),
    enabled: !!id,
  });
}

// ── Flagged item lifecycle hooks ─────────────────────────────

export function useCommunicateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<CodeChange>(`/api/code-changes/${id}/communicate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useResolveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<CodeChange>(`/api/code-changes/${id}/resolve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

// ── Deep analysis hooks ──────────────────────────────────────

interface DeepAnalysisResponse {
  id: string;
  codeChangeId: string;
  findings: Array<{
    severity: 'high' | 'medium' | 'low' | 'info';
    category: 'bug' | 'security' | 'quality' | 'performance' | 'style';
    description: string;
    file: string | null;
    line: number | null;
  }>;
  repoFilesAccessed: string[];
  analyzedAt: string;
  createdAt: string;
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

// ── Resolution hint: recent changes by same project ──────────

export function useRecentChangesByProject(projectId: string, enabled: boolean) {
  const params = new URLSearchParams({ projectId, limit: '10' }).toString();
  return useQuery({
    queryKey: ['code-changes', 'recent-by-project', projectId] as const,
    queryFn: () =>
      apiClient.get<{ items: CodeChange[]; total: number }>(`/api/code-changes?${params}`),
    enabled: enabled && !!projectId,
  });
}
