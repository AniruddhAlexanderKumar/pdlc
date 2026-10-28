export const ISSUE_TYPES = ['Task', 'Bug', 'Story'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = ['Open', 'In Progress', 'Done'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  issueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  key: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  summary: string;
  description: string;
  labels: string[];
  reporterId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssuePage {
  items: Issue[];
  total: number;
  limit: number;
  offset: number;
}

export function formatIssueKey(projectKey: string, issueNumber: number): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new RangeError('Issue number must be a positive safe integer');
  }
  return `${projectKey}-${issueNumber}`;
}
