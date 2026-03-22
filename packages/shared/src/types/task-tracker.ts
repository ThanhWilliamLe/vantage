export interface TaskMetadata {
  taskId: string;
  title: string;
  status: string;
  assignee: string | null;
  url: string;
  fetchedAt: string;
}

export interface TaskTrackerCredential {
  id: string;
  projectId: string;
  name: string;
  platform: 'jira' | 'clickup';
  instanceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
