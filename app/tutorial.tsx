'use client';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/model';

const MOBILE_QUERY = '(max-width: 760px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return mobile;
}

function focusTutorialStep(step: number) {
  const target = document.querySelector(`[data-tutorial-step="${step}"]`);
  if (!(target instanceof HTMLElement)) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('tutorial-focus');
  window.setTimeout(() => target.classList.remove('tutorial-focus'), 1600);
}

export default function Tutorial({
  step,
  project,
  view,
  filter,
  onAction,
  onNext,
  onBack,
  onClose,
}: {
  step: number;
  project: Project;
  view: string;
  filter: string;
  onAction: () => void;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const mobile = useIsMobile();
  const cardRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mobilePhase, setMobilePhase] = useState<'guide' | 'practice'>('guide');
  const [desktopHidden, setDesktopHidden] = useState(false);

  const steps = [
    [
      'Create your workspace',
      'Create a project with a name and deadline. Invite teammates once you’re ready.',
      'Create a project with a name and deadline.',
      'Create project',
      !!project.id,
    ],
    [
      'Add a task',
      'Give your task a clear title, choose a due date, and save it. You can assign it to a teammate.',
      'Add a task with a clear title and due date.',
      'Add a task',
      project.tasks.length > 0,
    ],
    [
      'Complete a task',
      'Check the box beside a task. It leaves the active list but stays in your completion history.',
      'Open Active tasks and check one off.',
      'Open active tasks',
      project.tasks.some((t) => t.status === 'done'),
    ],
    [
      'Explore your dashboard',
      'Click the Completed card on Overview to open your completed tasks. All four summary cards are clickable.',
      'On Overview, tap the Completed card.',
      'Show Completed card',
      view === 'My tasks' && filter === 'done',
    ],
    [
      'Bring your team together',
      'Open Team to see members and create invitations. Use a project’s three-dot menu to edit its details and reminders.',
      'Open Team to manage members and invitations.',
      'Open Team',
      view === 'Team',
    ],
    [
      'You’re ready',
      'Your real work saves automatically when you submit changes. Replay anytime from your profile with Run Tutorial.',
      'You’re set. Replay anytime from profile → Run Tutorial.',
      '',
      true,
    ],
  ] as const;
  const [title, description, mobileDescription, action, ready] = steps[step];
  const body = mobile ? mobileDescription : description;

  useEffect(() => {
    document.body.classList.add('tutorial-running');
    if (mobile) document.body.classList.add('tutorial-mobile');
    else document.body.classList.remove('tutorial-mobile');
    return () => {
      document.body.classList.remove('tutorial-running', 'tutorial-mobile');
    };
  }, [mobile]);

  useEffect(() => {
    setMobilePhase('guide');
    setDesktopHidden(false);
    setPos(null);
    const timer = window.setTimeout(() => focusTutorialStep(step), 120);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (mobile) return;
    function keepInBounds() {
      const card = cardRef.current;
      if (!card || !pos) return;
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      const next = {
        x: Math.min(Math.max(8, pos.x), maxX),
        y: Math.min(Math.max(8, pos.y), maxY),
      };
      if (next.x !== pos.x || next.y !== pos.y) setPos(next);
    }
    window.addEventListener('resize', keepInBounds);
    return () => window.removeEventListener('resize', keepInBounds);
  }, [mobile, pos]);

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (mobile || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    card.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    if (mobile) return;
    const drag = dragRef.current;
    const card = cardRef.current;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    setPos({
      x: Math.min(Math.max(8, event.clientX - drag.offsetX), maxX),
      y: Math.min(Math.max(8, event.clientY - drag.offsetY), maxY),
    });
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      cardRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  function handleAction() {
    onAction();
    window.setTimeout(() => focusTutorialStep(step), 180);
    if (mobile) setMobilePhase('practice');
  }

  if (mobile && mobilePhase === 'practice') {
    return (
      <div className='tutorial-mobile-chip' role='status'>
        <div>
          <strong>
            Step {step + 1}/{steps.length}
          </strong>
          <span>{title}</span>
        </div>
        <div className='tutorial-mobile-chip-actions'>
          <button type='button' className='btn subtle' onClick={() => setMobilePhase('guide')}>
            Tip
          </button>
          <button type='button' className='btn primary' disabled={!ready} onClick={onNext}>
            {ready ? 'Next' : 'Working…'}
          </button>
        </div>
      </div>
    );
  }

  if (!mobile && desktopHidden) {
    return (
      <div className='tutorial-desktop-chip' role='status'>
        <div>
          <strong>
            Step {step + 1}/{steps.length}
          </strong>
          <span>{title}</span>
        </div>
        <div className='tutorial-desktop-chip-actions'>
          <button type='button' className='btn subtle' onClick={() => setDesktopHidden(false)}>
            Show tip
          </button>
          <button type='button' className='btn primary' disabled={!ready} onClick={onNext}>
            {ready ? 'Next' : 'Working…'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {!mobile && (
        <div className='tutorial-banner' role='status'>
          <span className='tutorial-live'>Tutorial</span>
          <span>
            Tutorial in progress · Step {step + 1} of {steps.length}
          </span>
        </div>
      )}
      <section
        ref={cardRef}
        className={
          'tutorial-card' +
          (mobile ? ' mobile' : '') +
          (dragging ? ' dragging' : '') +
          (pos ? ' positioned' : '')
        }
        aria-label='Tutorial walkthrough'
        role='dialog'
        aria-modal='false'
        tabIndex={-1}
        style={
          !mobile && pos
            ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
            : undefined
        }
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {!mobile && (
          <div className='tutorial-drag-handle' aria-hidden='true'>
            <span />
            <span />
            <span />
          </div>
        )}
        <div className='tutorial-progress' aria-hidden='true'>
          {steps.map((_, index) => (
            <span
              key={index}
              className={index === step ? 'active' : index < step ? 'done' : undefined}
            />
          ))}
        </div>
        <div className='tutorial-top'>
          <span>
            <span className='tutorial-live'>Tutorial</span>
            Step {step + 1} of {steps.length}
          </span>
          <button className='btn subtle' onClick={onClose}>
            {mobile ? 'Skip' : 'Skip tutorial'}
          </button>
        </div>
        {!mobile && (
          <p className='tutorial-drag-hint'>Drag to move this panel anywhere on the screen.</p>
        )}
        {mobile && (
          <p className='tutorial-drag-hint'>We’ll take you to each spot, then shrink this tip so you can tap.</p>
        )}
        <h2>{title}</h2>
        <p>{body}</p>
        <div className='tutorial-actions'>
          {action && (
            <button className='btn' onClick={handleAction}>
              {action}
            </button>
          )}
          {step > 0 && (
            <button className='btn subtle' onClick={onBack}>
              Back
            </button>
          )}
          <button className='btn primary' disabled={!ready} onClick={onNext}>
            {step === steps.length - 1
              ? 'Finish'
              : ready
                ? 'Next step'
                : 'Complete to continue'}
          </button>
          <button
            type='button'
            className='btn subtle'
            onClick={() => {
              focusTutorialStep(step);
              if (mobile) setMobilePhase('practice');
              else setDesktopHidden(true);
            }}
          >
            Hide tip & try it
          </button>
        </div>
      </section>
    </>
  );
}
