import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client.js';
import type {
  Project,
  Member,
  CodeChange,
  Assignment,
  SearchResults,
  AIQueueStatus,
  BarChartResponse,
  TrendChartResponse,
  HeatmapChartResponse,
  IdentitySuggestion,
  SyncFilters,
  ScanBatchResult,
  SyncBatchResult,
  CombinedSyncResult,
  ScanState,
  SyncState,
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
  identitySuggestions: ['identity-suggestions'] as const,
  workloadChartBar: (startDate: string, endDate: string) =>
    ['workload-chart-bar', startDate, endDate] as const,
  workloadChartTrend: (startDate: string, endDate: string, memberId?: string, projectId?: string) =>
    ['workload-chart-trend', startDate, endDate, memberId, projectId] as const,
  workloadChartHeatmap: (startDate: string, endDate: string) =>
    ['workload-chart-heatmap', startDate, endDate] as const,
  scanStatus: ['scan-status'] as const,
  syncStatus: ['sync-status'] as const,
};

// ── Query response types ────────────────────────────────────

export interface PaginatedCodeChanges {
  items: CodeChange[];
  total: number;
  limit: number;
  offset: number;
}

export interface HistoryResponse {
  items: CodeChange[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkloadResponse {
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

export interface EvaluationsResponse {
  items: import('@twle/vantage-shared').EvaluationEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface DiffResponse {
  diff: string;
  truncated: boolean;
}

export interface DeepAnalysisResponse {
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

export interface DailyPrefillResponse {
  description: string;
  workloadScore: number | null;
}

export interface QuarterlySynthesisResponse {
  description: string;
  workloadScore: number | null;
  insights: Array<{ type: string; description: string }>;
}

export interface DetectedTask {
  taskId: string;
  url: string;
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

export function useSearch(query: string, scope = 'all') {
  return useQuery({
    queryKey: queryKeys.search(query, scope),
    queryFn: () =>
      apiClient.get<SearchResults>(`/api/search?q=${encodeURIComponent(query)}&scope=${scope}`),
    enabled: query.length >= 2,
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

export function useAIStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => apiClient.get<AIQueueStatus>('/api/ai/status'),
    refetchInterval: 5000,
  });
}

// ── Workload Chart hooks (v1.1 M12) ────────────────────────

export function useWorkloadChartBar(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.workloadChartBar(startDate, endDate),
    queryFn: () =>
      apiClient.get<BarChartResponse>(
        `/api/workload/charts/bar?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      ),
    enabled: !!startDate && !!endDate,
  });
}

export function useWorkloadChartTrend(
  startDate: string,
  endDate: string,
  memberId?: string,
  projectId?: string,
) {
  const params = new URLSearchParams({ startDate, endDate });
  if (memberId) params.set('memberId', memberId);
  if (projectId) params.set('projectId', projectId);
  return useQuery({
    queryKey: queryKeys.workloadChartTrend(startDate, endDate, memberId, projectId),
    queryFn: () =>
      apiClient.get<TrendChartResponse>(`/api/workload/charts/trend?${params.toString()}`),
    enabled: !!startDate && !!endDate,
  });
}

export function useWorkloadChartHeatmap(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.workloadChartHeatmap(startDate, endDate),
    queryFn: () =>
      apiClient.get<HeatmapChartResponse>(
        `/api/workload/charts/heatmap?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      ),
    enabled: !!startDate && !!endDate,
  });
}

// ── Identity Suggestion hooks (M16 Feature 2.7) ────────────

export function useIdentitySuggestions() {
  return useQuery({
    queryKey: queryKeys.identitySuggestions,
    queryFn: () => apiClient.get<IdentitySuggestion[]>('/api/members/identity-suggestions'),
  });
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { authorRaw: string; memberId: string; platform: string }) =>
      apiClient.post('/api/members/identity-suggestions/accept', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.identitySuggestions });
      queryClient.invalidateQueries({ queryKey: queryKeys.members });
      queryClient.invalidateQueries({ queryKey: ['pending-queue'] });
    },
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { authorRaw: string; suggestedMemberId: string }) =>
      apiClient.post('/api/members/identity-suggestions/reject', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.identitySuggestions });
      qc.invalidateQueries({ queryKey: ['members'] as const });
    },
  });
}

// ── Sync hooks (Sync Now feature) ───────────────────────

/** Trigger scan of local repos with optional filters. */
export function useScanRepos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters?: SyncFilters) =>
      apiClient.post<ScanBatchResult>('/api/scan', filters ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['workload'] });
      qc.invalidateQueries({ queryKey: queryKeys.scanStatus });
    },
  });
}

/** Trigger sync of API repos with optional filters. */
export function useSyncRepos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters?: SyncFilters) =>
      apiClient.post<SyncBatchResult>('/api/sync', filters ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['workload'] });
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus });
    },
  });
}

/** Combined sync: calls both scan + sync, returns merged result. */
export function useSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filters?: SyncFilters): Promise<CombinedSyncResult> => {
      const [scan, sync] = await Promise.all([
        apiClient.post<ScanBatchResult>('/api/scan', filters ?? {}),
        apiClient.post<SyncBatchResult>('/api/sync', filters ?? {}),
      ]);
      return { scan, sync };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-queue'] });
      qc.invalidateQueries({ queryKey: ['code-changes'] });
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['workload'] });
      qc.invalidateQueries({ queryKey: queryKeys.scanStatus });
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus });
    },
  });
}

/** Poll scan state. Enable only while a scan mutation is pending. */
export function useScanStatus(enabled = false) {
  return useQuery({
    queryKey: queryKeys.scanStatus,
    queryFn: () => apiClient.get<ScanState[]>('/api/scan/status'),
    enabled,
    refetchInterval: 3000,
  });
}

/** Poll sync state. Enable only while a sync mutation is pending. */
export function useSyncStatus(enabled = false) {
  return useQuery({
    queryKey: queryKeys.syncStatus,
    queryFn: () => apiClient.get<SyncState[]>('/api/sync/status'),
    enabled,
    refetchInterval: 3000,
  });
}

// ── Unmapped Authors (FB-15 Identity Mapping Dropdown) ───

export function useUnmappedAuthors(platform: string) {
  return useQuery({
    queryKey: ['unmapped-authors', platform] as const,
    queryFn: () =>
      apiClient.get<Array<{ value: string; commitCount: number }>>(
        `/api/code-changes/unmapped-authors?platform=${platform}`,
      ),
    enabled: !!platform,
  });
}
