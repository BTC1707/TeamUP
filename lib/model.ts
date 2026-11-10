export type Member = { id: string; name: string; email: string; avatarUrl?: string };
export type Task = {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  due: string;
  status: 'todo' | 'progress' | 'done';
  milestone: string;
};
export type Milestone = {
  id: string;
  title: string;
  description?: string;
  due: string;
  done: boolean;
};
export type Project = {
  id: string;
  name: string;
  course: string;
  due: string;
  description: string;
  members: Member[];
  tasks: Task[];
  milestones: Milestone[];
  availability: Record<string, string[]>;
  reminderHours: number;
  version: number;
  owner?: string;
  groupId?: string;
};
export const future = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const emptyProject: Project = {
  id: '',
  name: '',
  course: '',
  due: '',
  description: '',
  members: [],
  tasks: [],
  milestones: [],
  availability: {},
  reminderHours: 24,
  version: 0,
};
