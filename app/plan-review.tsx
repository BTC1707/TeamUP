'use client';
import { useState } from 'react';
import { memberLabel, type Member, type Milestone, type Task } from '@/lib/model';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SuggestedPlan = {
  tasks: Task[];
  milestones: Milestone[];
  unreadFiles?: string[];
};

export default function PlanReview({
  plan,
  members,
  busy,
  cancelDeletesProject = false,
  onChange,
  onAccept,
  onCancel,
  onRegenerate,
}: {
  plan: SuggestedPlan;
  members: Member[];
  busy?: boolean;
  /** When true, Cancel removes the freshly created project. */
  cancelDeletesProject?: boolean;
  onChange: (next: SuggestedPlan) => void;
  onAccept: () => void;
  onCancel: () => void;
  onRegenerate?: () => void;
}) {
  const [section, setSection] = useState<'milestones' | 'tasks'>('milestones');

  function updateTask(taskId: string, patch: Partial<Task>) {
    onChange({
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    });
  }

  function removeTask(taskId: string) {
    onChange({
      ...plan,
      tasks: plan.tasks.filter((t) => t.id !== taskId),
    });
  }

  function updateMilestone(milestoneId: string, patch: Partial<Milestone>) {
    onChange({
      ...plan,
      milestones: plan.milestones.map((m) =>
        m.id === milestoneId ? { ...m, ...patch } : m,
      ),
    });
  }

  function removeMilestone(milestoneId: string) {
    onChange({
      ...plan,
      milestones: plan.milestones.filter((m) => m.id !== milestoneId),
      tasks: plan.tasks.map((t) =>
        t.milestone === milestoneId ? { ...t, milestone: '' } : t,
      ),
    });
  }

  function skipAllMilestones() {
    onChange({
      ...plan,
      milestones: [],
      tasks: plan.tasks.map((t) => ({ ...t, milestone: '' })),
    });
  }

  const canAccept = plan.tasks.length > 0 || plan.milestones.length > 0;

  return (
    <div className='plan-review'>
      {!!plan.unreadFiles?.length && (
        <div className='notice'>
          Couldn’t use for planning: {plan.unreadFiles.join(', ')}. Accepted types: PDF, DOCX,
          images, TXT/MD/CSV.
        </div>
      )}

      <p className='form-note'>
        Review milestones, then switch to tasks. Edit anything before accepting.
        {cancelDeletesProject
          ? ' Cancel removes this project so you can start over.'
          : ''}
      </p>

      <div className='plan-review-tabs' role='tablist' aria-label='Plan sections'>
        <button
          type='button'
          role='tab'
          aria-selected={section === 'milestones'}
          className={section === 'milestones' ? 'is-selected' : undefined}
          onClick={() => setSection('milestones')}
        >
          Milestones
          <span>{plan.milestones.length}</span>
        </button>
        <button
          type='button'
          role='tab'
          aria-selected={section === 'tasks'}
          className={section === 'tasks' ? 'is-selected' : undefined}
          onClick={() => setSection('tasks')}
        >
          Tasks
          <span>{plan.tasks.length}</span>
        </button>
      </div>

      {section === 'milestones' ? (
        <>
      <div className='plan-review-section-head'>
        <h3>
          {plan.milestones.length
            ? `${plan.milestones.length} suggested milestone${plan.milestones.length === 1 ? '' : 's'}`
            : 'No milestones'}
        </h3>
        {plan.milestones.length > 0 && (
          <button
            type='button'
            className='btn plan-review-skip'
            disabled={busy}
            onClick={skipAllMilestones}
          >
            Skip milestones
          </button>
        )}
      </div>
      {plan.milestones.length === 0 ? (
        <p className='form-note'>Accepting will add tasks only (no new milestones).</p>
      ) : (
        <div className='plan-review-milestones'>
          {plan.milestones.map((m) => (
            <div className='plan-review-card' key={m.id}>
              <label>
                Milestone title
                <input
                  value={m.title}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => updateMilestone(m.id, { title: e.target.value })}
                />
              </label>
              <label>
                Description (optional)
                <textarea
                  value={m.description || ''}
                  maxLength={5000}
                  disabled={busy}
                  rows={2}
                  onChange={(e) => updateMilestone(m.id, { description: e.target.value })}
                />
              </label>
              <div className='plan-review-card-row'>
                <label>
                  Due date
                  <input
                    type='date'
                    value={m.due}
                    disabled={busy}
                    onChange={(e) => updateMilestone(m.id, { due: e.target.value })}
                  />
                </label>
                <button
                  type='button'
                  className='btn'
                  disabled={busy}
                  onClick={() => removeMilestone(m.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      ) : (
        <>
      <h3>
        {plan.tasks.length
          ? `${plan.tasks.length} suggested task${plan.tasks.length === 1 ? '' : 's'}`
          : 'No tasks'}
      </h3>
      {plan.tasks.length === 0 ? (
        <p className='form-note'>
          All tasks were removed. Accept will only add the milestones on the Milestones tab.
        </p>
      ) : (
        <div className='plan-review-tasks'>
          {plan.tasks.map((t) => (
            <div className='plan-review-card plan-review-task-card' key={t.id}>
              <label>
                Task title
                <input
                  value={t.title}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => updateTask(t.id, { title: e.target.value })}
                />
              </label>
              <label>
                Description (optional)
                <textarea
                  value={t.description || ''}
                  maxLength={5000}
                  disabled={busy}
                  rows={2}
                  onChange={(e) => updateTask(t.id, { description: e.target.value })}
                />
              </label>
              <div className='plan-review-card-grid'>
                <label>
                  Due date
                  <input
                    type='date'
                    value={t.due}
                    disabled={busy}
                    onChange={(e) => updateTask(t.id, { due: e.target.value })}
                  />
                </label>
                <label>
                  Assignee
                  <Select
                    value={t.assignee || 'none'}
                    onValueChange={(v) =>
                      updateTask(t.id, { assignee: v === 'none' ? '' : v })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger className='plan-review-select w-full min-w-0'>
                      <SelectValue placeholder='Unassigned' />
                    </SelectTrigger>
                    <SelectContent position='popper' className='max-w-[min(90vw,360px)]'>
                      <SelectItem value='none'>Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {memberLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className='plan-review-milestone-field'>
                  Milestone
                  <Select
                    value={t.milestone || 'none'}
                    onValueChange={(v) =>
                      updateTask(t.id, { milestone: v === 'none' ? '' : v })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger className='plan-review-select w-full min-w-0'>
                      <SelectValue placeholder='No milestone' />
                    </SelectTrigger>
                    <SelectContent position='popper' className='max-w-[min(90vw,360px)]'>
                      <SelectItem value='none'>No milestone</SelectItem>
                      {plan.milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id} textValue={m.title || 'Untitled'}>
                          {m.title || 'Untitled milestone'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <button
                type='button'
                className='btn plan-review-remove'
                disabled={busy}
                onClick={() => removeTask(t.id)}
              >
                Remove task
              </button>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      <div className='plan-review-actions'>
        <button
          type='button'
          className='btn primary'
          disabled={busy || !canAccept}
          onClick={onAccept}
        >
          {busy
            ? 'Saving…'
            : plan.milestones.length === 0 && plan.tasks.length > 0
              ? 'Accept tasks'
              : plan.tasks.length === 0 && plan.milestones.length > 0
                ? 'Accept milestones'
                : 'Accept plan'}
        </button>
        {onRegenerate ? (
          <button type='button' className='btn' disabled={busy} onClick={onRegenerate}>
            Regenerate
          </button>
        ) : null}
        <button type='button' className='btn' disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
