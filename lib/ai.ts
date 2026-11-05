import { geminiKey } from '@/lib/ai-config';
import { runtime } from '@/lib/server';
import type { Project } from '@/lib/model';
export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export async function complete(messages: AIMessage[], json = false, providedKey?: string) {
  const key = providedKey || (await geminiKey());
  if (!key) throw new AIError('Connect Gemini in your account settings to start using AI.', 503);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const message of messages.filter((m) => m.role !== 'system')) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push({ text: message.content });
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  let response: Response;
  try {
    response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        GEMINI_MODEL +
        ':generateContent',
      {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system || 'Be helpful and concise.' }] },
          contents,
          generationConfig: {
            maxOutputTokens: json ? 5000 : 2200,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    );
  } catch {
    throw new AIError(
      'Gemini could not connect in time. Your question is still here; please try again.',
      504,
    );
  }
  if (!response.ok) {
    console.error('Gemini request failed', { status: response.status });
    if (response.status === 429)
      throw new AIError(
        'Gemini’s usage limit has been reached. Wait and try again, or check your free-tier quota in Google AI Studio.',
        429,
      );
    if ([400, 401, 403].includes(response.status))
      throw new AIError(
        'Gemini rejected this request. Check that the API key is valid, the Gemini API is enabled, and the model is available for your Google project.',
        503,
      );
    if (response.status === 404)
      throw new AIError(
        'The configured Gemini model is unavailable. The site owner needs to update the model.',
        503,
      );
    throw new AIError('Gemini is temporarily unavailable. Please try again.');
  }
  const data = (await response.json()) as {
    candidates?: {
      finishReason: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS')
    throw new AIError('The answer was too long. Try a more focused question.');
  const answer = candidate?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');
  if (!answer) throw new AIError('Gemini could not answer this question. Try rephrasing it.');
  return answer;
}
export type AvailabilityIntent = {
  intent: 'availability' | 'chat' | 'clarify';
  summary?: string;
  clarifyQuestion?: string;
  ranges?: {
    date?: string;
    weekday?: string;
    startHour: number;
    endHour: number;
  }[];
};

/** Classify whether a chat message is asking to set availability; extract ranges as JSON. */
export async function classifyAvailabilityIntent(
  question: string,
  timeZone: string,
  windowDates: string[],
) {
  const raw = await complete(
    [
      {
        role: 'system',
        content: [
          'You classify TeamUP chat messages about personal availability.',
          'Return JSON only with shape:',
          '{"intent":"availability"|"chat"|"clarify","summary":string,"clarifyQuestion":string,"ranges":[{"date":"YYYY-MM-DD","weekday":"tuesday","startHour":10,"endHour":14}]}',
          'intent=availability when the user states times they are free/busy to mark on their schedule.',
          'intent=clarify when they seem to want availability changes but day or hours are missing/ambiguous.',
          'intent=chat for normal assignment questions.',
          'Hours are 24h local wall time. endHour is exclusive (10am–2pm => startHour 10, endHour 14).',
          'Prefer weekday names when the user says Mon/Tuesday/etc. Use date only when they give a concrete date.',
          `User timezone: ${timeZone}. Valid dates in the next 7 days: ${windowDates.join(', ')}.`,
          'Availability grid only supports 7am–10pm local (start hours 7–22). Do not invent overnight ranges.',
          'summary should be a short confirmation phrase. clarifyQuestion asks for the missing detail.',
        ].join(' '),
      },
      { role: 'user', content: question },
    ],
    true,
  );
  try {
    const parsed = JSON.parse(raw) as AvailabilityIntent;
    if (!parsed || !['availability', 'chat', 'clarify'].includes(parsed.intent)) {
      return { intent: 'chat' as const };
    }
    return parsed;
  } catch {
    return { intent: 'chat' as const };
  }
}

export async function assignmentContext(project: Project) {
  const { DB, BUCKET } = runtime();
  const result = await DB.prepare(
    'SELECT id,name,size,type,storage_key FROM files WHERE project_id=? ORDER BY created DESC LIMIT 20',
  )
    .bind(project.id)
    .all<{ id: string; name: string; size: number; type: string; storage_key: string | null }>();
  const readable = result.results
    .filter((f) => (/\.(txt|md|csv)$/i.test(f.name) || f.type === 'text/plain') && f.size <= 100000)
    .slice(0, 3);
  const documents = [];
  for (const file of readable) {
    const object = await BUCKET.get(file.storage_key || file.id);
    if (object) documents.push({ name: file.name, text: (await object.text()).slice(0, 10000) });
  }
  return {
    project: {
      name: project.name,
      description: project.description,
      deadline: project.due,
      course: project.course,
      members: project.members.map((m) => ({ id: m.id, name: m.name })),
      tasks: project.tasks,
      milestones: project.milestones,
    },
    documents,
    otherFiles: result.results.filter((f) => !readable.includes(f)).map((f) => f.name),
  };
}
