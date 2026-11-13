import type { Project, Task } from './model';

export type ProjectRole = 'owner' | 'admin' | 'member';

export function projectRole(project: Project, userId?: string | null): ProjectRole | null {
  if (!userId) return null;
  if (project.owner === userId) return 'owner';
  const member = project.members.find((entry) => entry.id === userId);
  return member?.role === 'admin' ? 'admin' : member ? 'member' : null;
}

function sameTask(a: Task, b: Task) {
  return (
    a.id === b.id &&
    a.title === b.title &&
    (a.description || '') === (b.description || '') &&
    a.assignee === b.assignee &&
    a.due === b.due &&
    a.status === b.status &&
    a.milestone === b.milestone
  );
}

function sameRows<T extends { id: string }>(a: T[], b: T[], equals: (left: T, right: T) => boolean) {
  if (a.length !== b.length) return false;
  const right = new Map(b.map((row) => [row.id, row]));
  return a.every((row) => {
    const match = right.get(row.id);
    return !!match && equals(row, match);
  });
}

function sameSlots(a: string[] = [], b: string[] = []) {
  return a.length === b.length && a.every((slot) => b.includes(slot));
}

/** Enforce which parts of a project each teammate may change on a whole-project save. */
export function projectUpdateAllowed(previous: Project, next: Project, userId: string) {
  const role = projectRole(previous, userId);
  if (role === 'owner') return true;
  if (!role) return false;

  if (
    previous.name !== next.name ||
    previous.course !== next.course ||
    previous.description !== next.description ||
    previous.due !== next.due ||
    previous.reminderHours !== next.reminderHours ||
    previous.photoUrl !== next.photoUrl ||
    previous.photoKey !== next.photoKey
  ) return false;

  const previousMembers = [...previous.members].sort((a, b) => a.id.localeCompare(b.id));
  const nextMembers = [...next.members].sort((a, b) => a.id.localeCompare(b.id));
  if (!sameRows(previousMembers, nextMembers, (a, b) => a.id === b.id && a.role === b.role))
    return false;

  if (!sameRows(previous.milestones, next.milestones, (a, b) => JSON.stringify(a) === JSON.stringify(b)))
    return false;

  const otherUserIds = new Set([
    ...Object.keys(previous.availability),
    ...Object.keys(next.availability),
  ]);
  for (const id of otherUserIds) {
    if (id !== userId && !sameSlots(previous.availability[id], next.availability[id])) return false;
  }

  if (role === 'admin') return true;

  const oldTasks = new Map(previous.tasks.map((task) => [task.id, task]));
  const newTasks = new Map(next.tasks.map((task) => [task.id, task]));
  for (const task of previous.tasks) {
    const updated = newTasks.get(task.id);
    if (!updated) {
      if (task.assignee !== userId) return false;
      continue;
    }
    if (!sameTask(task, updated) && (task.assignee !== userId || updated.assignee !== task.assignee))
      return false;
  }
  for (const task of next.tasks) {
    if (!oldTasks.has(task.id) && task.assignee !== userId) return false;
  }
  return true;
}
