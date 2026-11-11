/**
 * Save one member's availability without locking the rest of the project.
 * Teammates can paint at the same time; each write replaces only that user's rows.
 */

import { availabilitySlotsError } from '@/lib/availability-calendar';
import { failure, identity, projectFor, runtime, sameOrigin } from '@/lib/server';
import { readProject } from '@/lib/store';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json()) as { projectId?: string; slots?: unknown };
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const project = await projectFor(projectId, user);
    const previous = project.availability[user.userId] || [];
    const slotError = availabilitySlotsError(body.slots, previous);
    if (slotError) return Response.json({ error: slotError }, { status: 400 });

    const slots = body.slots as string[];
    const { DB } = runtime();
    const statements = [
      DB.prepare('DELETE FROM availability WHERE project_id=? AND user_id=?').bind(
        projectId,
        user.userId,
      ),
    ];
    for (const slot of slots) {
      statements.push(
        DB.prepare(
          'INSERT INTO availability(id,user_id,project_id,start_at,end_at) VALUES(?,?,?,?,?)',
        ).bind(
          crypto.randomUUID(),
          user.userId,
          projectId,
          slot,
          new Date(Date.parse(slot) + 3600000).toISOString(),
        ),
      );
    }
    await DB.batch(statements);
    const saved = await readProject(DB, projectId);
    return Response.json({ availability: saved.availability });
  } catch (error) {
    return failure(error);
  }
}
