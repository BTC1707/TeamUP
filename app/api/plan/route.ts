import { identity, projectFor, failure, sameOrigin } from '@/lib/server';
import { AIError } from '@/lib/ai';
import { loadPlanDocuments } from '@/lib/plan-documents';
import { generatePlanFromParts } from '@/lib/generate-plan';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json()) as {
      project: string;
      requirements?: string;
      fileIds?: string[];
      includeMilestones?: boolean;
    };
    const projectId = body.project;
    const requirements = typeof body.requirements === 'string' ? body.requirements.trim() : '';
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.filter((id): id is string => typeof id === 'string').slice(0, 3)
      : [];
    const includeMilestones = body.includeMilestones !== false;

    if (requirements && requirements.length > 30000)
      return Response.json(
        { error: 'Requirements must be at most 30,000 characters.' },
        { status: 400 },
      );
    if (requirements && requirements.length < 30 && !fileIds.length)
      return Response.json(
        { error: 'Enter at least 30 characters of requirements, or upload a rubric file.' },
        { status: 400 },
      );
    if (!requirements && !fileIds.length)
      return Response.json(
        { error: 'Paste project requirements or upload a rubric file to generate a plan.' },
        { status: 400 },
      );

    const p = await projectFor(projectId, user);
    const loaded = fileIds.length
      ? await loadPlanDocuments(p.id, fileIds)
      : { parts: [] as Awaited<ReturnType<typeof loadPlanDocuments>>['parts'], unreadFiles: [] as string[] };

    const plan = await generatePlanFromParts({
      project: p,
      requirements,
      parts: loaded.parts,
      unreadFiles: loaded.unreadFiles,
      includeMilestones,
    });
    return Response.json(plan);
  } catch (e) {
    if (e instanceof AIError) return Response.json({ error: e.message }, { status: e.status });
    return failure(e);
  }
}
