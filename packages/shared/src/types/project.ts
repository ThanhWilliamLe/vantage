export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: string;
  projectId: string;
  type: 'local' | 'github' | 'gitlab' | 'bitbucket' | 'gitea';
  localPath: string | null;
  apiOwner: string | null;
  apiRepo: string | null;
  apiUrl: string | null;
  credentialId: string | null;
  createdAt: string;
}

export interface TaskPattern {
  id: string;
  projectId: string;
  regex: string;
  urlTemplate: string;
  createdAt: string;
}
