import { type Milestone, type Project } from '@/lib/model';
import { normalizeTaskDue } from '@/lib/task-proposals';

export type MilestoneDraft = {
  title: string;
  description?: string;
  due?: string;
};

export type MilestoneProposal = {
  type: 'milestones';
  id: string;
  summary: string;
  milestones: Milestone[];
  labels: string[];
};

export function formatMilestoneProposalLabel(milestone: Milestone) {
  const due = new Date(milestone.due + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${milestone.title} — ${due}`;
}

export function draftsToMilestoneProposal(
  drafts: MilestoneDraft[],
  project: Project,
  summary: string,
): { proposal: MilestoneProposal | null; error: string | null; clarify: string | null } {
  if (!Array.isArray(drafts) || !drafts.length) {
    return {
      proposal: null,
      error: null,
      clarify: 'What milestone should I add? Include a title, and optionally a due date.',
    };
  }
  if (project.milestones.length + drafts.length > 100) {
    return {
      proposal: null,
      error: 'This project already has too many milestones to add more right now.',
      clarify: null,
    };
  }

  const milestones: Milestone[] = [];
  for (const draft of drafts) {
    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    if (!title || title.length > 200) {
      return {
        proposal: null,
        error: null,
        clarify: 'I need a clear milestone title before I can add that.',
      };
    }
    const description =
      typeof draft.description === 'string' ? draft.description.trim().slice(0, 5000) : '';
    milestones.push({
      id: `${project.id}:${crypto.randomUUID()}`,
      title: title.slice(0, 200),
      description,
      due: normalizeTaskDue(draft.due, project.due),
      done: false,
    });
  }

  return {
    proposal: {
      type: 'milestones',
      id: crypto.randomUUID(),
      summary:
        summary.trim() ||
        `Add ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`,
      milestones,
      labels: milestones.map(formatMilestoneProposalLabel),
    },
    error: null,
    clarify: null,
  };
}

export function validateProposedMilestones(raw: unknown, project: Project) {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (project.milestones.length + raw.length > 100) return null;
  const milestones: Milestone[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const m = item as Partial<Milestone>;
    if (typeof m.id !== 'string' || !m.id || m.id.length > 300) return null;
    if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 200) return null;
    if (typeof m.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.due)) return null;
    if (!Number.isFinite(Date.parse(m.due + 'T12:00:00'))) return null;
    milestones.push({
      id: m.id.startsWith(project.id + ':') ? m.id : `${project.id}:${crypto.randomUUID()}`,
      title: m.title.trim(),
      description: typeof m.description === 'string' ? m.description.slice(0, 5000) : '',
      due: m.due,
      done: false,
    });
  }
  return milestones;
}
