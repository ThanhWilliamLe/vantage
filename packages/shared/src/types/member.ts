export interface Member {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface MemberIdentity {
  id: string;
  memberId: string;
  platform: 'github' | 'gitlab' | 'email' | 'bitbucket' | 'gitea';
  value: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  memberId: string;
  projectId: string;
  role: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface IdentitySuggestion {
  authorRaw: string;
  authorName: string | null;
  suggestedMemberId: string;
  suggestedMemberName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}
