import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client.js';
import type {
  Project,
  Repository,
  TaskPattern,
  Member,
  MemberIdentity,
  GitCredential,
  AIProvider,
  Assignment,
} from '@twle/vantage-shared';
import { queryKeys } from './core.js';

// ── Settings query hooks ────────────────────────────────────

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

export function useProjectRepositories(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectRepositories(projectId),
    queryFn: () => apiClient.get<Repository[]>(`/api/projects/${projectId}/repositories`),
    enabled: !!projectId,
  });
}

export function useProjectTaskPatterns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectTaskPatterns(projectId),
    queryFn: () => apiClient.get<TaskPattern[]>(`/api/projects/${projectId}/task-patterns`),
    enabled: !!projectId,
  });
}

// ── Project mutation hooks ──────────────────────────────────

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

// ── Member mutation hooks ───────────────────────────────────

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
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      status?: string;
      aliases?: string;
    }) => apiClient.put<Member>(`/api/members/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/members/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

// ── Credential mutation hooks ───────────────────────────────

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

export function useUpdateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; token?: string }) =>
      apiClient.put(`/api/credentials/${id}`, data),
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

// ── AI provider mutation hooks ──────────────────────────────

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

export function useUpdateAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      type?: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    }) => apiClient.put(`/api/ai-providers/${id}`, data),
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

export function useTestAIProvider() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; message: string; latencyMs?: number }>(
        `/api/ai-providers/${id}/test`,
        {},
      ),
  });
}

// ── Auth mutation hooks ─────────────────────────────────────

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

// ── Assignment mutation hooks ───────────────────────────────

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { memberId: string; projectId: string; role?: string; startDate: string }) =>
      apiClient.post<Assignment>('/api/assignments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useEndAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: string }) =>
      apiClient.put<Assignment>(`/api/assignments/${id}`, { endDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/assignments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ── Identity mutation hooks ─────────────────────────────────

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
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

export function useRemoveIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (identityId: string) => apiClient.del(`/api/identities/${identityId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

// ── Repository mutation hooks ───────────────────────────────

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

// ── Task pattern mutation hooks ─────────────────────────────

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

// ── Task tracker credential mutation hooks ──────────────────

export function useTaskTrackerCredentials(projectId: string) {
  return useQuery({
    queryKey: [...queryKeys.projects, projectId, 'task-tracker-credentials'],
    queryFn: () =>
      apiClient.get<
        {
          id: string;
          projectId: string;
          name: string;
          platform: string;
          instanceUrl: string | null;
          createdAt: string;
          updatedAt: string;
        }[]
      >(`/api/projects/${projectId}/task-tracker-credentials`),
    enabled: !!projectId,
  });
}

export function useCreateTaskTrackerCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...data
    }: {
      projectId: string;
      name: string;
      platform: string;
      token: string;
      instanceUrl?: string;
    }) => apiClient.post(`/api/projects/${projectId}/task-tracker-credentials`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateTaskTrackerCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      token?: string;
      instanceUrl?: string;
    }) => apiClient.put(`/api/task-tracker-credentials/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteTaskTrackerCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/task-tracker-credentials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ── Data management hooks ──────────────────────────────────

export function useDeleteAllData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/api/backup/delete-all', { confirm: 'DELETE ALL' }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}
