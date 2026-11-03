'use client';
import { useState, useEffect } from 'react';
import AssignmentChat from './assignment-chat';
import ConnectAI from './connect-ai';
import InviteLink from './invite-link';
import Tutorial from './tutorial';
import { practiceProject, demoUser } from '@/lib/demo';
import {
  clearLocalAdminSession,
  hasLocalAdminSession,
  localAdminUser,
} from '@/lib/local-dev-account';
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Flag,
  FolderOpen,
  Users,
  Plus,
  Bell,
  Sparkles,
  ArrowUpRight,
  Check,
  Clock,
  MoreHorizontal,
  LogOut,
  Layers,
  FileText,
  Download,
  Settings,
  ArrowRight,
  LockKeyhole,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { emptyProject, future, type Project, type Task, type Member } from '@/lib/model';
const nav = [
  ['Overview', LayoutDashboard],
  ['Assignment chat', Sparkles],
  ['My tasks', CheckSquare],
  ['Milestones', Flag],
  ['Availability', CalendarDays],
  ['Files', FolderOpen],
  ['Team', Users],
  ['Project settings', Settings],
] as const;
const initials = (name: string) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const fmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const uid = () => crypto.randomUUID();
function Picker({
  value,
  onChange,
  options,
  placeholder = 'Choose',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value || 'none'} onValueChange={onChange}>
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value || 'none'}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function isBrowserLocalHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export default function Workspace({ demoMode = false }: { demoMode?: boolean }) {
  const [tour, setTour] = useState<number | null>(null);
  const [canConfigureAI, setCanConfigureAI] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>(emptyProject);
  const [user, setUser] = useState<{
    id: string;
    name: string;
    username?: string;
    email: string;
    address?: string;
    phone?: string;
    language?: string;
    timeZone?: string;
    notifications?: boolean;
    tutorialSeen?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('Overview');
  const [modal, setModal] = useState('');
  const [filter, setFilter] = useState('active');
  const [milestoneFilter, setMilestoneFilter] = useState('all');
  const [draft, setDraft] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [requirements, setRequirements] = useState('');
  // Localhost + /demo: fully interactive in memory (no Cloudflare DB).
  const [localOnly, setLocalOnly] = useState(demoMode);
  const isDemo = !project.id;
  const today = future(0);
  const done = project.tasks.filter((t) => t.status === 'done').length;
  const percent = Math.round((done / Math.max(1, project.tasks.length)) * 100);
  const me = user?.id || '';
  const mine = project.tasks.filter((t) => t.assignee === me && t.status !== 'done');
  const isOwner = !isDemo && project.owner === user?.id;

  function startLocalSandbox() {
    clearLocalAdminSession();
    const p = practiceProject();
    setLocalOnly(true);
    setProject(p);
    setProjects([p]);
    setUser(demoUser);
    setLoading(false);
    setError('');
    setTour(0);
  }

  /** Signed-in local admin — sidebar shows "admin", not Demo visitor. */
  function startLocalAdminWorkspace() {
    // Keep saves in-memory if the local API/DB path is unavailable, but identity is admin.
    setLocalOnly(true);
    setUser(localAdminUser());
    setProjects([]);
    setProject(emptyProject);
    setLoading(false);
    setError('');
    setTour(null);
  }

  const isLocalAdmin =
    user?.username === 'admin' || user?.email === 'admin@teamup.local' || user?.name === 'admin';

  async function api(url: string, options?: RequestInit) {
    // Only block API calls in the in-memory demo/sandbox — not for signed-in localhost admin.
    if (localOnly || demoMode)
      throw new Error('This feature needs a real account. Exit the demo and sign in.');
    const r = await fetch(url, options);
    const data: any = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  async function load() {
    setLoading(true);
    try {
      const data = await api('/api/workspace');
      setUser(data.user);
      setProjects(data.projects);
      setAiReady(data.aiReady);
      setCanConfigureAI(data.canConfigureAI);
      if (!data.user.tutorialSeen) setTour(0);
      setProject(
        data.projects.find(
          (p: Project) => p.id === new URLSearchParams(window.location.search).get('project'),
        ) ||
          data.projects[0] ||
          emptyProject,
      );
      setError('');
    } catch (e) {
      setError(
        (e as Error).message === 'Sign in to open your workspace.' ? '' : (e as Error).message,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // /demo → always in-memory practice (no DB).
    if (demoMode) {
      startLocalSandbox();
      return;
    }

    // localhost /workspace:
    // - Local admin session → show "admin" (never Demo visitor)
    // - Signed out → in-memory sandbox for UI/CSS practice
    if (isBrowserLocalHost()) {
      (async () => {
        setLoading(true);
        const adminSession = hasLocalAdminSession();
        try {
          const r = await fetch('/api/workspace');
          const data: any = await r.json();
          if (r.ok && data.user) {
            setLocalOnly(false);
            setUser({
              ...data.user,
              // Force sidebar label for the hardcoded local admin.
              name:
                data.user.username === 'admin' || data.user.email === 'admin@teamup.local'
                  ? 'admin'
                  : data.user.name,
              username:
                data.user.username ||
                (data.user.email === 'admin@teamup.local' ? 'admin' : data.user.username),
            });
            setProjects(data.projects || []);
            setAiReady(!!data.aiReady);
            setCanConfigureAI(!!data.canConfigureAI);
            if (!data.user.tutorialSeen) setTour(0);
            setProject(
              (data.projects || []).find(
                (p: Project) =>
                  p.id === new URLSearchParams(window.location.search).get('project'),
              ) ||
                data.projects?.[0] ||
                emptyProject,
            );
            setError('');
            setLoading(false);
            return;
          }
        } catch {
          // Fall through — admin marker still wins over Demo visitor.
        }
        if (adminSession) {
          startLocalAdminWorkspace();
          return;
        }
        startLocalSandbox();
      })();
      return;
    }

    load();
  }, []);
  useEffect(() => {
    if (view === 'Files' && !isDemo && !localOnly)
      api('/api/files?project=' + project.id)
        .then((d) => setFiles(d.files))
        .catch((e) => toast.error(e.message));
  }, [view, project.id, localOnly]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'read_project_overview',
          title: 'Read project overview',
          description: 'Read the currently visible project, its tasks, and milestones.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: any) => {
            if (!input || typeof input !== 'object' || Object.keys(input).length)
              throw new Error('Expected an empty object');
            return {
              name: project.name,
              tasks: project.tasks,
              milestones: project.milestones,
              demo: localOnly,
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [project, localOnly]);
  function open(type: string, data: any = {}) {
    setDraft(data);
    setModal(type);
    setError('');
    setPlan(null);
  }
  async function save(next: Project, create = false) {
    // Local sandbox: keep everything in React state (no API / no DB).
    if (localOnly) {
      setProject(next);
      setProjects((prev) => {
        if (create) return [...prev.filter((p) => p.id !== next.id), next];
        return prev.map((p) => (p.id === next.id ? next : p));
      });
      return true;
    }
    setBusy(true);
    try {
      const result = await api('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: create ? 'create' : 'update', project: next }),
      });
      setProject(result.project);
      setProjects((prev) =>
        create
          ? [...prev, result.project]
          : prev.map((p) => (p.id === next.id ? result.project : p)),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function requireProject() {
    if (isDemo) {
      open('project', { name: '', due: future(14), course: '', description: '' });
      toast.info('Create your own project to start saving changes.');
      return false;
    }
    return true;
  }
  async function setStatus(t: Task) {
    if (!requireProject()) return;
    if (
      await save({
        ...project,
        tasks: project.tasks.map((x) =>
          x.id === t.id ? { ...x, status: x.status === 'done' ? 'todo' : 'done' } : x,
        ),
      })
    )
      toast.success(
        t.status === 'done' ? 'Task reopened.' : 'Task completed. Find it in Completed.',
      );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    let ok = false;
    if (modal === 'project') {
      if (!user) {
        setError('Sign in before creating your project.');
        return;
      }
      ok = await save(
        {
          id: uid(),
          name: draft.name,
          course: draft.course,
          description: draft.description,
          due: draft.due,
          members: [{ id: user.id, name: user.name, email: user.email }],
          tasks: [],
          milestones: [],
          availability: {},
          reminderHours: 24,
          version: 0,
        },
        true,
      );
    }
    if (modal === 'task') {
      const t = {
        id: draft.id || uid(),
        title: draft.title,
        description: draft.description || '',
        assignee: draft.assignee === 'none' ? '' : draft.assignee || '',
        due: draft.due,
        status: draft.status || 'todo',
        milestone: draft.milestone || '',
      };
      ok = await save({
        ...project,
        tasks: draft.id
          ? project.tasks.map((x) => (x.id === draft.id ? t : x))
          : [...project.tasks, t],
      });
    }
    if (modal === 'milestone') {
      ok = await save({
        ...project,
        milestones: [
          ...project.milestones,
          {
            id: uid(),
            title: draft.title,
            description: draft.description || '',
            due: draft.due,
            done: false,
          },
        ],
      });
    }
    if (modal === 'member') {
      if (project.members.some((m) => m.email.toLowerCase() === draft.email.toLowerCase())) {
        setError('This email is already on the team.');
        return;
      }
      ok = await save({
        ...project,
        members: [
          ...project.members,
          { id: uid(), name: draft.name, email: draft.email.toLowerCase() },
        ],
      });
    }
    if (modal === 'brief') {
      ok = await save({ ...project, description: draft.description || '' });
    }
    if (modal === 'reminders') {
      ok = await save({ ...project, reminderHours: Number(draft.hours) });
    }
    if (modal === 'profile' && localOnly) {
      setUser((u) => (u ? { ...u, ...draft } : u));
      setModal('');
      toast.success('Local profile updated (not saved to the cloud).');
      return;
    }
    if (modal === 'profile') {
      setBusy(true);
      try {
        await api('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'profile', ...draft }),
        });
        setUser((u) => (u ? { ...u, ...draft } : u));
        ok = true;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
    if (ok) {
      setModal('');
      toast.success('Saved to your workspace.');
    }
  }
  const taskRows = (tasks: Task[]) =>
    tasks.length ? (
      tasks.map((t) => (
        <div className='task-row' key={t.id}>
          <Checkbox
            aria-label={`Mark ${t.title} ${t.status === 'done' ? 'incomplete' : 'complete'}`}
            checked={t.status === 'done'}
            disabled={busy}
            onCheckedChange={() => setStatus(t)}
          />
          <button
            className='task-title text-left'
            onClick={() => {
              if (requireProject()) open('task', t);
            }}
          >
            <p className={t.status === 'done' ? 'task-complete' : ''}>{t.title}</p>
            <small>
              {project.milestones.find((m) => m.id === t.milestone)?.title || 'No milestone'}
            </small>
          </button>
          <span
            className={
              'status ' + (t.status === 'progress' ? 'progress' : t.status === 'done' ? 'done' : '')
            }
          >
            {t.status === 'progress' ? 'In progress' : t.status === 'done' ? 'Completed' : 'To do'}
          </span>
          <span
            className='avatar'
            title={project.members.find((m) => m.id === t.assignee)?.name || 'Unassigned'}
          >
            {initials(project.members.find((m) => m.id === t.assignee)?.name || '–')}
          </span>
          <span className='task-due'>{fmt(t.due)}</span>
        </div>
      ))
    ) : (
      <div className='empty'>
        {filter === 'done'
          ? 'No completed tasks yet.'
          : 'You’re all caught up. Add a task when you’re ready.'}
      </div>
    );
  const milestoneList = project.milestones
    .filter((m) => milestoneFilter !== 'upcoming' || !m.done)
    .map((m) => (
      <div className='milestone' key={m.id}>
        <button
          className='milestone-icon'
          aria-label={`Mark ${m.title} ${m.done ? 'incomplete' : 'complete'}`}
          disabled={busy}
          onClick={() => {
            if (requireProject())
              save({
                ...project,
                milestones: project.milestones.map((x) =>
                  x.id === m.id ? { ...x, done: !x.done } : x,
                ),
              });
          }}
        >
          {m.done ? <Check size={15} /> : <Flag size={13} />}
        </button>
        <div>
          <p>{m.title}</p>
          <small>
            {fmt(m.due)}
            {m.done ? ' · Completed' : ''}
          </small>
        </div>
      </div>
    ));
  return (
    <SidebarProvider style={{ '--sidebar-width': '235px' } as React.CSSProperties}>
      <Sidebar>
        <SidebarHeader className='px-6 pt-7 pb-5'>
          <div className='brand'>
            <span className='brandmark'>
              <Layers size={23} />
            </span>
            teamup<span style={{ color: '#8175d9' }}>.</span>
          </div>
        </SidebarHeader>
        <SidebarContent className='px-4 workspace-sidebar-content'>
          <p className='sidebar-label'>WORKSPACE</p>
          <SidebarMenu>
            {nav.map(([name, Icon]) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  className='h-10 px-3 text-[14px]'
                  isActive={view === name}
                  onClick={() => {
                    setView(name);
                    if (name === 'My tasks') setFilter('active');
                    if (name === 'Milestones') setMilestoneFilter('all');
                  }}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === 'My tasks' && (
                    <span className='ml-auto text-xs rounded bg-[#f0eef7] px-1.5'>
                      {mine.length}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className='flex justify-between items-center mt-3'>
            <p className='sidebar-label !my-3'>YOUR PROJECTS</p>
            <button
              aria-label='Create project'
              onClick={() => open('project', { due: future(14) })}
            >
              <Plus size={16} color='#9ba2b0' />
            </button>
          </div>
          {projects.length ? (
            projects.map((p) => (
              <button
                key={p.id}
                title={p.name}
                className={'project-option ' + (p.id === project.id ? 'active' : '')}
                onClick={() => {
                  setProject(p);
                  setView('Overview');
                  setError('');
                }}
              >
                ▧ &nbsp; {p.name}
              </button>
            ))
          ) : (
            <p className='project-option muted'>No projects yet</p>
          )}
          <button className='project-option' onClick={() => open('project', { due: future(14) })}>
            ＋ &nbsp; New project
          </button>
        </SidebarContent>
        <SidebarFooter>
          <button
            className='project-option'
            onClick={() => {
              if (user) setTour(0);
              else window.location.assign('/demo');
            }}
          >
            Getting started guide
          </button>
          <button
            className='account'
            onClick={() =>
              open('profile', {
                ...user,
                timeZone: user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            }
          >
            <span className='avatar'>
              {initials(isLocalAdmin ? 'admin' : user?.username || user?.name || 'Guest')}
            </span>
            <span className='text-left'>
              {isLocalAdmin ? 'admin' : user?.username || user?.name || 'Your workspace'}
              <small>
                {isLocalAdmin
                  ? 'Local admin account'
                  : localOnly
                    ? 'Demo sandbox'
                    : user
                      ? 'Personal account'
                      : 'Sign in to save your work'}
              </small>
            </span>
            <Settings className='ml-auto' size={15} color='#9da3af' />
          </button>
        </SidebarFooter>
      </Sidebar>
      <main className='app-main'>
        <header className='topbar'>
          <div className='flex gap-3 items-center'>
            {/* Sidebar toggle only on small screens — desktop already shows the sidebar. */}
            <SidebarTrigger className='mobile-sidebar-trigger' />
            <span className='mobile-title'>teamup.</span>
          </div>
          <div className='top-actions'>
            <span className='muted text-[13px] hidden sm:block'>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <button
              className='bell'
              aria-label='Reminder settings'
              onClick={() => {
                if (requireProject()) open('reminders', { hours: project.reminderHours });
              }}
            >
              <Bell size={19} />
            </button>
            <button
              type='button'
              className='avatar profile-avatar-button'
              aria-label='Open profile settings'
              title='Profile settings'
              onClick={() =>
                open('profile', {
                  ...user,
                  timeZone: user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            >
              {initials(user?.username || user?.name || 'You')}
            </button>
          </div>
        </header>
        <div className='content'>
          {(localOnly || isLocalAdmin) && (
            <div className='notice demo-banner'>
              <span>
                {isLocalAdmin ? (
                  <>
                    <strong>Local admin</strong> · Signed in as <strong>admin</strong>. Create
                    projects and tasks here for testing. This does not change the live Cloudflare
                    database.
                  </>
                ) : (
                  <>
                    <strong>{demoMode ? 'Demo workspace' : 'Local sandbox'}</strong> · Fully
                    interactive here — add tasks, milestones, and try styling. Changes stay in this
                    browser tab and never touch the live Cloudflare database. Reload resets practice
                    data.
                  </>
                )}
              </span>
              <button
                className='btn demo-banner-action'
                onClick={() => {
                  if (isLocalAdmin) {
                    startLocalAdminWorkspace();
                  } else {
                    startLocalSandbox();
                  }
                  setView('Overview');
                  setFilter('active');
                  setMilestoneFilter('all');
                  setModal('');
                }}
              >
                Reset
              </button>
              <a
                className='btn demo-banner-action'
                href={isLocalAdmin ? '/api/auth/signout?return_to=%2F' : '/'}
                onClick={() => {
                  if (isLocalAdmin) clearLocalAdminSession();
                }}
              >
                {isLocalAdmin ? 'Sign out' : demoMode ? 'Exit demo' : 'Back to landing'}
              </a>
            </div>
          )}
          {tour !== null && (
            <Tutorial
              step={tour}
              project={project}
              view={view}
              filter={filter}
              onClose={() => {
                setTour(null);
                if (!localOnly && user)
                  api('/api/workspace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'tutorial' }),
                  }).catch((e) => toast.error(e.message));
              }}
              onBack={() => setTour(Math.max(0, tour - 1))}
              onNext={() => {
                if (tour < 5) setTour(tour + 1);
                else {
                  setTour(null);
                  if (!localOnly && user)
                    api('/api/workspace', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'tutorial' }),
                    }).catch((e) => toast.error(e.message));
                  toast.success('You’re ready to go.');
                }
              }}
              onAction={() => {
                if (tour === 0) open('project', { due: future(14) });
                if (tour === 1) {
                  if (requireProject()) open('task', { due: future(1), status: 'todo' });
                }
                if (tour === 2) {
                  setView('My tasks');
                  setFilter('active');
                }
                if (tour === 3) setView('Overview');
                if (tour === 4) setView('Project settings');
              }}
            />
          )}
          <div className='page-heading'>
            <div>
              <h1>
                {view === 'Overview'
                  ? `Let’s make progress${user ? ', ' + user.name.split(' ')[0] : ''}.`
                  : view}
              </h1>
              <p className='subtext'>
                {view === 'Overview'
                  ? 'Your team, your tasks, and the next step forward.'
                  : project.name}
              </p>
            </div>
            {view !== 'Project settings' && view !== 'Availability' && (
              <button
                className='btn primary'
                onClick={() => {
                  if (view === 'Assignment chat') {
                    if (requireProject()) {
                      open('planner');
                      setRequirements(project.description);
                    }
                  } else if (view === 'Milestones' && requireProject())
                    open('milestone', { due: project.due });
                  else if (view === 'Team' && requireProject()) {
                    if (isOwner) open('member');
                    else toast.info('The project creator can add team members.');
                  } else if (requireProject()) open('task', { due: future(1), status: 'todo' });
                }}
              >
                <Plus size={16} />
                {isDemo
                  ? 'Create project'
                  : view === 'Assignment chat'
                    ? 'AI planner'
                    : view === 'Milestones'
                      ? 'Add milestone'
                      : view === 'Team'
                        ? 'Add member'
                        : 'Add task'}
              </button>
            )}
          </div>
          {isDemo && (
            <section className='welcome-panel'>
              <span className='welcome-icon'>
                <Layers size={32} />
              </span>
              <h2>
                {loading
                  ? 'Opening your workspace…'
                  : user
                    ? 'Your next project starts here.'
                    : 'A shared space for your next project.'}
              </h2>
              <p>
                {loading
                  ? ''
                  : user
                    ? 'Create a project, add your teammates, and turn your assignment into a clear plan.'
                    : 'Sign in to create projects and work with your team. Your projects stay private to their members.'}
              </p>
              {!loading &&
                (user ? (
                  <button
                    className='btn primary'
                    onClick={() => open('project', { due: future(14) })}
                  >
                    <Plus size={18} />
                    Create your first project
                  </button>
                ) : (
                  <a className='btn primary' href='/signin?return_to=%2Fworkspace'>
                    Sign in to get started
                  </a>
                ))}
              {!loading && !localOnly && (
                <a className='btn' href='/demo'>
                  Try demo — no sign-in needed
                </a>
              )}
              {!loading && user && (
                <small>
                  Already added to a team? Make sure you signed in with the email they used.
                </small>
              )}
            </section>
          )}
          {error && !modal && (
            <div className='error'>
              {error}{' '}
              <button className='underline ml-2' onClick={load}>
                Reload
              </button>
              {!user && (
                <a className='underline ml-3' href='/signin?return_to=%2Fworkspace'>
                  Sign in
                </a>
              )}
            </div>
          )}
          {canConfigureAI && !aiReady && (
            <div className='notice flex justify-between gap-3 items-center'>
              <span>Connect Gemini to turn on assignment chat and AI planning.</span>
              <button className='btn primary' onClick={() => open('ai-settings')}>
                Connect Gemini
              </button>
            </div>
          )}
          {!isDemo && view === 'Overview' && (
            <>
              <section className='project-banner'>
                <div>
                  <span className='eyebrow'>{project.course || 'GROUP PROJECT'}</span>
                  <h2>{project.name}</h2>
                  <div className='banner-meta'>
                    <span>
                      <CalendarDays />
                      Due {fmt(project.due)}
                    </span>
                    <span>
                      <Users />
                      {project.members.length} members
                    </span>
                    <span>
                      <span className='flex -space-x-2'>
                        {project.members.slice(0, 4).map((m) => (
                          <span className='avatar' key={m.id}>
                            {initials(m.name)}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                </div>
                <div className='progress-summary'>
                  <div>
                    <h3>One step at a time</h3>
                    <p className='subtext'>
                      {done} of {project.tasks.length} tasks complete
                    </p>
                  </div>
                  <div className='ring' style={{ '--value': percent + '%' } as React.CSSProperties}>
                    <span>{percent}%</span>
                  </div>
                </div>
              </section>
              <div className='stats'>
                {[
                  [CheckSquare, project.tasks.length, 'Total tasks', 'all'],
                  [Check, done, 'Completed', 'done'],
                  [
                    Clock,
                    project.tasks.filter((t) => t.status === 'progress').length,
                    'In progress',
                    'progress',
                  ],
                  [
                    Flag,
                    project.milestones.filter((m) => !m.done).length,
                    'Upcoming milestones',
                    'upcoming',
                  ],
                ].map(([Icon, n, label, target]: any) => (
                  <button
                    type='button'
                    className='stat stat-link'
                    key={label}
                    aria-label={`View ${label.toLowerCase()} (${n})`}
                    onClick={() => {
                      if (target === 'upcoming') {
                        setMilestoneFilter('upcoming');
                        setView('Milestones');
                      } else {
                        setFilter(target);
                        setView('My tasks');
                      }
                    }}
                  >
                    <div className='stat-icon'>
                      <Icon size={20} />
                    </div>
                    <div>
                      <strong>{n}</strong>
                      <p>{label}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className='workspace-grid'>
                <div className='stack'>
                  <section className='panel'>
                    <div className='panel-heading'>
                      <h2>
                        Active tasks{' '}
                        <span className='pill'>
                          {project.tasks.filter((t) => t.status !== 'done').length}
                        </span>
                      </h2>
                      <button className='btn subtle' onClick={() => setView('My tasks')}>
                        My tasks <ArrowUpRight />
                      </button>
                    </div>
                    {taskRows(project.tasks.filter((t) => t.status !== 'done').slice(0, 6))}
                  </section>
                  <section className='panel'>
                    <div className='panel-heading'>
                      <h2>Team progress</h2>
                      <button className='btn subtle' onClick={() => setView('Team')}>
                        View team <ArrowUpRight />
                      </button>
                    </div>
                    {project.members.map((m) => {
                      const assigned = project.tasks.filter((t) => t.assignee === m.id);
                      const complete = assigned.filter((t) => t.status === 'done').length;
                      return (
                        <div className='member-row' key={m.id}>
                          <span className='avatar'>{initials(m.name)}</span>
                          <div className='member-name'>
                            {m.name}
                            <small className='block'>{assigned.length} assigned tasks</small>
                          </div>
                          <Progress
                            value={(complete / Math.max(1, assigned.length)) * 100}
                            className='max-w-[150px] h-1.5'
                          />
                          <small>
                            {complete}/{assigned.length}
                          </small>
                        </div>
                      );
                    })}
                  </section>
                </div>
                <div className='stack side'>
                  <section className='panel'>
                    <div className='panel-heading'>
                      <h2>Milestones</h2>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type='button'
                            className='milestone-menu-trigger'
                            aria-label='Milestone options'
                          >
                            <MoreHorizontal size={20} color='#9ca4b3' />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='milestone-dropdown'>
                          <DropdownMenuItem
                            onSelect={() => {
                              setView('Milestones');
                              setMilestoneFilter('all');
                            }}
                          >
                            View all milestones
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              if (requireProject()) open('milestone', { due: project.due });
                            }}
                          >
                            Add milestone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {milestoneList.length ? (
                      milestoneList
                    ) : (
                      <div className='empty'>Add your first milestone.</div>
                    )}
                  </section>
                  <section className='planner-card'>
                    <Sparkles size={25} />
                    <h2>A head start, with AI</h2>
                    <p>
                      Turn your assignment brief into manageable tasks and a plan for your team.
                    </p>
                    <button
                      className='btn'
                      onClick={() => {
                        if (requireProject()) {
                          open('planner');
                          setRequirements(project.description);
                        }
                      }}
                    >
                      Plan my project <ArrowUpRight />
                    </button>
                    <button className='btn !mt-2' onClick={() => setView('Assignment chat')}>
                      Ask AI a question <Sparkles size={15} />
                    </button>
                  </section>
                </div>
              </div>
            </>
          )}
          {!isDemo && view === 'Assignment chat' && localOnly && (
            <div className='notice'>
              AI chat and planning need the live workspace. In this local sandbox you can still edit
              tasks, milestones, availability, and styling.
            </div>
          )}
          {!isDemo && view === 'Assignment chat' && !localOnly && (
            <AssignmentChat
              key={project.id}
              project={project}
              aiReady={aiReady}
              onCreate={() => open('project', { due: future(14) })}
              onBrief={() => {
                if (requireProject()) open('brief', { description: project.description });
              }}
              onPlan={() => {
                if (requireProject()) {
                  open('planner');
                  setRequirements(project.description);
                }
              }}
            />
          )}
          {!isDemo && view === 'My tasks' && (
            <>
              <div className='toolbar'>
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    <TabsTrigger value='active'>Active tasks</TabsTrigger>
                    <TabsTrigger value='all'>All tasks</TabsTrigger>
                    <TabsTrigger value='progress'>In progress</TabsTrigger>
                    <TabsTrigger value='mine'>Assigned to me</TabsTrigger>
                    <TabsTrigger value='done'>Completed</TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className='subtext'>Click a task to edit its details</span>
              </div>
              <section className='panel'>
                {taskRows(
                  project.tasks.filter((t) =>
                    filter === 'all'
                      ? true
                      : filter === 'done'
                        ? t.status === 'done'
                        : filter === 'progress'
                          ? t.status === 'progress'
                          : t.status !== 'done' && (filter !== 'mine' || t.assignee === me),
                  ),
                )}
              </section>
            </>
          )}
          {!isDemo && view === 'Milestones' && (
            <>
              <div className='toolbar'>
                <Tabs value={milestoneFilter} onValueChange={setMilestoneFilter}>
                  <TabsList>
                    <TabsTrigger value='all'>All milestones</TabsTrigger>
                    <TabsTrigger value='upcoming'>Upcoming</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <section className='panel'>
                <div className='panel-heading'>
                  <h2>The path to {fmt(project.due)}</h2>
                  <span className='subtext'>
                    {project.milestones.filter((m) => m.done).length} of {project.milestones.length}{' '}
                    complete
                  </span>
                </div>
                {milestoneList.length ? (
                  milestoneList
                ) : (
                  <div className='empty'>
                    No milestones in this view. Add a milestone to plan your next steps.
                  </div>
                )}
              </section>
            </>
          )}
          {!isDemo && view === 'Availability' && (
            <>
              <div className='notice'>
                Select the times you’re available over the next 7 days. Times use your device’s
                local timezone. Outlined slots work for everyone who has added availability.
              </div>
              <section className='panel'>
                <div className='panel-heading'>
                  <h2>Find time together</h2>
                  <span className='subtext'>
                    {Object.values(project.availability).filter((a) => a.length).length} /{' '}
                    {project.members.length} schedules added
                  </span>
                </div>
                <div className='schedule'>
                  <span />
                  {Array.from({ length: 7 }, (_, i) => (
                    <div className='day' key={`date-${i}`}>
                      {fmt(future(i))}
                    </div>
                  ))}
                  {Array.from({ length: 16 }, (_, i) => i + 7).map((hour) => (
                    <div className='contents' key={hour}>
                      <span className='time'>
                        {hour > 12 ? hour - 12 : hour}
                        {hour >= 12 ? ' pm' : ' am'}
                      </span>
                      {Array.from({ length: 7 }, (_, i) => {
                        const key = new Date(
                          future(i) + 'T' + String(hour).padStart(2, '0') + ':00',
                        ).toISOString();
                        const past = new Date(key) < new Date();
                        const selected = (project.availability[me] || []).includes(key);
                        const schedules = Object.values(project.availability).filter(
                          (a) => a.length,
                        );
                        const common =
                          schedules.length > 1 && schedules.every((a) => a.includes(key));
                        return (
                          <button
                            key={key}
                            aria-label={`${fmt(future(i))} at ${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}${past ? ', time has passed' : ''}`}
                            aria-pressed={selected}
                            disabled={busy || past}
                            className={
                              'slot ' +
                              (selected ? 'selected ' : '') +
                              (common ? 'common ' : '') +
                              (past ? 'past' : '')
                            }
                            onClick={() => {
                              if (requireProject())
                                save({
                                  ...project,
                                  availability: {
                                    ...project.availability,
                                    [me]: selected
                                      ? (project.availability[me] || []).filter((x) => x !== key)
                                      : [...(project.availability[me] || []), key],
                                  },
                                });
                            }}
                          >
                            {past ? (
                              <LockKeyhole size={14} className='availability-lock mx-auto' aria-hidden='true' />
                            ) : selected ? (
                              <Check size={14} className='mx-auto' />
                            ) : (
                              ''
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <span />
                  {Array.from({ length: 7 }, (_, i) => (
                    <div className='day-of-week' key={`weekday-${i}`}>
                      {new Date(future(i) + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                      })}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {!isDemo && view === 'Files' && (
            <section className='panel'>
              <div className='panel-heading'>
                <div>
                  <h2>Project files</h2>
                  <p className='subtext'>Assignment briefs, research, and shared work.</p>
                </div>
                <label className='btn cursor-pointer'>
                  <Plus size={16} /> Upload file
                  <input
                    type='file'
                    className='sr-only'
                    disabled={busy || localOnly}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !requireProject()) return;
                      setBusy(true);
                      try {
                        const form = new FormData();
                        form.set('project', project.id);
                        form.set('file', file);
                        await api('/api/files', { method: 'POST', body: form });
                        const data = await api('/api/files?project=' + project.id);
                        setFiles(data.files);
                        toast.success('File uploaded.');
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
              {files.length && !isDemo ? (
                files.map((f) => (
                  <div className='file-row' key={f.id}>
                    <FileText size={26} />
                    <div className='flex-1'>
                      <h3>{f.name}</h3>
                      <p className='subtext'>{Math.ceil(f.size / 1024)} KB</p>
                    </div>
                    <a className='btn' href={'/api/files?project=' + project.id + '&id=' + f.id}>
                      <Download size={16} /> Download
                    </a>
                  </div>
                ))
              ) : (
                <div className='empty'>
                  <FolderOpen className='mx-auto mb-3' />
                  Your shared files will appear here.
                  <br />
                  {localOnly
                    ? 'File uploads are disabled in the local sandbox.'
                    : 'Upload files up to 10 MB each.'}
                </div>
              )}
            </section>
          )}
          {!isDemo && view === 'Team' && (
            <>
              <div className='notice flex flex-wrap items-center justify-between gap-3'>
                <span>Manage your teammates here. Share this project from Project settings.</span>
                <button className='btn demo-banner-action' onClick={() => setView('Project settings')}>
                  <Settings size={16} />
                  Project settings
                </button>
              </div>
              <section className='panel team-list-panel'>
                <div className='panel-heading'>
                  <h2>Your project team</h2>
                </div>
                {project.members.map((m) => (
                  <div className='member-row' key={m.id}>
                    <span className='avatar'>{initials(m.name)}</span>
                    <div className='member-name'>
                      {m.name}
                      <small className='block'>{m.email}</small>
                    </div>
                    <small>{project.tasks.filter((t) => t.assignee === m.id).length} tasks</small>
                    {isOwner && m.id !== user?.id && (
                      <button className='btn subtle' onClick={() => open('remove', m)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
          {!isDemo && view === 'Project settings' && (
            <div className='stack project-settings'>
              <section className='panel'>
                <div className='panel-heading'>
                  <div>
                    <h2>Share project</h2>
                    <p className='subtext'>
                      Invite teammates to {project.name}. Only project members can access your work.
                    </p>
                  </div>
                </div>
                {localOnly ? (
                  <div className='notice'>
                    Invitation links need the live workspace. This local sandbox does not create
                    real invitations.
                  </div>
                ) : isOwner ? (
                  <InviteLink key={project.id} project={project.id} />
                ) : (
                  <div className='notice'>
                    Ask the project owner to create an invitation link for new teammates.
                  </div>
                )}
                <button className='btn subtle' onClick={() => setView('Team')}>
                  Manage team <ArrowRight size={16} />
                </button>
              </section>
              <section className='panel'>
                <div className='panel-heading'>
                  <div>
                    <h2>Delete project</h2>
                    <p className='subtext'>
                      Permanently remove this project and its tasks, files, and conversations for
                      everyone.
                    </p>
                  </div>
                </div>
                {isOwner ? (
                  <button
                    className='btn danger delete-project-button'
                    onClick={() => open('delete-project', { confirmation: '' })}
                  >
                    Delete project
                  </button>
                ) : (
                  <p className='subtext'>Only the project owner can delete this project.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v && !busy) setModal('');
        }}
      >
        <DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-[520px]'>
          <DialogHeader>
            <DialogTitle>
              {
                {
                  'delete-project': 'Delete project',
                  'ai-settings': 'Connect Gemini',
                  brief: 'Assignment brief',
                  project: 'Create a project',
                  task: draft.id ? 'Edit task' : 'Add a task',
                  milestone: 'Add a milestone',
                  member: 'Add a team member',
                  planner: 'Plan your project',
                  reminders: 'Reminder preferences',
                  profile: 'Your account',
                  remove: 'Remove team member',
                }[modal]
              }
            </DialogTitle>
            <DialogDescription>
              {modal === 'planner'
                ? 'Review the suggested plan before adding it to your project.'
                : modal === 'project'
                  ? 'Give your group a place to make progress.'
                  : 'Keep your team on the same page.'}
            </DialogDescription>
          </DialogHeader>
          {error && <div className='error'>{error}</div>}
          {modal === 'ai-settings' && (
            <ConnectAI
              onConnected={() => {
                setAiReady(true);
                setModal('');
                toast.success('Gemini is connected. Ask a question or plan your project.');
              }}
            />
          )}
          {['project', 'task', 'milestone', 'member', 'reminders', 'profile', 'brief'].includes(
            modal,
          ) && (
            <form className='form' onSubmit={submit}>
              {['project', 'member', 'profile'].includes(modal) && (
                <label>
                  {modal === 'project' ? 'Project name' : 'Name'}
                  <input
                    required
                    maxLength={100}
                    value={draft.name || ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder={
                      modal === 'project' ? 'e.g. Marketing research project' : 'Your name'
                    }
                  />
                </label>
              )}
              {modal === 'profile' && (
                <>
                  <label>
                    Phone (optional)
                    <input
                      value={draft.phone || ''}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    />
                  </label>
                  <label>
                    Address (optional)
                    <input
                      value={draft.address || ''}
                      onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    />
                  </label>
                  <label>
                    Time zone
                    <input
                      value={draft.timeZone || 'UTC'}
                      onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}
                    />
                  </label>
                  <label>
                    Language preference
                    <input
                      value={draft.language || 'en'}
                      onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    />
                  </label>
                  <p className='form-note'>
                    Language preference is saved; the interface is currently available in English.
                  </p>
                  <label className='flex gap-2 items-center'>
                    <input
                      type='checkbox'
                      checked={draft.notifications !== false}
                      onChange={(e) => setDraft({ ...draft, notifications: e.target.checked })}
                    />
                    Save notification preference
                  </label>
                  <p className='form-note'>Email notifications are not connected yet.</p>
                </>
              )}
              {modal === 'project' && (
                <>
                  <label>
                    Course (optional)
                    <input
                      value={draft.course || ''}
                      maxLength={100}
                      onChange={(e) => setDraft({ ...draft, course: e.target.value })}
                      placeholder='e.g. DES 240'
                    />
                  </label>
                  <label>
                    Project description
                    <textarea
                      value={draft.description || ''}
                      maxLength={5000}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      placeholder='What is your group working toward?'
                    />
                  </label>
                </>
              )}
              {['task', 'milestone'].includes(modal) && (
                <label>
                  Description (optional)
                  <textarea
                    maxLength={5000}
                    value={draft.description || ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
              )}
              {['task', 'milestone'].includes(modal) && (
                <label>
                  {modal === 'task' ? 'Task' : 'Milestone'} name
                  <input
                    required
                    maxLength={200}
                    value={draft.title || ''}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={
                      modal === 'task' ? 'e.g. Interview five students' : 'e.g. Research complete'
                    }
                  />
                </label>
              )}
              {['project', 'task', 'milestone'].includes(modal) && (
                <label>
                  Due date
                  <input
                    type='date'
                    required
                    min={draft.id ? undefined : today}
                    value={draft.due || ''}
                    onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                  />
                </label>
              )}
              {modal === 'task' && (
                <>
                  <label>
                    Assigned to
                    <Picker
                      value={draft.assignee || 'none'}
                      onChange={(v) => setDraft({ ...draft, assignee: v })}
                      options={[
                        { value: 'none', label: 'Unassigned' },
                        ...project.members.map((m) => ({ value: m.id, label: m.name })),
                      ]}
                    />
                  </label>
                  <label>
                    Status
                    <Picker
                      value={draft.status || 'todo'}
                      onChange={(v) => setDraft({ ...draft, status: v })}
                      options={[
                        { value: 'todo', label: 'To do' },
                        { value: 'progress', label: 'In progress' },
                        { value: 'done', label: 'Completed' },
                      ]}
                    />
                  </label>
                  <label>
                    Milestone
                    <Picker
                      value={draft.milestone || 'none'}
                      onChange={(v) => setDraft({ ...draft, milestone: v === 'none' ? '' : v })}
                      options={[
                        { value: 'none', label: 'No milestone' },
                        ...project.milestones.map((m) => ({ value: m.id, label: m.title })),
                      ]}
                    />
                  </label>
                </>
              )}
              {modal === 'brief' && (
                <label>
                  Assignment requirements
                  <textarea
                    required
                    maxLength={30000}
                    value={draft.description || ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder='Paste the assignment brief, rubric, and deliverables…'
                  />
                </label>
              )}
              {modal === 'member' && (
                <>
                  <label>
                    Email
                    <input
                      type='email'
                      required
                      value={draft.email || ''}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                  </label>
                  <p className='form-note'>
                    Use the email they sign in with, then share the site link. Adding a member does
                    not send an email.
                  </p>
                </>
              )}
              {modal === 'reminders' && (
                <>
                  <div className='notice'>
                    Email delivery isn’t connected yet. Save your preference now; deadlines remain
                    visible in your workspace.
                  </div>
                  <label>
                    Remind me before a deadline
                    <Picker
                      value={String(draft.hours || 24)}
                      onChange={(v) => setDraft({ ...draft, hours: v })}
                      options={[
                        { value: '1', label: '1 hour before' },
                        { value: '12', label: '12 hours before' },
                        { value: '24', label: '1 day before' },
                        { value: '48', label: '2 days before' },
                        { value: '168', label: '1 week before' },
                      ]}
                    />
                  </label>
                </>
              )}
              {!user && (
                <a className='btn primary' href='/signin?return_to=%2Fworkspace'>
                  Sign in
                </a>
              )}
              <button disabled={busy || !user} className='btn primary' type='submit'>
                {busy ? 'Saving…' : modal === 'project' ? 'Create project' : 'Save changes'}
              </button>
              {modal === 'profile' && canConfigureAI && (
                <button type='button' className='btn' onClick={() => open('ai-settings')}>
                  {aiReady ? 'Update Gemini connection' : 'Connect Gemini'}
                </button>
              )}
              {modal === 'profile' && user && !localOnly && (
                <a className='btn' href='/api/auth/signout?return_to=%2F'>
                  <LogOut size={16} />
                  Sign out
                </a>
              )}
            </form>
          )}
          {modal === 'delete-project' && (
            <div className='form'>
              <p>
                Delete <strong>{project.name}</strong> for everyone? Tasks, milestones,
                availability, files, invitations, and project chats will be removed. This cannot be
                undone.
              </p>
              <label>
                Type “{project.name}” to confirm
                <input
                  autoComplete='off'
                  value={draft.confirmation || ''}
                  onChange={(e) => setDraft({ ...draft, confirmation: e.target.value })}
                />
              </label>
              <button
                className='btn danger'
                disabled={busy || draft.confirmation !== project.name}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (!localOnly)
                      await api('/api/workspace', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: project.id,
                          name: project.name,
                          version: project.version,
                        }),
                      });
                    const remaining = projects.filter((p) => p.id !== project.id);
                    setProjects(remaining);
                    setProject(remaining[0] || emptyProject);
                    setFiles([]);
                    setView('Overview');
                    setModal('');
                    toast.success('Project deleted.');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Deleting…' : 'Permanently delete project'}
              </button>
              <button className='btn' disabled={busy} onClick={() => setModal('')}>
                Cancel
              </button>
            </div>
          )}
          {modal === 'remove' && (
            <div className='form'>
              <p>
                Remove {draft.name} from this project? Their tasks will move back to the unassigned
                pool so the team can redelegate them.
              </p>
              <button
                className='btn primary'
                disabled={busy}
                onClick={async () => {
                  const ok = await save({
                    ...project,
                    members: project.members.filter((m) => m.id !== draft.id),
                    tasks: project.tasks.map((t) =>
                      t.assignee === draft.id ? { ...t, assignee: '' } : t,
                    ),
                  });
                  if (ok) setModal('');
                }}
              >
                Remove and unassign tasks
              </button>
            </div>
          )}
          {modal === 'planner' && (
            <div className='form'>
              {!aiReady && (
                <div className='notice'>
                  AI planning needs a service connection before it can generate a plan. You can add
                  tasks manually in the meantime.
                </div>
              )}
              <label>
                Assignment requirements
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder='Paste your assignment brief, deliverables, and grading requirements…'
                  maxLength={30000}
                />
              </label>
              <label>
                Or import a text file
                <input
                  type='file'
                  accept='.txt,.md,text/plain,text/markdown'
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 100000) {
                        toast.error('Use a text file under 100 KB.');
                        return;
                      }
                      setRequirements((await f.text()).slice(0, 30000));
                    }
                  }}
                />
              </label>
              <button
                className='btn primary'
                disabled={!aiReady || busy || requirements.trim().length < 30}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPlan(
                      await api('/api/plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: project.id, requirements }),
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles size={16} />
                {busy ? 'Planning…' : 'Generate suggested plan'}
              </button>
              {plan && (
                <>
                  <h3>{plan.tasks.length} suggested tasks</h3>
                  {plan.tasks.map((t: Task) => (
                    <div key={t.id} className='form-note'>
                      <strong>{t.title}</strong>
                      <br />
                      {fmt(t.due)} ·{' '}
                      {project.members.find((m) => m.id === t.assignee)?.name || 'Unassigned'}
                    </div>
                  ))}
                  <button
                    className='btn primary'
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await save({
                          ...project,
                          description: requirements,
                          tasks: [...project.tasks, ...plan.tasks],
                          milestones: [...project.milestones, ...plan.milestones],
                        })
                      ) {
                        setModal('');
                        toast.success('Plan added. You can edit any task.');
                      }
                    }}
                  >
                    Add plan to project
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Toaster position='bottom-right' />
    </SidebarProvider>
  );
}
