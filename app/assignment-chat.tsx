'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, FileText, CheckSquare, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  localDemo = false,
  userId,
  onCreate,
  onBrief,
  onPlan,
  onProjectUpdate,
}: {
  project: Project;
  aiReady: boolean;
  /** Localhost sandbox: call /api/chat/demo with in-memory project (no D1). */
  localDemo?: boolean;
  userId?: string;
  onCreate: () => void;
  onBrief: () => void;
  onPlan: () => void;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const latest = useRef<HTMLDivElement>(null);
  const requestId = useRef<string | null>(null);
  const outboundQueue = useRef<string[]>([]);
  const drainingQueue = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const pendingProposalRef = useRef<PendingProposal | null>(null);
  const projectRef = useRef(project);
  const isDemo = !project.id;
  const chatEndpoint = localDemo ? '/api/chat/demo' : '/api/chat';

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    pendingProposalRef.current = pendingProposal;
  }, [pendingProposal]);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  function openBrief() {
    setContextOpen(false);
    onBrief();
  }

  function openPlan() {
    setContextOpen(false);
    onPlan();
  }

  const contextPanel = (
    <>
      <section className='panel chat-context-panel'>
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
          <button type='button' className='btn' onClick={openBrief}>
            Edit assignment brief
          </button>
          <small>
            AI can reference your brief, tasks, milestones, and recent project files. You can also
            ask it to edit tasks, milestones, the brief, reminders, and availability — with
            confirmation before anything is saved.
          </small>
        </div>
      </section>
      <section className='planner-card'>
        <CheckSquare size={25} />
        <h2>Ready to make a plan?</h2>
        <p>Turn the assignment requirements into tasks and milestones you can review.</p>
        <button type='button' className='btn' onClick={openPlan}>
          Open AI planner <Sparkles size={15} />
        </button>
      </section>
    </>
  );
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
    setQueuedCount(0);
    outboundQueue.current = [];
    drainingQueue.current = false;
    requestId.current = null;
    if (isDemo || localDemo) {
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
  }, [project.id, isDemo, localDemo]);

  useEffect(() => {
    if (messages.length || busy || queuedCount)
      latest.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, busy, pendingProposal, queuedCount]);

  function syncQueueCount() {
    setQueuedCount(outboundQueue.current.length);
  }

  function enqueueQuestion(text: string) {
    outboundQueue.current.push(text);
    syncQueueCount();
  }

  function isLockConflict(status: number, message: string) {
    return (
      status === 409 &&
      /already being prepared|please wait/i.test(message || '')
    );
  }

  async function postChat(
    body: Record<string, unknown>,
    failureMessage: string,
  ): Promise<{ ok: true; data: any } | { ok: false; error: string; lockConflict: boolean }> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await response.json().catch(() => ({}));
      const message = data.error || failureMessage;
      if (response.ok) return { ok: true, data };
      if (isLockConflict(response.status, message) && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      return {
        ok: false,
        error: message,
        lockConflict: isLockConflict(response.status, message),
      };
    }
    return {
      ok: false,
      error: failureMessage,
      lockConflict: true,
    };
  }

  async function askQuestion(text: string): Promise<boolean> {
    const activeProposal = pendingProposalRef.current;
    setError('');
    // Keep the pending proposal while refining (assign/due tweaks). Only clear for a fresh ask.
    if (!activeProposal) setPendingProposal(null);
    requestId.current ??= crypto.randomUUID();
    const currentProject = projectRef.current;
    const body = localDemo
      ? {
          project: currentProject,
          messages: messagesRef.current,
          userId: userId || currentProject.members[0]?.id,
          question: text,
          timeZone,
          pendingProposal: activeProposal ? proposalPayload(activeProposal) : undefined,
        }
      : {
          project: currentProject.id,
          question: text,
          requestId: requestId.current,
          timeZone,
          pendingProposal: activeProposal ? proposalPayload(activeProposal) : undefined,
        };

    try {
      const result = await postChat(body, 'Unable to get an answer. Please try again.');
      if (!result.ok) {
        setError(
          result.lockConflict
            ? 'Still finishing the previous answer. Your message stayed in the box — send again in a moment.'
            : result.error,
        );
        setQuestion((current) => current || text);
        return false;
      }
      setMessages(result.data.messages);
      setPendingProposal(normalizePending(result.data.pendingProposal));
      requestId.current = null;
      return true;
    } catch (e) {
      setError((e as Error).message || 'Unable to get an answer. Please try again.');
      setQuestion((current) => current || text);
      return false;
    }
  }

  async function applyProposal(confirm: boolean): Promise<boolean> {
    const proposal = pendingProposalRef.current;
    if (!proposal) return false;
    const action = confirm ? CONFIRM_ACTION[proposal.type] : CANCEL_ACTION[proposal.type];
    setError('');
    const currentProject = projectRef.current;
    const body = localDemo
      ? {
          project: currentProject,
          messages: messagesRef.current,
          userId: userId || currentProject.members[0]?.id,
          action,
          timeZone,
          proposal: proposalPayload(proposal),
        }
      : {
          project: currentProject.id,
          action,
          timeZone,
          proposal: proposalPayload(proposal),
        };

    try {
      const result = await postChat(body, 'Unable to apply that change.');
      if (!result.ok) {
        setError(
          result.lockConflict
            ? 'Still finishing the previous answer. Try confirming again in a moment.'
            : result.error,
        );
        return false;
      }
      setMessages(result.data.messages);
      setPendingProposal(null);
      if (result.data.project && onProjectUpdate) onProjectUpdate(result.data.project);
      return true;
    } catch (e) {
      setError((e as Error).message || 'Unable to apply that change.');
      return false;
    }
  }

  async function processOutboundText(text: string): Promise<boolean> {
    const activeProposal = pendingProposalRef.current;
    if (activeProposal) {
      const decision = proposalDecision(text);
      if (decision === 'confirm') return applyProposal(true);
      if (decision === 'cancel') return applyProposal(false);
    }
    return askQuestion(text);
  }

  async function drainOutboundQueue() {
    if (drainingQueue.current) return;
    drainingQueue.current = true;
    setBusy(true);
    try {
      while (outboundQueue.current.length) {
        const next = outboundQueue.current.shift()!;
        syncQueueCount();
        const ok = await processOutboundText(next);
        if (!ok) {
          // Keep remaining queued items; failed text is restored to the composer when needed.
          break;
        }
      }
    } finally {
      drainingQueue.current = false;
      setBusy(false);
      syncQueueCount();
    }
  }

  function resolveProposal(confirm: boolean) {
    const proposal = pendingProposalRef.current;
    if (!proposal) return;
    enqueueQuestion(confirm ? 'yes' : 'cancel');
    void drainOutboundQueue();
  }

  async function clearChatHistory() {
    if (clearingHistory || loading || (isDemo && !localDemo)) return;
    setClearingHistory(true);
    setError('');
    outboundQueue.current = [];
    syncQueueCount();
    try {
      if (localDemo || isDemo) {
        setMessages([]);
        setPendingProposal(null);
        setQuestion('');
        requestId.current = null;
        setClearConfirmOpen(false);
        return;
      }
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.id, action: 'clearHistory' }),
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to clear chat history.');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setPendingProposal(null);
      setQuestion('');
      requestId.current = null;
      setClearConfirmOpen(false);
    } catch (e) {
      setError((e as Error).message || 'Unable to clear chat history.');
    } finally {
      setClearingHistory(false);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo && !localDemo) {
      onCreate();
      return;
    }
    const text = question.trim();
    if (!text || loading || (!aiReady && !isDemo)) return;

    setQuestion('');
    requestId.current = null;
    setError('');
    enqueueQuestion(text);
    void drainOutboundQueue();
  }

  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === 'assistant')?.id || null;

  return (
    <div className='chat-layout'>
      <section className='panel chat-panel'>
        <div className='panel-heading'>
          <div className='flex items-center gap-3 min-w-0'>
            <span className='stat-icon'>
              <MessageCircle size={20} />
            </span>
            <div className='min-w-0'>
              <h2>Assignment chat</h2>
              <p className='subtext !mt-1'>A place to work through the details.</p>
            </div>
          </div>
          <div className='chat-heading-actions'>
            <button
              type='button'
              className='btn chat-context-trigger'
              onClick={() => setContextOpen(true)}
            >
              <FileText size={15} />
              Context
            </button>
            {messages.length > 0 || queuedCount > 0 ? (
              <button
                type='button'
                className='btn subtle'
                disabled={clearingHistory || loading || busy || (isDemo && !localDemo)}
                title={busy ? 'Wait for the current answer to finish.' : undefined}
                onClick={() => setClearConfirmOpen(true)}
              >
                Clear chat
              </button>
            ) : null}
            <span className='status'>{aiReady ? 'AI connected' : 'Setup pending'}</span>
          </div>
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
                      onClick={() => resolveProposal(true)}
                    >
                      {busy ? `Queue: ${CONFIRM_LABEL[pendingProposal.type]}` : CONFIRM_LABEL[pendingProposal.type]}
                    </button>
                    <button type='button' className='btn' onClick={() => resolveProposal(false)}>
                      {busy ? 'Queue cancel' : 'Cancel'}
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
              <div>
                {queuedCount > 0
                  ? `Working through your question… ${queuedCount} more waiting.`
                  : 'Working through your question…'}
              </div>
            </article>
          )}
          <div ref={latest} />
        </div>
        {error && (
          <div className='error mx-5' role='alert'>
            {error}
          </div>
        )}
        {queuedCount > 0 && !error ? (
          <div className='notice mx-5' role='status'>
            {queuedCount} message{queuedCount === 1 ? '' : 's'} queued — they’ll send when this
            answer finishes.
          </div>
        ) : null}
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
            placeholder={
              busy
                ? 'Type the next message — it will queue until this answer finishes…'
                : 'Ask a question or tell me what to change on the project…'
            }
            maxLength={6000}
            value={question}
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
            disabled={loading || !question.trim() || (!aiReady && !isDemo)}
            aria-label={busy ? 'Queue question' : 'Send question'}
          >
            <Send size={17} />
            <span>{busy ? 'Queue' : 'Send'}</span>
          </button>
        </form>
        <p className='chat-footnote'>
          Your chat is saved privately to your account. Changes to tasks, milestones, brief, and
          reminders ask for confirmation first. Check important details against the assignment
          brief.
        </p>
      </section>
      <aside className='stack chat-aside-desktop'>{contextPanel}</aside>
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className='chat-context-dialog max-h-[88vh] overflow-y-auto sm:max-w-[420px]'>
          <DialogHeader>
            <DialogTitle>Assignment context</DialogTitle>
            <DialogDescription>
              Review the brief and open planning tools for this project.
            </DialogDescription>
          </DialogHeader>
          <div className='chat-context-dialog-body stack'>{contextPanel}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className='sm:max-w-[420px]'>
          <DialogHeader>
            <DialogTitle>Clear chat history?</DialogTitle>
            <DialogDescription>
              This removes your Assignment chat messages for this project only. Tasks, milestones,
              and other project data stay as they are.
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-wrap justify-end gap-2 pt-2'>
            <button
              type='button'
              className='btn'
              disabled={clearingHistory}
              onClick={() => setClearConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type='button'
              className='btn primary'
              disabled={clearingHistory}
              onClick={() => void clearChatHistory()}
            >
              {clearingHistory ? 'Clearing…' : 'Clear chat'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Map short confirm/cancel replies onto the pending proposal actions. */
function proposalDecision(raw: string): 'confirm' | 'cancel' | null {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!text || text.length > 80) return null;
  if (
    /^(n|no|nope|cancel|never ?mind|don'?t|discard|scratch that)\b/.test(text) &&
    !/\b(yes|confirm|apply)\b/.test(text)
  )
    return 'cancel';
  // "yes", "yes thats right", "ok apply", "that's right", etc.
  if (
    /^(y|yes|yeah|yep|yup|ok|okay|sure|confirm|apply|do it|lgtm)\b/.test(text) ||
    /^(looks good|that'?s right|thats right|sounds good|go ahead|please do)\b/.test(text)
  ) {
    if (/\b(don'?t|do not|not yet|wrong|no)\b/.test(text)) return null;
    return 'confirm';
  }
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
