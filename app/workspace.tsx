'use client';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AssignmentChat from './assignment-chat';
import ConnectAI from './connect-ai';
import InviteLink from './invite-link';
import Tutorial from './tutorial';
import PlanReview, { type SuggestedPlan } from './plan-review';
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
  Send,
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
import { workspacePathByView, workspaceViewByPath } from '@/lib/workspace-routes';
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
function subscribeLocalAdminSession(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function getLocalAdminSessionSnapshot() {
  try {
    return hasLocalAdminSession();
  } catch {
    return false;
  }
}
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

const TUTORIAL_SEEN_KEY = 'teamup.tutorialSeen';
const WORKSPACE_VIEW_KEY = 'teamup.workspace.view';
const DEMO_SESSION_KEY = 'teamup.demo.sessionActive';

function hasLocalTutorialSeen() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberLocalTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export default function Workspace({
  demoMode = false,
  initialLocalAdmin = false,
}: {
  demoMode?: boolean;
  initialLocalAdmin?: boolean;
}) {
  const localAdminSession = useSyncExternalStore(
    subscribeLocalAdminSession,
    getLocalAdminSessionSnapshot,
    () => false,
  );
  const router = useRouter();
  const pathname = usePathname();
  const routeBase = demoMode ? '/demo' : '/workspace';
  const routeSegment = pathname?.slice(routeBase.length).replace(/^\/+/, '') || 'overview';
  const view = workspaceViewByPath[routeSegment as keyof typeof workspaceViewByPath] || 'Overview';
  const [tour, setTour] = useState<number | null>(null);
  const [tutorialPrompt, setTutorialPrompt] = useState(false);
  const tutorialPromptStarting = useRef(false);
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
  const [startupNoticeReady, setStartupNoticeReady] = useState(false);
  const [showStartupNotice, setShowStartupNotice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState('');
  const [filter, setFilter] = useState('active');
  const [milestoneFilter, setMilestoneFilter] = useState('all');
  const [availabilityView, setAvailabilityView] = useState<'calendar' | 'overlap'>('calendar');
  const [draft, setDraft] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [pushSettings, setPushSettings] = useState({ enabled: false, publicKey: '', subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [plan, setPlan] = useState<SuggestedPlan | null>(null);
  const [requirements, setRequirements] = useState('');
  const [planFileIds, setPlanFileIds] = useState<string[]>([]);
  /** Local sandbox keeps rubric File objects (no R2 upload). */
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [includeMilestones, setIncludeMilestones] = useState(true);
  /** Project id created for this plan review — Cancel deletes it. */
  const [planFromCreateId, setPlanFromCreateId] = useState<string | null>(null);
  // Localhost + /demo: fully interactive in memory (no Cloudflare DB).
  const [localOnly, setLocalOnly] = useState(demoMode);

  const PLAN_FILE_ACCEPT =
    '.pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.heic,.gif,application/pdf,image/*,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isDemo = !project.id;
  const startupNoticeKey = demoMode
    ? 'teamup.demo.workspaceOpened'
    : 'teamup.workspace.opened';
  const startupNoticeChecked = useRef(false);

  useEffect(() => {
    if (startupNoticeChecked.current) return;
    startupNoticeChecked.current = true;
    const navigation = window.performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming | undefined;
    const isReload = navigation?.type === 'reload';
    let isFirstOpen = !isReload;
    try {
      isFirstOpen = window.sessionStorage.getItem(startupNoticeKey) !== '1' && !isReload;
      window.sessionStorage.setItem(startupNoticeKey, '1');
    } catch {
      // Use the browser navigation type when storage is unavailable.
    }
    setShowStartupNotice(isFirstOpen);
    setStartupNoticeReady(true);
  }, [startupNoticeKey]);

  const today = future(0);
  const done = project.tasks.filter((t) => t.status === 'done').length;
  const percent = Math.round((done / Math.max(1, project.tasks.length)) * 100);
  const me = user?.id || '';
  const mine = project.tasks.filter((t) => t.assignee === me && t.status !== 'done');
  const isOwner = !isDemo && project.owner === user?.id;

  function offerTutorialIfNeeded(seen?: boolean) {
    if (seen || hasLocalTutorialSeen()) return;
    setTutorialPrompt(true);
  }

  async function markTutorialSeen() {
    rememberLocalTutorialSeen();
    setUser((current) => (current ? { ...current, tutorialSeen: true } : current));
    if (!localOnly && !demoMode && user) {
      try {
        await api('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tutorial' }),
        });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  function startTutorial() {
    tutorialPromptStarting.current = true;
    setTutorialPrompt(false);
    setModal('');
    setTour(0);
    toast.message('Tutorial started', {
      description: 'Follow the steps in the panel at the bottom of the screen.',
      position: 'top-center',
      duration: 4500,
    });
  }

  function declineTutorial() {
    tutorialPromptStarting.current = false;
    setTutorialPrompt(false);
    void markTutorialSeen();
  }

  function startLocalSandbox() {
    clearLocalAdminSession();
    const p = practiceProject();
    setLocalOnly(true);
    setProject(p);
    setProjects([p]);
    setUser(demoUser);
    setLoading(false);
    setError('');
    setTour(null);
    offerTutorialIfNeeded(false);
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
    offerTutorialIfNeeded(false);
  }

  const isLocalAdmin =
    initialLocalAdmin ||
    localAdminSession ||
    user?.username === 'admin' ||
    user?.email === 'admin@teamup.local' ||
    user?.name === 'admin';

  async function api(url: string, options?: RequestInit) {
    // Only block API calls in the in-memory demo/sandbox — not for signed-in localhost admin.
    if (localOnly || demoMode)
      throw new Error('This feature needs a real account. Exit the demo and sign in.');
    const r = await fetch(url, options);
    const data: any = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  async function changePushSubscription() {
    setPushBusy(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
        throw new Error('This browser does not support push notifications.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      if (existing && pushSettings.subscribed) {
        await api('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushSettings((current) => ({ ...current, subscribed: false }));
        toast.success('Push notifications turned off on this device.');
        return;
      }
      if (!pushSettings.enabled || !pushSettings.publicKey)
        throw new Error('Push delivery is not configured for this deployment yet.');
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== 'granted') throw new Error('Allow notifications in your browser to enable nudges.');
      const normalizedKey = pushSettings.publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const paddedKey = normalizedKey.padEnd(Math.ceil(normalizedKey.length / 4) * 4, '=');
      const applicationServerKey = Uint8Array.from(atob(paddedKey), (character) => character.charCodeAt(0));
      const subscription = existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      await api('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: subscription.toJSON() }),
      });
      setPushSettings((current) => ({ ...current, subscribed: true }));
      toast.success('Push notifications enabled on this device.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not update push notifications.');
    } finally {
      setPushBusy(false);
    }
  }
  async function nudgeTeammate(recipientId: string) {
    try {
      await api('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'nudge', projectId: project.id, recipientId }),
      });
      toast.success('Nudge sent.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not send the nudge.');
    }
  }
  async function load() {
    setLoading(true);
    try {
      const data = await api('/api/workspace');
      setUser(data.user);
      setProjects(data.projects);
      setAiReady(data.aiReady);
      setCanConfigureAI(data.canConfigureAI);
      offerTutorialIfNeeded(!!data.user.tutorialSeen);
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
        const adminSession = getLocalAdminSessionSnapshot();
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
            offerTutorialIfNeeded(!!data.user.tutorialSeen);
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
    if (!localOnly && !demoMode) return;
    let alive = true;
    fetch('/api/plan/demo')
      .then(async (r) => {
        const data: any = await r.json();
        if (alive && r.ok) setAiReady(!!data.aiReady);
      })
      .catch(() => {
        if (alive) setAiReady(false);
      });
    return () => {
      alive = false;
    };
  }, [localOnly, demoMode]);
  useEffect(() => {
    if (view === 'Files' && !isDemo && !localOnly)
      api('/api/files?project=' + project.id)
        .then((d) => setFiles(d.files))
        .catch((e) => toast.error(e.message));
  }, [view, project.id, localOnly]);
  useEffect(() => {
    if (!user?.id || localOnly || demoMode) return;
    let active = true;
    fetch('/api/push')
      .then(async (response) => {
        const data: any = await response.json();
        if (active && response.ok)
          setPushSettings({
            enabled: !!data.enabled,
            publicKey: data.publicKey || '',
            subscribed: !!data.subscribed,
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, localOnly, demoMode]);
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
  function setView(nextView: string) {
    const path = workspacePathByView[nextView as keyof typeof workspacePathByView];
    if (path) router.push(`${routeBase}/${path}`);
  }

  function open(type: string, data: any = {}) {
    setModal(type);
    setError('');
    setPlan(null);
    setPlanFromCreateId(null);
    if (type === 'planner') {
      setPlanFileIds([]);
      setPlanFiles([]);
      setIncludeMilestones(true);
      setDraft(data);
    } else if (type === 'project') {
      setDraft({
        includeMilestones: true,
        rubricFiles: [] as File[],
        rubricPaste: '',
        ...data,
      });
    } else {
      setDraft(data);
    }
  }

  async function removeProjectById(id: string, name: string, version: number) {
    if (!localOnly) {
      await api('/api/workspace', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, version }),
      });
    }
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    setProject(remaining[0] || emptyProject);
    setFiles([]);
  }

  async function cancelPlanReview() {
    const createdId = planFromCreateId;
    const created = createdId ? projects.find((p) => p.id === createdId) || project : null;
    setBusy(true);
    try {
      if (createdId && created && created.id === createdId) {
        await removeProjectById(created.id, created.name, created.version);
        toast.message('Project cancelled. Nothing was kept.');
      } else {
        toast.message('Suggestion discarded.');
      }
      setPlan(null);
      setPlanFromCreateId(null);
      setPlanFileIds([]);
      setPlanFiles([]);
      setRequirements('');
      setModal('');
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fileToBase64(file: File) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function uploadPlanFiles(projectId: string, files: File[]) {
    const ids: string[] = [];
    for (const file of files.slice(0, 3)) {
      if (file.size > 5_000_000) throw new Error(`${file.name} must be under 5 MB for AI planning.`);
      const form = new FormData();
      form.set('project', projectId);
      form.set('file', file);
      form.set('purpose', 'rubric');
      const data = await api('/api/files', { method: 'POST', body: form });
      if (!data.id) throw new Error('File upload did not return an id.');
      ids.push(data.id);
    }
    return ids;
  }

  async function requestDemoPlan(
    snapshot: Project,
    text: string,
    files: File[],
    milestones: boolean,
  ) {
    const inline = [];
    for (const file of files.slice(0, 3)) {
      if (file.size > 5_000_000) throw new Error(`${file.name} must be under 5 MB for AI planning.`);
      inline.push({
        name: file.name,
        type: file.type,
        dataBase64: await fileToBase64(file),
      });
    }
    const r = await fetch('/api/plan/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: snapshot,
        requirements: text,
        files: inline,
        includeMilestones: milestones,
      }),
    });
    const data: any = await r.json();
    if (!r.ok) throw new Error(data.error || 'Unable to generate a plan.');
    return data as SuggestedPlan;
  }

  async function requestPlan(
    projectId: string,
    text: string,
    fileIds: string[],
    milestones: boolean,
    snapshot?: Project,
    files?: File[],
  ) {
    if (localOnly) {
      return requestDemoPlan(snapshot || project, text, files || planFiles, milestones);
    }
    return (await api('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: projectId,
        requirements: text,
        fileIds,
        includeMilestones: milestones,
      }),
    })) as SuggestedPlan;
  }

  async function acceptSuggestedPlan() {
    if (!plan || !requireProject()) return;
    const tasks = plan.tasks.filter((t) => t.title.trim());
    const milestones = plan.milestones.filter((m) => m.title.trim());
    if (!tasks.length && !milestones.length) {
      toast.error('Add at least one task or milestone, or discard this suggestion.');
      return;
    }
    const milestoneIds = new Set(milestones.map((m) => m.id));
    const nextDescription =
      requirements.trim().length >= 30 ? requirements.trim() : project.description;
    if (
      await save({
        ...project,
        description: nextDescription,
        tasks: [
          ...project.tasks,
          ...tasks.map((t) => ({
            ...t,
            title: t.title.trim(),
            milestone: t.milestone && milestoneIds.has(t.milestone) ? t.milestone : '',
          })),
        ],
        milestones: [...project.milestones, ...milestones.map((m) => ({ ...m, title: m.title.trim() }))],
      })
    ) {
      setModal('');
      setPlan(null);
      setPlanFromCreateId(null);
      setPlanFileIds([]);
      setPlanFiles([]);
      setRequirements('');
      toast.success(
        milestones.length && tasks.length
          ? 'Plan added. You can keep editing anytime.'
          : milestones.length
            ? 'Milestones added.'
            : 'Tasks added.',
      );
    }
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
      const newId = uid();
      const rubricFiles: File[] = Array.isArray(draft.rubricFiles) ? draft.rubricFiles : [];
      const rubricPaste =
        typeof draft.rubricPaste === 'string' ? draft.rubricPaste.trim() : '';
      const wantsPlan =
        aiReady && (rubricFiles.length > 0 || rubricPaste.length >= 30);
      const created: Project = {
        id: newId,
        name: draft.name,
        course: draft.course,
        description: draft.description || rubricPaste.slice(0, 5000),
        due: draft.due,
        members: [{ id: user.id, name: user.name, email: user.email }],
        tasks: [],
        milestones: [],
        availability: {},
        reminderHours: 24,
        version: 0,
        owner: user.id,
      };
      ok = await save(created, true);
      if (ok && wantsPlan) {
        try {
          setBusy(true);
          const text = rubricPaste || String(draft.description || '');
          let ids: string[] = [];
          if (!localOnly) ids = await uploadPlanFiles(newId, rubricFiles);
          else setPlanFiles(rubricFiles.slice(0, 3));
          const suggested = await requestPlan(
            newId,
            text,
            ids,
            draft.includeMilestones !== false,
            created,
            rubricFiles,
          );
          setPlanFileIds(ids);
          setIncludeMilestones(draft.includeMilestones !== false);
          setRequirements(text);
          setPlan(suggested);
          setPlanFromCreateId(newId);
          setModal('planner');
          toast.message('Review the suggested plan — Cancel removes this project.');
          return;
        } catch (err) {
          toast.error(
            (err as Error).message ||
              'Project created, but AI planning failed. You can open the AI planner anytime.',
          );
          setModal('');
          return;
        } finally {
          setBusy(false);
        }
      }
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
    .map((m, index) => (
      <div className={'milestone ' + (index === 0 ? 'milestone-first' : '')} key={m.id}>
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
            <span className='muted text-[13px] hidden sm:block' suppressHydrationWarning>
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
                    interactive here — tasks, milestones, Assignment chat, and AI planning
                    {aiReady
                      ? ' (Gemini connected via .dev.vars)'
                      : ' (set GEMINI_API_KEY in .dev.vars to enable AI)'}
                    . Changes stay in this browser tab. Reload resets practice data.
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
                  try {
                    window.sessionStorage.removeItem(startupNoticeKey);
                    window.sessionStorage.removeItem(WORKSPACE_VIEW_KEY);
                    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
                  } catch {
                    // Ignore unavailable browser storage.
                  }
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
                void markTutorialSeen();
              }}
              onBack={() => setTour(Math.max(0, tour - 1))}
              onNext={() => {
                if (tour < 5) setTour(tour + 1);
                else {
                  setTour(null);
                  void markTutorialSeen();
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
                if (tour === 3) {
                  setView('Overview');
                  setFilter('active');
                }
                if (tour === 4) setView('Project settings');
              }}
            />
          )}
          <div className='page-heading' data-tutorial-step='0'>
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
                data-tutorial-step='1'
                onClick={() => {
                  if (view === 'Assignment chat') {
                    if (requireProject()) {
                      open('planner');
                      setRequirements('');
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
                {view === 'Assignment chat'
                  ? 'AI planner'
                  : view === 'Milestones'
                    ? 'Add milestone'
                    : view === 'Team'
                      ? 'Add member'
                      : view === 'Overview' && isDemo && !loading
                        ? 'Create project'
                        : 'Add task'}
              </button>
            )}
          </div>
          {isDemo && startupNoticeReady && (!loading || showStartupNotice) && (
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
                  <a className='btn primary' href='/signin?return_to=%2Fworkspace%2Foverview'>
                    Sign in to get started
                  </a>
                ))}
              {!loading && !localOnly && (
                <Link className='btn' href='/demo/overview'>
                  Try demo — no sign-in needed
                </Link>
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
                <a className='underline ml-3' href='/signin?return_to=%2Fworkspace%2Foverview'>
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
          {localOnly && !aiReady && !canConfigureAI && (
            <div className='notice'>
              AI chat and planning need <code>GEMINI_API_KEY</code> in <code>.dev.vars</code>. Restart
              the local server after adding it.
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
                    data-tutorial-step={target === 'done' ? '3' : undefined}
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
                  <section className='panel overview-team-progress-panel'>
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
                  <section className='panel overview-milestones-panel'>
                    <div className='panel-heading'>
                      <h2>Milestones</h2>
                      <DropdownMenu modal={false}>
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
                          setRequirements('');
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
          {!isDemo && view === 'Assignment chat' && (
            <AssignmentChat
              key={project.id + (localOnly ? ':local' : '')}
              project={project}
              aiReady={aiReady}
              localDemo={localOnly}
              userId={user?.id}
              onCreate={() => open('project', { due: future(14) })}
              onBrief={() => {
                if (requireProject()) open('brief', { description: project.description });
              }}
              onPlan={() => {
                if (requireProject()) {
                  open('planner');
                  setRequirements('');
                  setPlanFiles([]);
                  setPlanFileIds([]);
                }
              }}
              onProjectUpdate={(next) => {
                setProject(next);
                setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));
              }}
            />
          )}
          {!isDemo && view === 'My tasks' && (
            <>
              <div className='toolbar' data-tutorial-step='2'>
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList className='bg-[#dbd9fc] task-filter-tabs'>
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
                  <TabsList className='bg-[#dbd9fc] task-filter-tabs'>
                    <TabsTrigger value='all'>All milestones</TabsTrigger>
                    <TabsTrigger value='upcoming'>Upcoming</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <section className='panel milestones-page-panel'>
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
                <div className='availability-tabs'>
                  <Tabs
                    value={availabilityView}
                    onValueChange={(value) => setAvailabilityView(value as 'calendar' | 'overlap')}
                  >
                    <TabsList>
                      <TabsTrigger value='calendar'>My calendar</TabsTrigger>
                      <TabsTrigger value='overlap'>Team overlap</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {availabilityView === 'overlap' && (
                    <p className='availability-overlap-note'>
                      Hours are highlighted only when every teammate with a saved schedule is free.
                    </p>
                  )}
                </div>
                {availabilityView === 'overlap' &&
                  Object.values(project.availability).filter((slots) => slots.length).length < 2 && (
                    <div className='empty availability-empty'>
                      At least two teammates need to add availability to show overlapping hours.
                    </div>
                  )}
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
                            disabled={busy || past || availabilityView === 'overlap'}
                            className={
                              'slot ' +
                              (selected ? 'selected ' : '') +
                              (common ? 'common ' : '') +
                              (availabilityView === 'overlap' && !common ? 'not-overlapping ' : '') +
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
                    {m.id !== user?.id && (
                      <div className='flex gap-2'>
                        {!localOnly && pushSettings.enabled && (
                          <button
                            type='button'
                            className='btn subtle'
                            onClick={() => nudgeTeammate(m.id)}
                            title={`Send a push nudge to ${m.name}`}
                          >
                            <Send size={14} /> Nudge
                          </button>
                        )}
                        {isOwner && (
                          <button className='btn subtle' onClick={() => open('remove', m)}>
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
          {!isDemo && view === 'Project settings' && (
            <div className='stack project-settings' data-tutorial-step='4'>
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
        open={tutorialPrompt}
        onOpenChange={(open) => {
          if (open) return;
          if (tutorialPromptStarting.current) {
            tutorialPromptStarting.current = false;
            return;
          }
          declineTutorial();
        }}
      >
        <DialogContent className='tutorial-prompt-dialog sm:max-w-[420px]'>
          <DialogHeader>
            <DialogTitle>Do you want to use the tutorial?</DialogTitle>
            <DialogDescription>
              A short walkthrough helps you create a project, add tasks, and invite teammates. You
              can restart it later with Run Tutorial in your profile.
            </DialogDescription>
          </DialogHeader>
          <div className='tutorial-prompt-actions'>
            <button type='button' className='btn primary' onClick={startTutorial}>
              Yes, start tutorial
            </button>
            <button type='button' className='btn' onClick={declineTutorial}>
              No thanks
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (v || busy) return;
          if (modal === 'planner' && plan && planFromCreateId) {
            void cancelPlanReview();
            return;
          }
          setModal('');
          setPlan(null);
          setPlanFromCreateId(null);
        }}
      >
        <DialogContent
          className={`max-h-[88vh] overflow-x-hidden overflow-y-auto ${
            modal === 'planner' && plan ? 'sm:max-w-[640px]' : 'sm:max-w-[520px]'
          }`}
        >
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
                  planner: plan ? 'Review suggested plan' : 'Plan your project',
                  reminders: 'Reminder preferences',
                  profile: 'Your account',
                  remove: 'Remove team member',
                }[modal]
              }
            </DialogTitle>
            <DialogDescription>
              {modal === 'planner'
                ? planFromCreateId
                  ? 'Customize the plan, then Accept to keep the project — or Cancel to remove it.'
                  : 'Review the suggested plan before adding it to your project.'
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
                    Allow teammate nudges
                  </label>
                  <div className='push-controls'>
                    <p className='form-note'>
                      {pushSettings.enabled
                        ? 'Browser push lets project teammates send you a nudge on this device.'
                        : 'Browser push is waiting for this deployment’s VAPID keys to be configured.'}
                    </p>
                    <button
                      type='button'
                      className='btn subtle'
                      disabled={pushBusy || (!pushSettings.enabled && !pushSettings.subscribed)}
                      onClick={changePushSubscription}
                    >
                      {pushBusy
                        ? 'Updating…'
                        : pushSettings.subscribed
                          ? 'Turn off push on this device'
                          : 'Enable push on this device'}
                    </button>
                  </div>
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
                  <label>
                    Rubric or instructions (optional)
                    <textarea
                      value={draft.rubricPaste || ''}
                      maxLength={30000}
                      onChange={(e) => setDraft({ ...draft, rubricPaste: e.target.value })}
                      placeholder='Paste the assignment rubric or brief for AI to break into tasks…'
                    />
                  </label>
                  <label>
                    Upload rubric files (optional)
                    <input
                      type='file'
                      multiple
                      accept={PLAN_FILE_ACCEPT}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          rubricFiles: Array.from(e.target.files || []).slice(0, 3),
                        })
                      }
                    />
                  </label>
                  <p className='form-note'>
                    PDF, DOCX, images, or text — up to 3 files, 5 MB each. If AI is connected, we’ll
                    suggest tasks after create for you to review.
                  </p>
                  {Array.isArray(draft.rubricFiles) && draft.rubricFiles.length > 0 && (
                    <p className='form-note'>
                      Selected: {draft.rubricFiles.map((f: File) => f.name).join(', ')}
                    </p>
                  )}
                  <label className='flex gap-2 items-center'>
                    <input
                      type='checkbox'
                      checked={draft.includeMilestones !== false}
                      onChange={(e) =>
                        setDraft({ ...draft, includeMilestones: e.target.checked })
                      }
                    />
                    Include milestone suggestions
                  </label>
                </>
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
                <a className='btn primary' href='/signin?return_to=%2Fworkspace%2Foverview'>
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
              {modal === 'profile' && user && (
                <button type='button' className='btn' onClick={startTutorial}>
                  Run Tutorial
                </button>
              )}
              {modal === 'profile' && user && !localOnly && (
                <a
                  className='btn'
                  href='/api/auth/signout?return_to=%2F'
                  onClick={() => {
                    try {
                      window.sessionStorage.removeItem(startupNoticeKey);
                      window.sessionStorage.removeItem(WORKSPACE_VIEW_KEY);
                      window.sessionStorage.removeItem(DEMO_SESSION_KEY);
                    } catch {
                      // Ignore unavailable browser storage.
                    }
                  }}
                >
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
                    await removeProjectById(project.id, project.name, project.version);
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
                  {localOnly
                    ? 'Add GEMINI_API_KEY to .dev.vars and restart the local server to use AI planning.'
                    : 'AI planning needs a service connection before it can generate a plan. You can add tasks manually in the meantime.'}
                </div>
              )}
              {localOnly && aiReady && (
                <div className='notice'>
                  Local demo AI is on — uploads stay in memory and call Gemini from your
                  .dev.vars key.
                </div>
              )}
              {!plan && (
                <>
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
                    Upload rubric files
                    <input
                      type='file'
                      multiple
                      accept={PLAN_FILE_ACCEPT}
                      disabled={busy || !project.id}
                      onChange={async (e) => {
                        const selected = Array.from(e.target.files || []).slice(0, 3);
                        if (!selected.length || !project.id) return;
                        setBusy(true);
                        setError('');
                        try {
                          if (localOnly) {
                            setPlanFiles(selected);
                            setPlanFileIds([]);
                            toast.success(
                              `Ready ${selected.length} file${selected.length === 1 ? '' : 's'} for local AI planning.`,
                            );
                          } else {
                            const ids = await uploadPlanFiles(project.id, selected);
                            setPlanFileIds(ids);
                            setPlanFiles([]);
                            toast.success(
                              `Uploaded ${ids.length} file${ids.length === 1 ? '' : 's'} for planning.`,
                            );
                          }
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {!!(localOnly ? planFiles.length : planFileIds.length) && (
                    <p className='form-note'>
                      {(localOnly ? planFiles.length : planFileIds.length)} file
                      {(localOnly ? planFiles.length : planFileIds.length) === 1 ? '' : 's'} ready
                      for AI
                      {localOnly && planFiles.length
                        ? `: ${planFiles.map((f) => f.name).join(', ')}`
                        : '.'}
                    </p>
                  )}
                  <label className='flex gap-2 items-center'>
                    <input
                      type='checkbox'
                      checked={includeMilestones}
                      onChange={(e) => setIncludeMilestones(e.target.checked)}
                    />
                    Include milestone suggestions
                  </label>
                  <button
                    className='btn primary'
                    disabled={
                      !aiReady ||
                      busy ||
                      (requirements.trim().length < 30 &&
                        !(localOnly ? planFiles.length : planFileIds.length))
                    }
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        setPlan(
                          await requestPlan(
                            project.id,
                            requirements,
                            planFileIds,
                            includeMilestones,
                            project,
                            planFiles,
                          ),
                        );
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Sparkles size={16} />
                    {busy ? 'Planning…' : 'Generate suggested plan'}
                  </button>
                </>
              )}
              {plan && (
                <PlanReview
                  plan={plan}
                  members={project.members}
                  busy={busy}
                  cancelDeletesProject={!!planFromCreateId}
                  onChange={setPlan}
                  onAccept={() => void acceptSuggestedPlan()}
                  onCancel={() => void cancelPlanReview()}
                  onRegenerate={() => {
                    void (async () => {
                      setBusy(true);
                      setError('');
                      try {
                        setPlan(
                          await requestPlan(
                            project.id,
                            requirements,
                            planFileIds,
                            includeMilestones,
                            project,
                            planFiles,
                          ),
                        );
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Toaster position='top-center' richColors closeButton />
    </SidebarProvider>
  );
}
