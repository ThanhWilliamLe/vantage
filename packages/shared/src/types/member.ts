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
  platform: 'github' | 'gitlab' | 'email';
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
