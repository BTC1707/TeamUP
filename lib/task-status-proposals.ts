import { type Project, type Task } from '@/lib/model';

export type TaskStatusDraft = {
  taskTitle?: string;
  taskId?: string;
  status: 'todo' | 'progress' | 'done';
};

export type TaskStatusChange = {
  taskId: string;
  title: string;
  from: Task['status'];
  to: Task['status'];
};

export type TaskStatusProposal = {
  type: 'taskStatus';
  id: string;
  summary: string;
  changes: TaskStatusChange[];
  labels: string[];
};

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'To do',
  progress: 'In progress',
  done: 'Done',
};

export function normalizeStatus(raw: unknown): Task['status'] | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'todo' || value === 'to do' || value === 'to-do') return 'todo';
  if (
    value === 'progress' ||
    value === 'in progress' ||
    value === 'in-progress' ||
    value === 'doing' ||
    value === 'started'
  )
    return 'progress';
  if (
    value === 'done' ||
    value === 'complete' ||
    value === 'completed' ||
    value === 'finished' ||
    value === 'finish'
  )
    return 'done';
  return null;
}

/** Match a task by id or title. Returns null when ambiguous or missing. */
export function resolveTask(ref: { taskId?: string; taskTitle?: string }, tasks: Task[]) {
  const taskId = typeof ref.taskId === 'string' ? ref.taskId.trim() : '';
  if (taskId) {
    const byId = tasks.find((t) => t.id === taskId);
    if (byId) return byId;
  }
  const title = typeof ref.taskTitle === 'string' ? ref.taskTitle.trim() : '';
  if (!title) return null;
  const needle = title.toLowerCase();
  const exact = tasks.filter((t) => t.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const starts = tasks.filter((t) => t.title.toLowerCase().startsWith(needle));
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) return null;

  const partial = tasks.filter((t) => t.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  return null;
}

export function formatStatusChangeLabel(change: TaskStatusChange) {
  return `${change.title} — ${STATUS_LABEL[change.from]} → ${STATUS_LABEL[change.to]}`;
}

export function draftsToStatusProposal(
  drafts: TaskStatusDraft[],
  project: Project,
  summary: string,
): { proposal: TaskStatusProposal | null; error: string | null; clarify: string | null } {
  if (!Array.isArray(drafts) || !drafts.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'Which task should I update, and to what status (to do, in progress, or done)?',
    };
  }
  if (!project.tasks.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'There are no tasks on this project yet. Add a task first, then I can update its status.',
    };
  }

  const changes: TaskStatusChange[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    const status = normalizeStatus(draft.status);
    if (!status) {
      return {
        proposal: null,
        error: null,
        clarify: 'What status should I set — to do, in progress, or done?',
      };
    }
    const task = resolveTask(draft, project.tasks);
    if (!task) {
      const hint = project.tasks
        .slice(0, 8)
        .map((t) => t.title)
        .join(', ');
      return {
        proposal: null,
        error: null,
        clarify: `Which task did you mean? ${hint ? `Some options: ${hint}.` : 'Add a clearer task title.'}`,
      };
    }
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (task.status === status) continue;
    changes.push({
      taskId: task.id,
      title: task.title,
      from: task.status,
      to: status,
    });
  }

  if (!changes.length) {
    return {
      proposal: null,
      error: 'Those tasks are already in that status — nothing to change.',
      clarify: null,
    };
  }

  return {
    proposal: {
      type: 'taskStatus',
      id: crypto.randomUUID(),
      summary:
        summary.trim() ||
        `Update ${changes.length} task${changes.length === 1 ? '' : 's'}`,
      changes,
      labels: changes.map(formatStatusChangeLabel),
    },
    error: null,
    clarify: null,
  };
}

export function validateStatusChanges(raw: unknown, project: Project) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const changes: TaskStatusChange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Partial<TaskStatusChange>;
    if (typeof c.taskId !== 'string' || !byId.has(c.taskId)) return null;
    const status = normalizeStatus(c.to);
    if (!status) return null;
    if (seen.has(c.taskId)) continue;
    seen.add(c.taskId);
    const task = byId.get(c.taskId)!;
    changes.push({
      taskId: task.id,
      title: task.title,
      from: task.status,
      to: status,
    });
  }
  return changes.length ? changes : null;
}

export function applyStatusChanges(project: Project, changes: TaskStatusChange[]): Project {
  const map = new Map(changes.map((c) => [c.taskId, c.to]));
  return {
    ...project,
    tasks: project.tasks.map((t) => (map.has(t.id) ? { ...t, status: map.get(t.id)! } : t)),
  };
}
