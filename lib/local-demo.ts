import { sameOrigin } from '@/lib/server';
import { aiConfigured } from '@/lib/ai-config';
import type { Project } from '@/lib/model';

/** Demo AI routes only run on the local Vite/Workers host — never in production. */
export function assertLocalDemo(req: Request) {
  sameOrigin(req);
  const host = new URL(req.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    const err = new Error('LOCAL_ONLY');
    throw err;
  }
}

export function localDemoFailure(e: unknown) {
  const message = e instanceof Error ? e.message : '';
  if (message === 'LOCAL_ONLY') {
    return Response.json({ error: 'Demo AI is only available on localhost.' }, { status: 403 });
  }
  if (message === 'Invalid origin') {
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  }
  return null;
}

export async function localAiStatus() {
  return { aiReady: await aiConfigured() };
}

export function normalizeDemoProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Project>;
  if (typeof p.id !== 'string' || !p.id) return null;
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  if (typeof p.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.due)) return null;
  const members = Array.isArray(p.members)
    ? p.members
        .filter(
          (m): m is { id: string; name: string; email: string } =>
            !!m &&
            typeof m === 'object' &&
            typeof (m as { id?: unknown }).id === 'string' &&
            typeof (m as { name?: unknown }).name === 'string',
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          email: typeof m.email === 'string' ? m.email : '',
        }))
    : [];
  return {
    id: p.id,
    name: p.name.trim().slice(0, 200),
    course: typeof p.course === 'string' ? p.course.slice(0, 200) : '',
    due: p.due,
    description: typeof p.description === 'string' ? p.description.slice(0, 20000) : '',
    members,
    tasks: Array.isArray(p.tasks) ? (p.tasks as Project['tasks']).slice(0, 500) : [],
    milestones: Array.isArray(p.milestones)
      ? (p.milestones as Project['milestones']).slice(0, 100)
      : [],
    availability:
      p.availability && typeof p.availability === 'object'
        ? (p.availability as Project['availability'])
        : {},
    reminderHours:
      typeof p.reminderHours === 'number' && p.reminderHours >= 1 && p.reminderHours <= 168
        ? p.reminderHours
        : 24,
    version: typeof p.version === 'number' ? p.version : 0,
    owner: typeof p.owner === 'string' ? p.owner : undefined,
    groupId: typeof p.groupId === 'string' ? p.groupId : undefined,
  };
}
