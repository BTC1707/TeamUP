'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, FileText, CheckSquare, MessageCircle } from 'lucide-react';
import type { Milestone, Project, Task } from '@/lib/model';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type TaskStatusChange = {
  taskId: string;
  title: string;
  from: Task['status'];
  to: Task['status'];
};
type TaskEditChange = {
  taskId: string;
  before: Task;
  after: Task;
  labels: string[];
};
type MilestoneEditChange = {
  milestoneId: string;
  before: Milestone;
  after: Milestone;
  labels: string[];
};
type PendingProposal =
  | {
      type: 'availability';
      id: string;
      summary: string;
      slots: string[];
      labels: string[];
    }
  | {
      type: 'tasks';
      id: string;
      summary: string;
      tasks: Task[];
      labels: string[];
    }
  | {
      type: 'milestones';
      id: string;
      summary: string;
      milestones: Milestone[];
      labels: string[];
    }
  | {
      type: 'taskStatus';
      id: string;
      summary: string;
      changes: TaskStatusChange[];
      labels: string[];
    }
  | {
      type: 'taskEdit';
      id: string;
      summary: string;
      changes: TaskEditChange[];
      labels: string[];
    }
  | {
      type: 'milestoneEdit';
      id: string;
      summary: string;
      changes: MilestoneEditChange[];
      labels: string[];
    }
  | {
      type: 'brief';
      id: string;
      summary: string;
      description: string;
      labels: string[];
    }
  | {
      type: 'reminders';
      id: string;
      summary: string;
      reminderHours: number;
      labels: string[];
    };

type ConfirmAction =
  | 'confirmAvailability'
  | 'confirmTasks'
  | 'confirmMilestones'
  | 'confirmTaskStatus'
  | 'confirmTaskEdit'
  | 'confirmMilestoneEdit'
  | 'confirmBrief'
  | 'confirmReminders';

type CancelAction =
  | 'cancelAvailability'
  | 'cancelTasks'
  | 'cancelMilestones'
  | 'cancelTaskStatus'
  | 'cancelTaskEdit'
  | 'cancelMilestoneEdit'
  | 'cancelBrief'
  | 'cancelReminders';

const CONFIRM_LABEL: Record<PendingProposal['type'], string> = {
  availability: 'Confirm availability',
  tasks: 'Confirm tasks',
  milestones: 'Confirm milestones',
  taskStatus: 'Confirm status',
  taskEdit: 'Confirm edits',
  milestoneEdit: 'Confirm edits',
  brief: 'Confirm brief',
  reminders: 'Confirm reminders',
};

const CONFIRM_ACTION: Record<PendingProposal['type'], ConfirmAction> = {
  availability: 'confirmAvailability',
  tasks: 'confirmTasks',
  milestones: 'confirmMilestones',
  taskStatus: 'confirmTaskStatus',
  taskEdit: 'confirmTaskEdit',
  milestoneEdit: 'confirmMilestoneEdit',
  brief: 'confirmBrief',
  reminders: 'confirmReminders',
};

const CANCEL_ACTION: Record<PendingProposal['type'], CancelAction> = {
  availability: 'cancelAvailability',
  tasks: 'cancelTasks',
  milestones: 'cancelMilestones',
  taskStatus: 'cancelTaskStatus',
  taskEdit: 'cancelTaskEdit',
  milestoneEdit: 'cancelMilestoneEdit',
  brief: 'cancelBrief',
  reminders: 'cancelReminders',
};

export default function AssignmentChat({
  project,
  aiReady,
  onCreate,
  onBrief,
  onPlan,
  onProjectUpdate,
}: {
  project: Project;
  aiReady: boolean;
  onCreate: () => void;
  onBrief: () => void;
  onPlan: () => void;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const latest = useRef<HTMLDivElement>(null);
  const requestId = useRef<string | null>(null);
  const isDemo = !project.id;
  const timeZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';

  useEffect(() => {
    let alive = true;
    setMessages([]);
    setError('');
    setQuestion('');
    setPendingProposal(null);
    requestId.current = null;
    if (isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/chat?project=' + encodeURIComponent(project.id))
      .then(async (r) => {
        const data: any = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (alive) setMessages(data.messages);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [project.id, isDemo]);

  useEffect(() => {
    if (messages.length) latest.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, busy, pendingProposal]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) {
      onCreate();
      return;
    }
    if (busy || !question.trim() || loading) return;

    // Pending proposals live on the client — verbal yes/no must hit confirm/cancel,
    // not the free-form chat path (which will invent success or deny write access).
    if (pendingProposal) {
      const decision = proposalDecision(question);
      if (decision === 'confirm') {
        setQuestion('');
        await resolveProposal(true);
        return;
      }
      if (decision === 'cancel') {
        setQuestion('');
        await resolveProposal(false);
        return;
      }
    }

    setBusy(true);
    setError('');
    setPendingProposal(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project.id,
          question,
          requestId: requestId.current,
          timeZone,
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to get an answer. Please try again.');
      setMessages(data.messages);
      setPendingProposal(normalizePending(data.pendingProposal));
      setQuestion('');
      requestId.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveProposal(confirm: boolean) {
    if (busy || !pendingProposal) return;
    const action = confirm
      ? CONFIRM_ACTION[pendingProposal.type]
      : CANCEL_ACTION[pendingProposal.type];
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project.id,
          action,
          timeZone,
          proposal: proposalPayload(pendingProposal),
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to apply that change.');
      setMessages(data.messages);
      setPendingProposal(null);
      if (data.project && onProjectUpdate) onProjectUpdate(data.project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === 'assistant')?.id || null;

  return (
    <div className='chat-layout'>
      <section className='panel chat-panel'>
        <div className='panel-heading'>
          <div className='flex items-center gap-3'>
            <span className='stat-icon'>
              <MessageCircle size={20} />
            </span>
            <div>
              <h2>Assignment chat</h2>
              <p className='subtext !mt-1'>A place to work through the details.</p>
            </div>
          </div>
          <span className='status'>{aiReady ? 'AI connected' : 'Setup pending'}</span>
        </div>
        <div className='chat-messages' aria-live='polite' aria-busy={busy || loading}>
          {loading ? (
            <div className='empty'>Loading your conversation…</div>
          ) : !messages.length ? (
            <div className='chat-welcome'>
              <Sparkles size={30} />
              <h2>What would you like to figure out?</h2>
              <p>
                Manage the project in plain language — tasks, milestones, brief, reminders, and
                availability.
              </p>
              <div className='chat-prompts'>
                {[
                  'Move the intro to me, due Friday.',
                  'Shorten our assignment brief.',
                  'Remind us 48 hours before deadlines.',
                ].map((text) => (
                  <button
                    key={text}
                    onClick={() => {
                      setQuestion(text);
                      requestId.current = null;
                    }}
                  >
                    {text}
                    <span>↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <article key={m.id} className={'chat-message ' + m.role}>
                <span className='chat-who'>{m.role === 'user' ? 'You' : 'Teamup AI'}</span>
                <div className='chat-bubble-text'>{m.content}</div>
                {pendingProposal && m.id === lastAssistantId && (
                  <div className='chat-proposal-actions'>
                    <button
                      type='button'
                      className='btn primary'
                      disabled={busy}
                      onClick={() => resolveProposal(true)}
                    >
                      {CONFIRM_LABEL[pendingProposal.type]}
                    </button>
                    <button
                      type='button'
                      className='btn'
                      disabled={busy}
                      onClick={() => resolveProposal(false)}
                    >
                      Cancel
                    </button>
                    <p className='chat-proposal-hint'>
                      Or reply “yes” / “apply” to confirm, or “cancel” to discard.
                    </p>
                  </div>
                )}
              </article>
            ))
          )}
          {busy && (
            <article className='chat-message assistant'>
              <span className='chat-who'>Teamup AI</span>
              <div>Working through your question…</div>
            </article>
          )}
          <div ref={latest} />
        </div>
        {error && (
          <div className='error mx-5' role='alert'>
            {error}
          </div>
        )}
        {isDemo && (
          <div className='notice mx-5'>
            Create your own project to ask AI about your assignment.{' '}
            <button className='underline' onClick={onCreate}>
              Create project
            </button>
          </div>
        )}
        <form className='chat-composer' onSubmit={send}>
          <label className='sr-only' htmlFor='assignment-question'>
            Ask about your assignment
          </label>
          <textarea
            id='assignment-question'
            placeholder='Ask a question or tell me what to change on the project…'
            maxLength={6000}
            value={question}
            disabled={busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              requestId.current = null;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type='submit'
            className='btn primary'
            disabled={busy || loading || !question.trim() || (!aiReady && !isDemo)}
            aria-label='Send question'
          >
            <Send size={17} />
            <span>Send</span>
          </button>
        </form>
        <p className='chat-footnote'>
          Your chat is saved privately to your account. Changes to tasks, milestones, brief, and
          reminders ask for confirmation first. Check important details against the assignment
          brief.
        </p>
      </section>
      <aside className='stack'>
        <section className='panel'>
          <div className='panel-heading'>
            <h2>Assignment context</h2>
            <FileText size={19} color='#8274c9' />
          </div>
          <div className='context-body'>
            <h3>{project.name}</h3>
            <p>
              {project.description ||
                'Add your assignment brief so AI can give more specific answers.'}
            </p>
            <button className='btn' onClick={onBrief}>
              Edit assignment brief
            </button>
            <small>
              AI can reference your brief, tasks, milestones, and up to 3 recent TXT, Markdown, or
              CSV files under 100 KB each. You can also ask it to edit tasks, milestones, the brief,
              reminders, and availability — with confirmation before anything is saved.
            </small>
          </div>
        </section>
        <section className='planner-card'>
          <CheckSquare size={25} />
          <h2>Ready to make a plan?</h2>
          <p>Turn the assignment requirements into tasks and milestones you can review.</p>
          <button className='btn' onClick={onPlan}>
            Open AI planner <Sparkles size={15} />
          </button>
        </section>
      </aside>
    </div>
  );
}

/** Map short confirm/cancel replies onto the pending proposal actions. */
function proposalDecision(raw: string): 'confirm' | 'cancel' | null {
  const text = raw.trim().toLowerCase().replace(/[.!]+$/g, '');
  if (
    /^(y|yes|yeah|yep|yup|ok|okay|sure|confirm|apply|do it|looks good|that'?s right|sounds good|go ahead|please do|lgtm)(\s+(please|thanks|thank you))?$/.test(
      text,
    )
  )
    return 'confirm';
  if (/^(n|no|nope|cancel|never ?mind|don'?t|discard|scratch that)$/.test(text)) return 'cancel';
  return null;
}

function proposalPayload(proposal: PendingProposal) {
  switch (proposal.type) {
    case 'tasks':
      return { type: 'tasks' as const, tasks: proposal.tasks, summary: proposal.summary };
    case 'milestones':
      return {
        type: 'milestones' as const,
        milestones: proposal.milestones,
        summary: proposal.summary,
      };
    case 'taskStatus':
    case 'taskEdit':
    case 'milestoneEdit':
      return { type: proposal.type, changes: proposal.changes, summary: proposal.summary };
    case 'brief':
      return {
        type: 'brief' as const,
        description: proposal.description,
        summary: proposal.summary,
      };
    case 'reminders':
      return {
        type: 'reminders' as const,
        reminderHours: proposal.reminderHours,
        summary: proposal.summary,
      };
    default:
      return {
        type: 'availability' as const,
        slots: proposal.slots,
        summary: proposal.summary,
      };
  }
}

function normalizePending(raw: unknown): PendingProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : crypto.randomUUID();
  const summary = typeof value.summary === 'string' ? value.summary : 'Proposed change';
  const labels = Array.isArray(value.labels)
    ? value.labels.filter((l): l is string => typeof l === 'string')
    : [];

  if (value.type === 'tasks' && Array.isArray(value.tasks)) {
    return { type: 'tasks', id, summary, tasks: value.tasks as Task[], labels };
  }
  if (value.type === 'milestones' && Array.isArray(value.milestones)) {
    return {
      type: 'milestones',
      id,
      summary,
      milestones: value.milestones as Milestone[],
      labels,
    };
  }
  if (value.type === 'taskStatus' && Array.isArray(value.changes)) {
    return {
      type: 'taskStatus',
      id,
      summary,
      changes: value.changes as TaskStatusChange[],
      labels,
    };
  }
  if (value.type === 'taskEdit' && Array.isArray(value.changes)) {
    return {
      type: 'taskEdit',
      id,
      summary,
      changes: value.changes as TaskEditChange[],
      labels,
    };
  }
  if (value.type === 'milestoneEdit' && Array.isArray(value.changes)) {
    return {
      type: 'milestoneEdit',
      id,
      summary,
      changes: value.changes as MilestoneEditChange[],
      labels,
    };
  }
  if (value.type === 'brief' && typeof value.description === 'string') {
    return { type: 'brief', id, summary, description: value.description, labels };
  }
  if (value.type === 'reminders' && typeof value.reminderHours === 'number') {
    return {
      type: 'reminders',
      id,
      summary,
      reminderHours: value.reminderHours,
      labels,
    };
  }
  if (
    (value.type === 'availability' || (!value.type && Array.isArray(value.slots))) &&
    Array.isArray(value.slots)
  ) {
    return {
      type: 'availability',
      id,
      summary,
      slots: value.slots as string[],
      labels,
    };
  }
  return null;
}
