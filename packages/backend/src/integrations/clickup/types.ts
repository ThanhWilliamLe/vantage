export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  name: string;
  status: { status: string } | null;
  assignees: Array<{ username: string }>;
  url: string | null;
}
