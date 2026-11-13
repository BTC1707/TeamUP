import { future, memberLabel, type Member, type Milestone, type Project, type Task } from '@/lib/model';

export type TaskDraft = {
  title: string;
  description?: string;
  assigneeName?: string;
  due?: string;
  milestoneTitle?: string;
};

export type TaskProposal = {
  type: 'tasks';
  id: string;
  summary: string;
  tasks: Task[];
  labels: string[];
};

function dateOk(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00'));
}

function earlierDate(a: string, b: string) {
  return a <= b ? a : b;
}

export function defaultTaskDue(projectDue?: string) {
  const tomorrow = future(1);
  if (projectDue && dateOk(projectDue)) return earlierDate(tomorrow, projectDue);
  return tomorrow;
}

export function normalizeTaskDue(raw: unknown, projectDue?: string) {
  if (typeof raw === 'string' && dateOk(raw.trim())) {
    const due = raw.trim();
    if (projectDue && dateOk(projectDue) && due > projectDue) return projectDue;
    return due;
  }
  return defaultTaskDue(projectDue);
}

function memberNames(member: Member) {
  return [member.nickname, member.name]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => !!value);
}

/** Match assigneeName to a member id, or '' if none. Returns null when ambiguous. */
export function resolveAssigneeId(name: unknown, members: Member[]) {
  if (typeof name !== 'string' || !name.trim()) return '';
  const needle = name.trim().toLowerCase();
  if (needle === 'me' || needle === 'myself') return null; // caller should substitute current user
  const exact = members.filter(
    (m) => memberNames(m).includes(needle) || m.email.toLowerCase() === needle,
  );
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const starts = members.filter(
    (m) =>
      memberNames(m).some(
        (value) => value.startsWith(needle) || value.split(/\s+/).some((part) => part.startsWith(needle)),
      ) || m.email.toLowerCase().startsWith(needle),
  );
  if (starts.length === 1) return starts[0].id;
  if (starts.length > 1) return null;

  const partial = members.filter(
    (m) => memberNames(m).some((value) => value.includes(needle)) || m.email.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return partial[0].id;
  if (partial.length > 1) return null;
  return null;
}

export function resolveMilestoneId(title: unknown, milestones: Milestone[]) {
  if (typeof title !== 'string' || !title.trim()) return '';
  const needle = title.trim().toLowerCase();
  const exact = milestones.filter((m) => m.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0].id;
  const partial = milestones.filter((m) => m.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0].id;
  return '';
}

export function formatTaskProposalLabel(task: Task, members: Member[]) {
  const who =
    members.find((m) => m.id === task.assignee)?.name ||
    (task.assignee ? 'Unknown member' : 'Unassigned');
  const due = new Date(task.due + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const desc = (task.description || '').trim();
  const descBit = desc ? ` — “${desc.length > 60 ? desc.slice(0, 57) + '…' : desc}”` : '';
  return `${task.title} — ${who} — ${due}${descBit}`;
}

export function draftsToProposal(
  drafts: TaskDraft[],
  project: Project,
  summary: string,
  currentUserId?: string,
): { proposal: TaskProposal | null; error: string | null; clarify: string | null } {
  if (!Array.isArray(drafts) || !drafts.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'What task should I add? Include a title, and optionally who it’s for and a due date.',
    };
  }
  if (project.tasks.length + drafts.length > 500) {
    return {
      proposal: null,
      error: 'This project already has too many tasks to add more right now.',
      clarify: null,
    };
  }

  const tasks: Task[] = [];
  for (const draft of drafts) {
    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    if (!title || title.length > 200) {
      return {
        proposal: null,
        error: null,
        clarify: 'I need a clear task title before I can add that.',
      };
    }

    let assigneeName = draft.assigneeName;
    let assignee = '';
    if (typeof assigneeName === 'string' && assigneeName.trim()) {
      const lowered = assigneeName.trim().toLowerCase();
      if ((lowered === 'me' || lowered === 'myself') && currentUserId) {
        assignee = currentUserId;
      } else {
        const resolved = resolveAssigneeId(assigneeName, project.members);
        if (resolved === null) {
          return {
            proposal: null,
            error: null,
            clarify: `Who should own “${title}”? Pick one teammate: ${project.members.map((m) => memberLabel(m)).join(', ') || 'add members first'}.`,
          };
        }
        assignee = resolved;
      }
    }

    const description =
      typeof draft.description === 'string' ? draft.description.trim().slice(0, 5000) : '';
    const due = normalizeTaskDue(draft.due, project.due);
    const milestone = resolveMilestoneId(draft.milestoneTitle, project.milestones);

    tasks.push({
      id: `${project.id}:${crypto.randomUUID()}`,
      title: title.slice(0, 200),
      description,
      assignee,
      due,
      status: 'todo',
      milestone,
    });
  }

  return {
    proposal: {
      type: 'tasks',
      id: crypto.randomUUID(),
      summary: summary.trim() || `Add ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
      tasks,
      labels: tasks.map((t) => formatTaskProposalLabel(t, project.members)),
    },
    error: null,
    clarify: null,
  };
}

/** Rebuild a pending create-proposal while keeping stable task/proposal ids. */
export function refineTaskProposal(
  proposal: TaskProposal,
  drafts: TaskDraft[],
  project: Project,
  summary: string,
  currentUserId?: string,
) {
  const built = draftsToProposal(drafts, project, summary, currentUserId);
  if (!built.proposal) return built;
  const tasks = built.proposal.tasks.map((task, i) => ({
    ...task,
    id: proposal.tasks[i]?.id || task.id,
  }));
  return {
    proposal: {
      ...built.proposal,
      id: proposal.id,
      type: 'tasks' as const,
      tasks,
      labels: tasks.map((t) => formatTaskProposalLabel(t, project.members)),
    },
    error: null,
    clarify: null,
  };
}

export function taskToDraft(task: Task, members: Member[]): TaskDraft {
  return {
    title: task.title,
    description: task.description || '',
    assigneeName: members.find((m) => m.id === task.assignee)?.name || (task.assignee ? undefined : ''),
    due: task.due,
  };
}

export function validateProposedTasks(raw: unknown, project: Project) {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (project.tasks.length + raw.length > 500) return null;
  const memberIds = new Set(project.members.map((m) => m.id));
  const milestoneIds = new Set(project.milestones.map((m) => m.id));
  const tasks: Task[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const t = item as Partial<Task>;
    if (typeof t.id !== 'string' || !t.id || t.id.length > 300) return null;
    if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 200) return null;
    if (typeof t.due !== 'string' || !dateOk(t.due)) return null;
    const assignee = typeof t.assignee === 'string' ? t.assignee : '';
    if (assignee && !memberIds.has(assignee)) return null;
    const milestone = typeof t.milestone === 'string' ? t.milestone : '';
    if (milestone && !milestoneIds.has(milestone)) return null;
    const status = t.status === 'todo' || t.status === 'progress' || t.status === 'done' ? t.status : 'todo';
    tasks.push({
      id: t.id.startsWith(project.id + ':') ? t.id : `${project.id}:${crypto.randomUUID()}`,
      title: t.title.trim(),
      description: typeof t.description === 'string' ? t.description.slice(0, 5000) : '',
      assignee,
      due: t.due,
      status,
      milestone,
    });
  }
  return tasks;
}
