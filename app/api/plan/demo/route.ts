import { AIError } from '@/lib/ai';
import { generatePlanFromParts } from '@/lib/generate-plan';
import { partsFromInlineFiles } from '@/lib/plan-documents';
import {
  assertLocalDemo,
  localAiStatus,
  localDemoFailure,
  normalizeDemoProject,
} from '@/lib/local-demo';
import { failure } from '@/lib/server';

export async function GET(req: Request) {
  try {
    assertLocalDemo(req);
    return Response.json(await localAiStatus());
  } catch (e) {
    return localDemoFailure(e) || failure(e);
  }
}

export async function POST(req: Request) {
  try {
    assertLocalDemo(req);
    const body = (await req.json()) as {
      project?: unknown;
      requirements?: string;
      files?: { name?: string; type?: string; dataBase64?: string }[];
      includeMilestones?: boolean;
    };
    const project = normalizeDemoProject(body.project);
    if (!project)
      return Response.json({ error: 'A valid in-memory project snapshot is required.' }, { status: 400 });

    const requirements = typeof body.requirements === 'string' ? body.requirements.trim() : '';
    const files = Array.isArray(body.files)
      ? body.files
          .filter(
            (f): f is { name: string; type?: string; dataBase64: string } =>
              !!f &&
              typeof f.name === 'string' &&
              typeof f.dataBase64 === 'string' &&
              f.dataBase64.length > 0 &&
              f.dataBase64.length <= 7_000_000,
          )
          .slice(0, 3)
      : [];
    const includeMilestones = body.includeMilestones !== false;

    if (requirements && requirements.length > 30000)
      return Response.json(
        { error: 'Requirements must be at most 30,000 characters.' },
        { status: 400 },
      );
    if (requirements && requirements.length < 30 && !files.length)
      return Response.json(
        { error: 'Enter at least 30 characters of requirements, or upload a rubric file.' },
        { status: 400 },
      );
    if (!requirements && !files.length)
      return Response.json(
        { error: 'Paste project requirements or upload a rubric file to generate a plan.' },
        { status: 400 },
      );

    const loaded = files.length
      ? await partsFromInlineFiles(files)
      : { parts: [], unreadFiles: [] as string[] };

    const plan = await generatePlanFromParts({
      project,
      requirements,
      parts: loaded.parts,
      unreadFiles: loaded.unreadFiles,
      includeMilestones,
    });
    return Response.json(plan);
  } catch (e) {
    if (e instanceof AIError) return Response.json({ error: e.message }, { status: e.status });
    return localDemoFailure(e) || failure(e);
  }
}
