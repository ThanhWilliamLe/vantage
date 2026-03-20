export interface GitCredential {
  id: string;
  name: string;
  platform: 'github' | 'gitlab';
  tokenEncrypted: string;
  instanceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIProvider {
  id: string;
  name: string;
  type: 'api' | 'cli';
  preset: 'openai' | 'anthropic' | 'custom' | null;
  endpointUrl: string | null;
  apiKeyEncrypted: string | null;
  model: string | null;
  cliCommand: string | null;
  cliIoMethod: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
