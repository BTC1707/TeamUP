import { geminiKey } from '@/lib/ai-config';
import { readableProjectDocuments, type GeminiPart } from '@/lib/plan-documents';
import type { Project } from '@/lib/model';
export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type AIContentPart = GeminiPart;
export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

async function generateGemini(
  system: string,
  contents: { role: 'user' | 'model'; parts: GeminiPart[] }[],
  json: boolean,
  providedKey?: string,
  timeoutMs = 90000,
) {
  const key = providedKey || (await geminiKey());
  if (!key) throw new AIError('Connect Gemini in your account settings to start using AI.', 503);
  let response: Response;
  try {
    response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        GEMINI_MODEL +
        ':generateContent',
      {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
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

export async function complete(messages: AIMessage[], json = false, providedKey?: string) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = [];
  for (const message of messages.filter((m) => m.role !== 'system')) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push({ text: message.content });
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  return generateGemini(system, contents, json, providedKey);
}

/** Multimodal generate (text + inline PDF/images). */
export async function completeWithParts(
  system: string,
  userParts: GeminiPart[],
  json = false,
  providedKey?: string,
) {
  return generateGemini(system, [{ role: 'user', parts: userParts }], json, providedKey, 120000);
}
export type ChatIntent = {
  intent:
    | 'availability'
    | 'tasks'
    | 'milestones'
    | 'taskStatus'
    | 'taskEdit'
    | 'milestoneEdit'
    | 'brief'
    | 'reminders'
    | 'clarify'
    | 'chat';
  summary?: string;
  clarifyQuestion?: string;
  ranges?: {
    date?: string;
    weekday?: string;
    startHour: number;
    endHour: number;
  }[];
  tasks?: {
    title: string;
    description?: string;
    assigneeName?: string;
    due?: string;
    milestoneTitle?: string;
  }[];
  milestones?: {
    title: string;
    description?: string;
    due?: string;
  }[];
  statusUpdates?: {
    taskTitle?: string;
    taskId?: string;
    status: 'todo' | 'progress' | 'done';
  }[];
  taskEdits?: {
    taskTitle?: string;
    taskId?: string;
    title?: string;
    description?: string;
    assigneeName?: string;
    due?: string;
    milestoneTitle?: string;
    clearAssignee?: boolean;
    clearMilestone?: boolean;
  }[];
  milestoneEdits?: {
    milestoneTitle?: string;
    milestoneId?: string;
    title?: string;
    description?: string;
    due?: string;
    done?: boolean;
  }[];
  brief?: {
    mode?: 'replace' | 'append' | 'shorten';
    text?: string;
  };
  reminders?: {
    hours?: number;
  };
};

const CHAT_INTENTS = [
  'availability',
  'tasks',
  'milestones',
  'taskStatus',
  'taskEdit',
  'milestoneEdit',
  'brief',
  'reminders',
  'clarify',
  'chat',
] as const;

/** Classify assignment-chat messages into project actions or normal Q&A. */
export async function classifyChatIntent(
  question: string,
  timeZone: string,
  windowDates: string[],
  project: Project,
) {
  const members = project.members.map((m) => m.name).filter(Boolean);
  const milestones = project.milestones.map((m) => m.title).filter(Boolean);
  const taskTitles = project.tasks.map((t) => `${t.title} [${t.status}]`).slice(0, 40);
  const raw = await complete(
    [
      {
        role: 'system',
        content: [
          'You classify TeamUP assignment-chat messages.',
          'Return JSON only with shape:',
          '{"intent":"availability"|"tasks"|"milestones"|"taskStatus"|"taskEdit"|"milestoneEdit"|"brief"|"reminders"|"clarify"|"chat","summary":string,"clarifyQuestion":string,"ranges":[{"date":"YYYY-MM-DD","weekday":"tuesday","startHour":10,"endHour":14}],"tasks":[{"title":string,"description":string,"assigneeName":string,"due":"YYYY-MM-DD","milestoneTitle":string}],"milestones":[{"title":string,"description":string,"due":"YYYY-MM-DD"}],"statusUpdates":[{"taskTitle":string,"taskId":string,"status":"todo"|"progress"|"done"}],"taskEdits":[{"taskTitle":string,"taskId":string,"title":string,"description":string,"assigneeName":string,"due":"YYYY-MM-DD","milestoneTitle":string,"clearAssignee":boolean,"clearMilestone":boolean}],"milestoneEdits":[{"milestoneTitle":string,"milestoneId":string,"title":string,"description":string,"due":"YYYY-MM-DD","done":boolean}],"brief":{"mode":"replace"|"append"|"shorten","text":string},"reminders":{"hours":number}}',
          'intent=availability when the user states times they are free to mark on their schedule.',
          'intent=tasks when creating/adding NEW project tasks (not editing existing ones). Phrases like “create a task”, “add a task titled…”, “make a new task for me”.',
          'intent=milestones when creating/adding NEW milestones.',
          'intent=taskStatus when only changing status of an existing task (done/progress/todo). “I finished X”, “mark Y done”.',
          'intent=taskEdit when changing an existing task’s assignee, due date, title, description, or milestone link (not merely status). “Move the intro to Alex, due Friday.”',
          'intent=milestoneEdit when renaming, rescheduling, or marking an existing milestone complete/incomplete.',
          'intent=brief when updating the assignment brief/description: replace, append/paste text, or shorten.',
          'intent=reminders when changing how many hours before deadlines reminders should fire.',
          'intent=clarify when a project change is requested but a required detail is missing/ambiguous.',
          'intent=chat for normal assignment questions, brainstorming, or explanations.',
          'Availability hours are 24h local wall time. endHour is exclusive (10am–2pm => startHour 10, endHour 14).',
          'Prefer weekday names when the user says Mon/Tuesday/etc. Use date only when they give a concrete date.',
          `User timezone: ${timeZone}. Valid availability dates (next 7 days): ${windowDates.join(', ')}.`,
          'Availability grid only supports 7am–10pm local (start hours 7–22). Do not invent overnight ranges.',
          `Project deadline: ${project.due || 'unknown'}. Current reminderHours: ${project.reminderHours}.`,
          `Team members: ${members.length ? members.join(', ') : 'none listed'}.`,
          `Existing milestones: ${milestones.length ? milestones.join(', ') : 'none'}.`,
          `Existing tasks (title [status]): ${taskTitles.length ? taskTitles.join('; ') : 'none'}.`,
          'For new tasks, title is required. For taskEdits, identify the existing task via taskTitle; only include fields that should change. Use assigneeName "unassigned" or clearAssignee true to clear. Use milestoneTitle "none" or clearMilestone true to detach.',
          'For milestoneEdits, identify via milestoneTitle; done true means mark complete.',
          'For brief: mode=replace when setting the whole brief; append when pasting additional text; shorten when asking to compress the current brief. Put user-provided brief content in brief.text.',
          'For reminders.hours use an integer 1–168. Map “2 days before” → 48, “a week before” → 168.',
          'For statusUpdates map finished/completed → done; started/working on → progress.',
          'summary should be a short confirmation phrase. clarifyQuestion asks for the missing detail.',
        ].join(' '),
      },
      { role: 'user', content: question },
    ],
    true,
  );
  try {
    const parsed = JSON.parse(raw) as ChatIntent;
    if (!parsed || !CHAT_INTENTS.includes(parsed.intent as (typeof CHAT_INTENTS)[number])) {
      return { intent: 'chat' as const };
    }
    return parsed;
  } catch {
    return { intent: 'chat' as const };
  }
}

/** @deprecated use classifyChatIntent */
export async function classifyAvailabilityIntent(
  question: string,
  timeZone: string,
  windowDates: string[],
  project?: Project,
) {
  if (project) return classifyChatIntent(question, timeZone, windowDates, project);
  return classifyChatIntent(question, timeZone, windowDates, {
    id: '',
    name: '',
    course: '',
    due: '',
    description: '',
    members: [],
    tasks: [],
    milestones: [],
    availability: {},
    reminderHours: 24,
    version: 0,
  });
}

export function assignmentContextFromSnapshot(
  project: Project,
  documents: { name: string; text: string }[] = [],
  otherFiles: string[] = [],
) {
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
    otherFiles,
  };
}

export async function assignmentContext(project: Project) {
  const { documents, otherFiles } = await readableProjectDocuments(project.id, 3);
  return assignmentContextFromSnapshot(project, documents, otherFiles);
}
