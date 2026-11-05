'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, FileText, CheckSquare, MessageCircle } from 'lucide-react';
import type { Project } from '@/lib/model';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type PendingProposal = {
  id: string;
  summary: string;
  slots: string[];
  labels: string[];
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
      setPendingProposal(data.pendingProposal || null);
      setQuestion('');
      requestId.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveProposal(action: 'confirmAvailability' | 'cancelAvailability') {
    if (busy || !pendingProposal) return;
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
          proposal: {
            slots: pendingProposal.slots,
            summary: pendingProposal.summary,
          },
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update availability.');
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
                Ask about the requirements, set your availability in plain language, or work out
                your next step.
              </p>
              <div className='chat-prompts'>
                {[
                  'What are the main deliverables for this assignment?',
                  'I’m free Tuesday from 10am to 2pm.',
                  'What should our group work on next?',
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
                      onClick={() => resolveProposal('confirmAvailability')}
                    >
                      Confirm availability
                    </button>
                    <button
                      type='button'
                      className='btn'
                      disabled={busy}
                      onClick={() => resolveProposal('cancelAvailability')}
                    >
                      Cancel
                    </button>
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
            placeholder='Ask about your assignment or say when you’re free…'
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
          Your chat is saved privately to your account. Try “I’m free Tuesday 10am–2pm” to propose
          availability. Check important details against the assignment brief.
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
              CSV files under 100 KB each. For PDFs and other formats, paste the relevant text into
              your brief or question. You can also describe your availability in chat for
              confirmation.
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
