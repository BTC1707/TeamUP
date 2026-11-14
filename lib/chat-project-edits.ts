import { complete } from '@/lib/ai';
import { memberLabel, type Milestone, type Project, type Task } from '@/lib/model';
import {
  normalizeTaskDue,
  resolveAssigneeId,
  resolveMilestoneId,
} from '@/lib/task-proposals';
import { resolveTask } from '@/lib/task-status-proposals';

function dateOk(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00'));
}

function formatDue(due: string) {
  return new Date(due + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function memberName(project: Project, id: string) {
  if (!id) return 'Unassigned';
  return project.members.find((m) => m.id === id)?.name || 'Unknown member';
}

function milestoneTitle(project: Project, id: string) {
  if (!id) return 'No milestone';
  return project.milestones.find((m) => m.id === id)?.title || 'Unknown milestone';
}

/** Match an existing milestone; null when missing/ambiguous. */
export function resolveMilestone(
  ref: { milestoneId?: string; milestoneTitle?: string },
  milestones: Milestone[],
) {
  const id = typeof ref.milestoneId === 'string' ? ref.milestoneId.trim() : '';
  if (id) {
    const byId = milestones.find((m) => m.id === id);
    if (byId) return byId;
  }
  const title = typeof ref.milestoneTitle === 'string' ? ref.milestoneTitle.trim() : '';
  if (!title) return null;
  const needle = title.toLowerCase();
  const exact = milestones.filter((m) => m.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const starts = milestones.filter((m) => m.title.toLowerCase().startsWith(needle));
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) return null;
  const partial = milestones.filter((m) => m.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  return null;
}

function isClearName(value: string) {
  const v = value.trim().toLowerCase();
  return ['none', 'unassigned', 'nobody', 'no one', 'no-one', 'clear', 'remove'].includes(v);
}

// —— Task edits ——

export type TaskEditDraft = {
  taskTitle?: string;
  taskId?: string;
  title?: string;
  description?: string;
  assigneeName?: string;
  due?: string;
  milestoneTitle?: string;
  clearAssignee?: boolean;
  clearMilestone?: boolean;
};

export type TaskEditChange = {
  taskId: string;
  before: Task;
  after: Task;
  labels: string[];
};

export type TaskEditProposal = {
  type: 'taskEdit';
  id: string;
  summary: string;
  changes: TaskEditChange[];
  labels: string[];
};

export function draftsToTaskEditProposal(
  drafts: TaskEditDraft[],
  project: Project,
  summary: string,
  currentUserId?: string,
): { proposal: TaskEditProposal | null; error: string | null; clarify: string | null } {
  if (!Array.isArray(drafts) || !drafts.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'Which task should I edit, and what should change?',
    };
  }
  if (!project.tasks.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'There are no tasks to edit yet. Add a task first.',
    };
  }

  const changes: TaskEditChange[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    const task = resolveTask(draft, project.tasks);
    if (!task) {
      const hint = project.tasks
        .slice(0, 8)
        .map((t) => t.title)
        .join(', ');
      return {
        proposal: null,
        error: null,
        clarify: `Which task did you mean? ${hint ? `Some options: ${hint}.` : ''}`,
      };
    }
    if (seen.has(task.id)) continue;
    seen.add(task.id);

    const after: Task = { ...task };
    const labels: string[] = [];

    if (typeof draft.title === 'string' && draft.title.trim()) {
      const title = draft.title.trim().slice(0, 200);
      if (title !== task.title) {
        after.title = title;
        labels.push(`title → ${title}`);
      }
    }
    if (typeof draft.description === 'string') {
      const description = draft.description.trim().slice(0, 5000);
      if (description !== (task.description || '')) {
        after.description = description;
        labels.push(description ? 'description updated' : 'description cleared');
      }
    }
    if (draft.clearAssignee || (typeof draft.assigneeName === 'string' && isClearName(draft.assigneeName))) {
      if (task.assignee) {
        after.assignee = '';
        labels.push('assignee → Unassigned');
      }
    } else if (typeof draft.assigneeName === 'string' && draft.assigneeName.trim()) {
      const lowered = draft.assigneeName.trim().toLowerCase();
      let assignee = '';
      if ((lowered === 'me' || lowered === 'myself') && currentUserId) {
        assignee = currentUserId;
      } else {
        const resolved = resolveAssigneeId(draft.assigneeName, project.members);
        if (resolved === null) {
          return {
            proposal: null,
            error: null,
            clarify: `Who should own “${task.title}”? Pick one teammate: ${project.members.map((m) => memberLabel(m)).join(', ') || 'add members first'}.`,
          };
        }
        assignee = resolved;
      }
      if (assignee !== task.assignee) {
        after.assignee = assignee;
        labels.push(`assignee → ${memberName(project, assignee)}`);
      }
    }
    if (typeof draft.due === 'string' && draft.due.trim()) {
      if (!dateOk(draft.due.trim())) {
        return {
          proposal: null,
          error: null,
          clarify: `What due date should “${task.title}” use? Use a real calendar date.`,
        };
      }
      const due = normalizeTaskDue(draft.due, project.due);
      if (due !== task.due) {
        after.due = due;
        labels.push(`due → ${formatDue(due)}`);
      }
    }
    if (
      draft.clearMilestone ||
      (typeof draft.milestoneTitle === 'string' && isClearName(draft.milestoneTitle))
    ) {
      if (task.milestone) {
        after.milestone = '';
        labels.push('milestone → none');
      }
    } else if (typeof draft.milestoneTitle === 'string' && draft.milestoneTitle.trim()) {
      const milestone = resolveMilestoneId(draft.milestoneTitle, project.milestones);
      if (!milestone) {
        return {
          proposal: null,
          error: null,
          clarify: `Which milestone should “${task.title}” use? ${
            project.milestones.map((m) => m.title).join(', ') || 'Add a milestone first.'
          }`,
        };
      }
      if (milestone !== task.milestone) {
        after.milestone = milestone;
        labels.push(`milestone → ${milestoneTitle(project, milestone)}`);
      }
    }

    if (!labels.length) continue;
    changes.push({ taskId: task.id, before: task, after, labels });
  }

  if (!changes.length) {
    return {
      proposal: null,
      error: 'Nothing to change — those tasks are already set that way.',
      clarify: null,
    };
  }

  return {
    proposal: {
      type: 'taskEdit',
      id: crypto.randomUUID(),
      summary: summary.trim() || `Update ${changes.length} task${changes.length === 1 ? '' : 's'}`,
      changes,
      labels: changes.map((c) => `${c.after.title}: ${c.labels.join('; ')}`),
    },
    error: null,
    clarify: null,
  };
}

export function validateTaskEdits(raw: unknown, project: Project) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const memberIds = new Set(project.members.map((m) => m.id));
  const milestoneIds = new Set(project.milestones.map((m) => m.id));
  const changes: TaskEditChange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Partial<TaskEditChange>;
    if (typeof c.taskId !== 'string' || !byId.has(c.taskId) || seen.has(c.taskId)) return null;
    if (!c.after || typeof c.after !== 'object') return null;
    const after = c.after as Partial<Task>;
    if (typeof after.title !== 'string' || !after.title.trim() || after.title.length > 200) return null;
    if (typeof after.due !== 'string' || !dateOk(after.due)) return null;
    const assignee = typeof after.assignee === 'string' ? after.assignee : '';
    if (assignee && !memberIds.has(assignee)) return null;
    const milestone = typeof after.milestone === 'string' ? after.milestone : '';
    if (milestone && !milestoneIds.has(milestone)) return null;
    const before = byId.get(c.taskId)!;
    const status =
      after.status === 'todo' || after.status === 'progress' || after.status === 'done'
        ? after.status
        : before.status;
    seen.add(c.taskId);
    const next: Task = {
      id: before.id,
      title: after.title.trim(),
      description: typeof after.description === 'string' ? after.description.slice(0, 5000) : '',
      assignee,
      due: after.due,
      status,
      milestone,
    };
    changes.push({
      taskId: before.id,
      before,
      after: next,
      labels: Array.isArray(c.labels) ? c.labels.filter((l): l is string => typeof l === 'string') : [],
    });
  }
  return changes.length ? changes : null;
}

export function applyTaskEdits(project: Project, changes: TaskEditChange[]): Project {
  const map = new Map(changes.map((c) => [c.taskId, c.after]));
  return {
    ...project,
    tasks: project.tasks.map((t) => map.get(t.id) || t),
  };
}

// —— Milestone edits ——

export type MilestoneEditDraft = {
  milestoneTitle?: string;
  milestoneId?: string;
  title?: string;
  description?: string;
  due?: string;
  done?: boolean;
};

export type MilestoneEditChange = {
  milestoneId: string;
  before: Milestone;
  after: Milestone;
  labels: string[];
};

export type MilestoneEditProposal = {
  type: 'milestoneEdit';
  id: string;
  summary: string;
  changes: MilestoneEditChange[];
  labels: string[];
};

export function draftsToMilestoneEditProposal(
  drafts: MilestoneEditDraft[],
  project: Project,
  summary: string,
): { proposal: MilestoneEditProposal | null; error: string | null; clarify: string | null } {
  if (!Array.isArray(drafts) || !drafts.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'Which milestone should I edit, and what should change?',
    };
  }
  if (!project.milestones.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'There are no milestones to edit yet. Add a milestone first.',
    };
  }

  const changes: MilestoneEditChange[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    const milestone = resolveMilestone(draft, project.milestones);
    if (!milestone) {
      const hint = project.milestones.map((m) => m.title).join(', ');
      return {
        proposal: null,
        error: null,
        clarify: `Which milestone did you mean? ${hint ? `Options: ${hint}.` : ''}`,
      };
    }
    if (seen.has(milestone.id)) continue;
    seen.add(milestone.id);

    const after: Milestone = { ...milestone };
    const labels: string[] = [];

    if (typeof draft.title === 'string' && draft.title.trim()) {
      const title = draft.title.trim().slice(0, 200);
      if (title !== milestone.title) {
        after.title = title;
        labels.push(`title → ${title}`);
      }
    }
    if (typeof draft.description === 'string') {
      const description = draft.description.trim().slice(0, 5000);
      if (description !== (milestone.description || '')) {
        after.description = description;
        labels.push(description ? 'description updated' : 'description cleared');
      }
    }
    if (typeof draft.due === 'string' && draft.due.trim()) {
      if (!dateOk(draft.due.trim())) {
        return {
          proposal: null,
          error: null,
          clarify: `What due date should “${milestone.title}” use?`,
        };
      }
      const due = normalizeTaskDue(draft.due, project.due);
      if (due !== milestone.due) {
        after.due = due;
        labels.push(`due → ${formatDue(due)}`);
      }
    }
    if (typeof draft.done === 'boolean' && draft.done !== milestone.done) {
      after.done = draft.done;
      labels.push(draft.done ? 'mark complete' : 'mark incomplete');
    }

    if (!labels.length) continue;
    changes.push({ milestoneId: milestone.id, before: milestone, after, labels });
  }

  if (!changes.length) {
    return {
      proposal: null,
      error: 'Nothing to change — those milestones are already set that way.',
      clarify: null,
    };
  }

  return {
    proposal: {
      type: 'milestoneEdit',
      id: crypto.randomUUID(),
      summary:
        summary.trim() ||
        `Update ${changes.length} milestone${changes.length === 1 ? '' : 's'}`,
      changes,
      labels: changes.map((c) => `${c.after.title}: ${c.labels.join('; ')}`),
    },
    error: null,
    clarify: null,
  };
}

export function validateMilestoneEdits(raw: unknown, project: Project) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const byId = new Map(project.milestones.map((m) => [m.id, m]));
  const changes: MilestoneEditChange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Partial<MilestoneEditChange>;
    if (typeof c.milestoneId !== 'string' || !byId.has(c.milestoneId) || seen.has(c.milestoneId))
      return null;
    if (!c.after || typeof c.after !== 'object') return null;
    const after = c.after as Partial<Milestone>;
    if (typeof after.title !== 'string' || !after.title.trim() || after.title.length > 200)
      return null;
    if (typeof after.due !== 'string' || !dateOk(after.due)) return null;
    const before = byId.get(c.milestoneId)!;
    seen.add(c.milestoneId);
    changes.push({
      milestoneId: before.id,
      before,
      after: {
        id: before.id,
        title: after.title.trim(),
        description: typeof after.description === 'string' ? after.description.slice(0, 5000) : '',
        due: after.due,
        done: Boolean(after.done),
      },
      labels: Array.isArray(c.labels) ? c.labels.filter((l): l is string => typeof l === 'string') : [],
    });
  }
  return changes.length ? changes : null;
}

export function applyMilestoneEdits(project: Project, changes: MilestoneEditChange[]): Project {
  const map = new Map(changes.map((c) => [c.milestoneId, c.after]));
  return {
    ...project,
    milestones: project.milestones.map((m) => map.get(m.id) || m),
  };
}

// —— Brief ——

export type BriefDraft = {
  mode?: 'replace' | 'append' | 'shorten';
  text?: string;
};

export type BriefProposal = {
  type: 'brief';
  id: string;
  summary: string;
  description: string;
  labels: string[];
};

export async function draftToBriefProposal(
  draft: BriefDraft | undefined,
  project: Project,
  summary: string,
): Promise<{ proposal: BriefProposal | null; error: string | null; clarify: string | null }> {
  const mode = draft?.mode || 'replace';
  const text = typeof draft?.text === 'string' ? draft.text.trim() : '';
  let next = project.description || '';

  if (mode === 'shorten') {
    if (!(project.description || '').trim()) {
      return {
        proposal: null,
        error: null,
        clarify: 'The assignment brief is empty — paste text to set it, or tell me what to write.',
      };
    }
    try {
      next = (
        await complete([
          {
            role: 'system',
            content:
              'Rewrite the assignment brief to be clearer and shorter. Keep requirements, deadlines, and constraints. Do not invent new requirements. Return only the rewritten brief text, under 1200 words.',
          },
          { role: 'user', content: project.description },
        ])
      )
        .trim()
        .slice(0, 5000);
    } catch {
      return {
        proposal: null,
        error: 'I couldn’t shorten the brief right now. Try again in a moment.',
        clarify: null,
      };
    }
  } else if (mode === 'append') {
    if (!text) {
      return {
        proposal: null,
        error: null,
        clarify: 'What text should I add to the assignment brief?',
      };
    }
    next = [project.description || '', text].filter(Boolean).join('\n\n').slice(0, 5000);
  } else {
    if (!text) {
      return {
        proposal: null,
        error: null,
        clarify: 'What should the assignment brief say?',
      };
    }
    next = text.slice(0, 5000);
  }

  if (next === (project.description || '')) {
    return {
      proposal: null,
      error: 'The brief would stay the same — nothing to update.',
      clarify: null,
    };
  }

  const preview =
    next.length > 280 ? next.slice(0, 280).trimEnd() + '…' : next || '(empty brief)';

  return {
    proposal: {
      type: 'brief',
      id: crypto.randomUUID(),
      summary: summary.trim() || 'Update the assignment brief',
      description: next,
      labels: [`New brief preview: ${preview}`],
    },
    error: null,
    clarify: null,
  };
}

export function validateBrief(raw: unknown) {
  if (typeof raw !== 'string') return null;
  if (raw.length > 5000) return null;
  return raw;
}

// —— Reminders ——

export type ReminderDraft = {
  hours?: number;
};

export type ReminderProposal = {
  type: 'reminders';
  id: string;
  summary: string;
  reminderHours: number;
  labels: string[];
};

export function draftToReminderProposal(
  draft: ReminderDraft | undefined,
  project: Project,
  summary: string,
): { proposal: ReminderProposal | null; error: string | null; clarify: string | null } {
  const hours = draft?.hours;
  if (typeof hours !== 'number' || !Number.isFinite(hours)) {
    return {
      proposal: null,
      error: null,
      clarify: 'How many hours before deadlines should reminders fire? (1–168)',
    };
  }
  const rounded = Math.round(hours);
  if (!Number.isInteger(rounded) || rounded < 1 || rounded > 168) {
    return {
      proposal: null,
      error: null,
      clarify: 'Reminder timing must be a whole number of hours between 1 and 168 (one week).',
    };
  }
  if (rounded === project.reminderHours) {
    return {
      proposal: null,
      error: `Reminders are already set to ${rounded} hour${rounded === 1 ? '' : 's'} before.`,
      clarify: null,
    };
  }
  return {
    proposal: {
      type: 'reminders',
      id: crypto.randomUUID(),
      summary: summary.trim() || 'Update reminder timing',
      reminderHours: rounded,
      labels: [
        `${project.reminderHours}h → ${rounded}h before deadlines`,
      ],
    },
    error: null,
    clarify: null,
  };
}

export function validateReminderHours(raw: unknown) {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 168) return null;
  return raw;
}
