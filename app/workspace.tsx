'use client';
import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AssignmentChat from './assignment-chat';
import AvatarCropDialog from './avatar-crop';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AVAILABILITY_DEFAULT_END,
  AVAILABILITY_DEFAULT_START,
  AVAILABILITY_HOUR_MAX,
  AVAILABILITY_HOUR_MIN,
  applyBlockBusyHours,
  applySuggestOpenHours,
  availabilityMemberColor,
  bestTeamRanges,
  classifyGoogleSlots,
  countSlotsOutsideDefaultBand,
  dayAvailabilitySummaries,
  hourLabel,
  slotKeyFor,
  teammateSlotBackground,
} from '@/lib/availability-calendar';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { emptyProject, future, type Project, type Task, type Member } from '@/lib/model';
import { workspacePathByView, workspaceViewByPath } from '@/lib/workspace-routes';
import {
  localNudgeNotification,
  localTaskActivityNotifications,
  type AppNotification,
} from '@/lib/notifications';
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

function AvatarFace({
  name,
  avatarUrl,
  className = 'avatar',
  alt = '',
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);
  if (avatarUrl && !failed) {
    return (
      <span className={className}>
        <img src={avatarUrl} alt={alt} onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className={className}>{initials(name || '–')}</span>;
}

function PersonAvatar({
  name,
  email,
  avatarUrl,
  className = 'avatar',
  alt = '',
  showInfo = false,
}: {
  name: string;
  email?: string;
  avatarUrl?: string | null;
  className?: string;
  alt?: string;
  showInfo?: boolean;
}) {
  const face = <AvatarFace name={name} avatarUrl={avatarUrl} className={className} alt={alt} />;
  if (!showInfo || !name || name === '–') return face;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='avatar-info-trigger'
          aria-label={`View ${name}`}
          title={name}
          onClick={(event) => event.stopPropagation()}
        >
          {face}
        </button>
      </PopoverTrigger>
      <PopoverContent align='center' className='person-card w-[300px] max-w-[min(300px,calc(100vw-24px))]'>
        <div className='person-card-body'>
          <AvatarFace name={name} avatarUrl={avatarUrl} className='avatar avatar-lg' />
          <div className='person-card-meta'>
            <strong title={name}>{name}</strong>
            {email ? <small title={email}>{email}</small> : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
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
const GOOGLE_CALENDAR_FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};
type GoogleCalendarBusyInterval = { start: string; end: string };
type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    { busy?: GoogleCalendarBusyInterval[]; errors?: { reason: string }[] }
  >;
  error?: { message?: string };
};
type GoogleIdentityServices = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: { type: string; message?: string }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}
let googleIdentityScriptPromise: Promise<void> | null = null;
function loadGoogleIdentityServices() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () =>
        window.google?.accounts.oauth2
          ? resolve()
          : reject(new Error('Google sign-in could not be loaded.'));
      script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
      document.head.appendChild(script);
    }).catch((error) => {
      googleIdentityScriptPromise = null;
      throw error;
    });
  }
  return googleIdentityScriptPromise;
}
function requestGoogleCalendarAccessToken(clientId: string) {
  return new Promise<string>((resolve, reject) => {
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) {
      reject(new Error('Google sign-in is not ready. Please try again.'));
      return;
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_FREEBUSY_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || 'Google Calendar access was not granted.',
            ),
          );
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(new Error(error.message || 'Google sign-in was closed before it finished.')),
    });
    client.requestAccessToken();
  });
}
const uid = () => crypto.randomUUID();
type GoogleSyncPreview = {
  busyKeys: string[];
  freeKeys: string[];
  visibleKeys: string[];
};
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
    avatarUrl?: string;
  } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [photoCrop, setPhotoCrop] = useState<{
    url: string;
    kind: 'avatar' | 'project' | 'milestone';
    projectId?: string;
    milestoneId?: string;
  } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const projectPhotoInputRef = useRef<HTMLInputElement>(null);
  const milestonePhotoInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [startupNoticeReady, setStartupNoticeReady] = useState(false);
  const [showStartupNotice, setShowStartupNotice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState('');
  const [filter, setFilter] = useState('active');
  const [milestoneFilter, setMilestoneFilter] = useState('all');
  const [availabilityFocusId, setAvailabilityFocusId] = useState<string | null>(null);
  const [availabilityDayIndex, setAvailabilityDayIndex] = useState(0);
  const [availabilityNarrow, setAvailabilityNarrow] = useState(false);
  const [availabilityFullHours, setAvailabilityFullHours] = useState(false);
  const [googleCalendarClientId, setGoogleCalendarClientId] = useState('');
  const [googleCalendarConfigLoaded, setGoogleCalendarConfigLoaded] = useState(false);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);
  const [googleIdentityLoadError, setGoogleIdentityLoadError] = useState('');
  const [googleCalendarSyncBusy, setGoogleCalendarSyncBusy] = useState(false);
  const [googleBusySlots, setGoogleBusySlots] = useState<string[]>([]);
  const [googleSyncPreview, setGoogleSyncPreview] = useState<GoogleSyncPreview | null>(null);
  const [pendingAvailability, setPendingAvailability] = useState<string[] | null>(null);
  const [availabilityPaintPreview, setAvailabilityPaintPreview] = useState<string[] | null>(null);
  const availabilityPaintRef = useRef<{
    mode: 'add' | 'remove';
    working: Set<string>;
    startKey: string;
    visited: Set<string>;
    moved: boolean;
    busyDismissOnly: boolean;
  } | null>(null);
  const availabilityPaintMoveRef = useRef<(event: PointerEvent) => void>(() => {});
  const availabilityPaintEndRef = useRef<() => void>(() => {});
  const availabilityPaintMoveListenerRef = useRef((event: PointerEvent) =>
    availabilityPaintMoveRef.current(event),
  );
  const availabilityPaintEndListenerRef = useRef(() => availabilityPaintEndRef.current());
  const projectRef = useRef(project);
  const availabilitySaveTailRef = useRef(Promise.resolve());
  const availabilityAckRef = useRef<string[] | null>(null);
  const availabilityExpandedForRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
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

  useEffect(() => {
    if (view !== 'Availability') return;
    let active = true;
    fetch('/api/google-calendar/config', { cache: 'no-store' })
      .then(async (response) => {
        const data: { clientId?: string; error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error || 'Google Calendar is unavailable.');
        return data.clientId || '';
      })
      .then(async (clientId) => {
        if (!active) return;
        setGoogleCalendarClientId(clientId);
        setGoogleCalendarConfigLoaded(true);
        if (clientId) {
          await loadGoogleIdentityServices();
          if (active) setGoogleIdentityReady(true);
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setGoogleIdentityLoadError((loadError as Error).message);
        setGoogleCalendarConfigLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [view]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => setAvailabilityNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    availabilityAckRef.current = null;
    availabilityExpandedForRef.current = null;
    setAvailabilityFocusId(null);
  }, [project.id]);

  useEffect(() => {
    if (!project.id || availabilityExpandedForRef.current === project.id) return;
    const userId = user?.id || '';
    const dates = Array.from({ length: 7 }, (_, index) => future(index));
    const mine = new Set(
      pendingAvailability !== null ? pendingAvailability : project.availability[userId] || [],
    );
    const outside = countSlotsOutsideDefaultBand({
      dates,
      include: (slotKey) => {
        if (pendingAvailability !== null) return mine.has(slotKey);
        let count = mine.has(slotKey) ? 1 : 0;
        for (const member of project.members) {
          if (member.id === userId) continue;
          if ((project.availability[member.id] || []).includes(slotKey)) count += 1;
        }
        return count >= 2;
      },
    });
    if (outside.total > 0) {
      availabilityExpandedForRef.current = project.id;
      setAvailabilityFullHours(true);
    }
  }, [project.id, project.availability, project.members, pendingAvailability, user?.id]);

  useEffect(() => {
    if (pendingAvailability === null) return;
    const dates = Array.from({ length: 7 }, (_, index) => future(index));
    const pending = new Set(pendingAvailability);
    const outside = countSlotsOutsideDefaultBand({
      dates,
      include: (slotKey) => pending.has(slotKey),
    });
    if (outside.total > 0) setAvailabilityFullHours(true);
  }, [pendingAvailability]);

  const today = future(0);
  const me = user?.id || '';
  const savedAvailabilitySlots =
    pendingAvailability !== null ? pendingAvailability : project.availability[me] || [];
  const myAvailabilitySlots =
    availabilityPaintPreview !== null ? availabilityPaintPreview : savedAvailabilitySlots;
  const myAvailabilitySet = new Set(myAvailabilitySlots);
  const googleBusySet = new Set(googleBusySlots);
  const availabilityHourStart = availabilityFullHours
    ? AVAILABILITY_HOUR_MIN
    : AVAILABILITY_DEFAULT_START;
  const availabilityHourEnd = availabilityFullHours
    ? AVAILABILITY_HOUR_MAX
    : AVAILABILITY_DEFAULT_END;
  const availabilityHours = Array.from(
    { length: availabilityHourEnd - availabilityHourStart + 1 },
    (_, index) => availabilityHourStart + index,
  );
  const availabilityDayIndexes = availabilityNarrow
    ? [Math.min(Math.max(availabilityDayIndex, 0), 6)]
    : Array.from({ length: 7 }, (_, index) => index);
  const availabilityDates = Array.from({ length: 7 }, (_, index) => future(index));
  const daySummaries = availabilityDayIndexes.map((dayIndex) =>
    dayAvailabilitySummaries({
      date: availabilityDates[dayIndex],
      selected: myAvailabilitySet,
    }),
  );
  let teammateColorIndex = 0;
  const memberAvailability = project.members.map((member) => {
    const self = member.id === me;
    return {
      member,
      self,
      color: self ? '#5b54d9' : availabilityMemberColor(teammateColorIndex++),
      slots: self ? myAvailabilitySet : new Set(project.availability[member.id] || []),
    };
  });
  const submittedSchedules = memberAvailability.filter((entry) => entry.slots.size > 0).length;
  const availabilityCountAt = (slotKey: string) =>
    memberAvailability.reduce((count, entry) => count + (entry.slots.has(slotKey) ? 1 : 0), 0);
  const overlapBestTimes = bestTeamRanges({
    dates: availabilityDates,
    countAt: availabilityCountAt,
    total: project.members.length,
  });
  const outsideRelevantSlots = countSlotsOutsideDefaultBand({
    dates: availabilityDates,
    include: (slotKey) => {
      if (pendingAvailability !== null) return myAvailabilitySet.has(slotKey);
      return availabilityCountAt(slotKey) >= 2;
    },
  });
  const done = project.tasks.filter((t) => t.status === 'done').length;
  const percent = Math.round((done / Math.max(1, project.tasks.length)) * 100);
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
    persistProjectSelection(p.id || null);
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
    persistProjectSelection(null);
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
  async function loadNotifications() {
    if (localOnly || demoMode) return;
    try {
      const r = await fetch('/api/notifications');
      const data: any = await r.json();
      if (!r.ok) return;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      // Keep the last known inbox if the request fails.
    }
  }

  async function markNotifications(action: 'read' | 'readAll', ids?: string[]) {
    if (localOnly || demoMode) {
      setNotifications((current) =>
        current.map((n) =>
          action === 'readAll' || (ids || []).includes(n.id) ? { ...n, read: true } : n,
        ),
      );
      return;
    }
    try {
      await api('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'readAll' ? { action } : { action, ids }),
      });
      setNotifications((current) =>
        current.map((n) =>
          action === 'readAll' || (ids || []).includes(n.id) ? { ...n, read: true } : n,
        ),
      );
    } catch (error) {
      toast.error((error as Error).message || 'Could not update notifications.');
    }
  }

  async function respondToInvite(note: AppNotification, decision: 'accept' | 'reject') {
    const inviteId = note.meta.inviteId;
    if (!inviteId) return;
    try {
      await api('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', inviteId, decision }),
      });
      setNotifications((current) =>
        current.map((item) =>
          item.id === note.id
            ? { ...item, read: true, meta: { ...item.meta, state: decision === 'accept' ? 'accepted' : 'rejected' } }
            : item,
        ),
      );
      toast.success(decision === 'accept' ? 'You joined the project.' : 'Invite declined.');
      if (decision === 'accept') await load();
    } catch (error) {
      toast.error((error as Error).message || 'Could not update that invite.');
    }
  }

  function applyAvatarUrl(avatarUrl: string) {
    const userId = user?.id;
    const nextUrl = avatarUrl || undefined;
    setUser((current) => (current ? { ...current, avatarUrl: nextUrl } : current));
    setDraft((current: any) => ({ ...current, avatarUrl: nextUrl }));
    if (!userId) return;
    setProject((current) => ({
      ...current,
      members: current.members.map((member) =>
        member.id === userId ? { ...member, avatarUrl: nextUrl } : member,
      ),
    }));
    setProjects((current) =>
      current.map((entry) => ({
        ...entry,
        members: entry.members.map((member) =>
          member.id === userId ? { ...member, avatarUrl: nextUrl } : member,
        ),
      })),
    );
  }

  function readLocalImageDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not read the photo.'));
      reader.onerror = () => reject(new Error('Could not read the photo.'));
      reader.readAsDataURL(file);
    });
  }

  function closePhotoCrop() {
    setPhotoCrop((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    if (projectPhotoInputRef.current) projectPhotoInputRef.current.value = '';
    if (milestonePhotoInputRef.current) milestonePhotoInputRef.current.value = '';
  }

  function beginPhotoCrop(
    file: File,
    kind: 'avatar' | 'project' | 'milestone',
    ids?: { projectId?: string; milestoneId?: string },
  ) {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    if (file.size > 8_000_000) {
      toast.error('Choose a photo under 8 MB to crop.');
      return;
    }
    setPhotoCrop((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return {
        url: URL.createObjectURL(file),
        kind,
        projectId: ids?.projectId,
        milestoneId: ids?.milestoneId,
      };
    });
  }

  function applyProjectPhotoUrl(projectId: string, photoUrl: string) {
    const nextUrl = photoUrl || undefined;
    setProject((current) =>
      current.id === projectId ? { ...current, photoUrl: nextUrl } : current,
    );
    setProjects((current) =>
      current.map((entry) =>
        entry.id === projectId ? { ...entry, photoUrl: nextUrl } : entry,
      ),
    );
    setDraft((current: any) =>
      current?.id === projectId ? { ...current, photoUrl: nextUrl } : current,
    );
  }

  function applyMilestonePhotoUrl(projectId: string, milestoneId: string, photoUrl: string) {
    const nextUrl = photoUrl || undefined;
    const patch = (entry: Project) =>
      entry.id !== projectId
        ? entry
        : {
            ...entry,
            milestones: entry.milestones.map((milestone) =>
              milestone.id === milestoneId ? { ...milestone, photoUrl: nextUrl } : milestone,
            ),
          };
    setProject(patch);
    setProjects((current) => current.map(patch));
    setDraft((current: any) =>
      current?.id === milestoneId ? { ...current, photoUrl: nextUrl } : current,
    );
  }

  async function uploadProfilePhoto(file: File) {
    if (localOnly || demoMode) {
      applyAvatarUrl(await readLocalImageDataUrl(file));
      toast.success('Local profile photo updated (not saved to the cloud).');
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('/api/avatar', { method: 'POST', body: form });
      applyAvatarUrl(result.avatarUrl || '');
      toast.success('Profile photo updated.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not upload the photo.');
      throw error;
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function removeProfilePhoto() {
    if (localOnly || demoMode) {
      applyAvatarUrl('');
      toast.success('Local profile photo removed.');
      return;
    }
    setAvatarBusy(true);
    try {
      await api('/api/avatar', { method: 'DELETE' });
      applyAvatarUrl('');
      toast.success('Profile photo removed.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not remove the photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function uploadProjectPhoto(file: File, projectId: string) {
    if (!projectId) throw new Error('Save the project before adding a photo.');
    if (localOnly || demoMode) {
      applyProjectPhotoUrl(projectId, await readLocalImageDataUrl(file));
      toast.success('Local project photo updated (not saved to the cloud).');
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append('project', projectId);
      form.append('file', file);
      const result = await api('/api/project-photo', { method: 'POST', body: form });
      applyProjectPhotoUrl(projectId, result.photoUrl || '');
      toast.success('Project photo updated.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not upload the project photo.');
      throw error;
    } finally {
      setAvatarBusy(false);
      if (projectPhotoInputRef.current) projectPhotoInputRef.current.value = '';
    }
  }

  async function removeProjectPhoto(projectId: string) {
    if (!projectId) return;
    if (localOnly || demoMode) {
      applyProjectPhotoUrl(projectId, '');
      toast.success('Local project photo removed.');
      return;
    }
    setAvatarBusy(true);
    try {
      await api('/api/project-photo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId }),
      });
      applyProjectPhotoUrl(projectId, '');
      toast.success('Project photo removed.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not remove the project photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function uploadMilestonePhoto(file: File, projectId: string, milestoneId: string) {
    if (!projectId || !milestoneId) throw new Error('Save the milestone before adding a photo.');
    if (localOnly || demoMode) {
      applyMilestonePhotoUrl(projectId, milestoneId, await readLocalImageDataUrl(file));
      toast.success('Local milestone photo updated (not saved to the cloud).');
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append('project', projectId);
      form.append('milestone', milestoneId);
      form.append('file', file);
      const result = await api('/api/milestone-photo', { method: 'POST', body: form });
      applyMilestonePhotoUrl(projectId, milestoneId, result.photoUrl || '');
      toast.success('Milestone photo updated.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not upload the milestone photo.');
      throw error;
    } finally {
      setAvatarBusy(false);
      if (milestonePhotoInputRef.current) milestonePhotoInputRef.current.value = '';
    }
  }

  async function removeMilestonePhoto(projectId: string, milestoneId: string) {
    if (!projectId || !milestoneId) return;
    if (localOnly || demoMode) {
      applyMilestonePhotoUrl(projectId, milestoneId, '');
      toast.success('Local milestone photo removed.');
      return;
    }
    setAvatarBusy(true);
    try {
      await api('/api/milestone-photo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId, milestone: milestoneId }),
      });
      applyMilestonePhotoUrl(projectId, milestoneId, '');
      toast.success('Milestone photo removed.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not remove the milestone photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function nudgeTeammate(recipientId: string, message = '') {
    const customMessage = message.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (localOnly) {
      const note = localNudgeNotification({
        recipientId,
        senderName: user?.name || 'Teammate',
        projectId: project.id,
        projectName: project.name,
        message: customMessage,
      });
      // Sandbox: show the nudge in this session's bell so the UX is testable.
      setNotifications((current) => [{ ...note, userId: user?.id || note.userId }, ...current].slice(0, 50));
      toast.success('Nudge sent in TeamUP.');
      setDraft((current: any) => ({ ...current, nudgeMessage: '' }));
      return;
    }
    try {
      await api('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'nudge',
          projectId: project.id,
          recipientId,
          ...(customMessage ? { message: customMessage } : {}),
        }),
      });
      toast.success('Nudge sent in TeamUP.');
      setDraft((current: any) => ({ ...current, nudgeMessage: '' }));
      void loadNotifications();
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
      const selectedProject =
        data.projects.find(
          (p: Project) => p.id === new URLSearchParams(window.location.search).get('project'),
        ) ||
          data.projects[0] ||
          emptyProject;
      setProject(selectedProject);
      persistProjectSelection(selectedProject.id || null);
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
            const selectedProject =
              (data.projects || []).find(
                (p: Project) =>
                  p.id === new URLSearchParams(window.location.search).get('project'),
              ) ||
                data.projects?.[0] ||
                emptyProject;
            setProject(selectedProject);
            persistProjectSelection(selectedProject.id || null);
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
    if (localOnly || demoMode || !user?.id) return;
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 45000);
    return () => window.clearInterval(timer);
  }, [localOnly, demoMode, user?.id]);
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
    if (path) router.push(`${routeBase}/${path}${window.location.search}`, { scroll: false });
  }

  function persistProjectSelection(projectId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (projectId) params.set('project', projectId);
    else params.delete('project');
    const query = params.toString();
    const target = `${pathname || `${routeBase}/${workspacePathByView[view]}`}${query ? `?${query}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }

  function selectProject(nextProject: Project) {
    setProject(nextProject);
    persistProjectSelection(nextProject.id || null);
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
    const nextProject = remaining[0] || emptyProject;
    setProject(nextProject);
    persistProjectSelection(nextProject.id || null);
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
      if (user?.id) {
        const forMe = localTaskActivityNotifications(
          create ? null : project,
          next,
          user.id,
          user.name || 'Teammate',
        ).filter((n) => n.userId === user.id);
        if (forMe.length) {
          setNotifications((current) => [...forMe, ...current].slice(0, 50));
        }
      }
      setProject(next);
      persistProjectSelection(next.id || null);
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
      persistProjectSelection(result.project.id || null);
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
  async function syncGoogleCalendar() {
    if (!requireProject()) return;
    if (!googleCalendarClientId) {
      toast.error('Google Calendar sync needs an OAuth client ID. See docs/google-calendar-sync.md.');
      return;
    }
    if (!googleIdentityReady) {
      toast.error(googleIdentityLoadError || 'Google sign-in is still loading. Please try again.');
      return;
    }

    setGoogleCalendarSyncBusy(true);
    try {
      // Request during the click so Google can open its consent popup.
      const accessToken = await requestGoogleCalendarAccessToken(googleCalendarClientId);
      const visibleDates = Array.from({ length: 7 }, (_, index) => future(index));
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: new Date(`${visibleDates[0]}T00:00:00`).toISOString(),
          timeMax: new Date(`${future(7)}T00:00:00`).toISOString(),
          timeZone,
          items: [{ id: 'primary' }],
        }),
      });
      const data: GoogleFreeBusyResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Google Calendar could not return your busy times.');
      }
      const primaryCalendar = data.calendars?.primary;
      if (!primaryCalendar || primaryCalendar.errors?.length) {
        throw new Error('Could not read free/busy information from your primary Google Calendar.');
      }

      const busyIntervals = (primaryCalendar.busy || []).map((interval) => ({
        start: Date.parse(interval.start),
        end: Date.parse(interval.end),
      }));
      const classified = classifyGoogleSlots({
        dates: visibleDates,
        busyIntervals,
      });
      setGoogleSyncPreview(classified);
    } catch (syncError) {
      toast.error((syncError as Error).message || 'Unable to sync Google Calendar.');
    } finally {
      setGoogleCalendarSyncBusy(false);
    }
  }

  async function applyGoogleBlockBusy() {
    if (!requireProject() || !googleSyncPreview) return;
    const preview = googleSyncPreview;
    const visibleKeys = new Set(preview.visibleKeys);
    const busyKeys = new Set(preview.busyKeys);
    const nextAvailability = applyBlockBusyHours({
      existing: project.availability[me] || [],
      visibleKeys,
      busyKeys,
    });
    setGoogleBusySlots(preview.busyKeys);
    setPendingAvailability(null);
    setGoogleSyncPreview(null);
    commitAvailabilitySlots(nextAvailability, { force: true });
    toast.success(
      preview.busyKeys.length
        ? 'Busy hours from your calendar are blocked on your schedule.'
        : 'Calendar checked. No busy hours in this week — your selections are unchanged.',
    );
  }

  function startGoogleSuggestOpen() {
    if (!googleSyncPreview) return;
    const visibleKeys = new Set(googleSyncPreview.visibleKeys);
    const suggested = applySuggestOpenHours({
      existing: project.availability[me] || [],
      visibleKeys,
      freeKeys: googleSyncPreview.freeKeys,
    });
    setGoogleBusySlots(googleSyncPreview.busyKeys);
    setPendingAvailability(suggested);
    setGoogleSyncPreview(null);
    toast.message('Review suggested open hours, then Apply or Discard.');
  }

  function applyPendingAvailability() {
    if (!requireProject() || pendingAvailability === null) return;
    const next = pendingAvailability;
    setPendingAvailability(null);
    commitAvailabilitySlots(next, { force: true });
    toast.success('Availability updated from Google Calendar suggestions.');
  }

  function discardPendingAvailability() {
    setPendingAvailability(null);
    toast.message('Suggested hours discarded.');
  }

  function clearBusyMarks() {
    if (!googleBusySlots.length) return;
    setGoogleBusySlots([]);
    toast.message('Busy marks cleared.');
  }

  function dismissBusySlot(slotKey: string) {
    setGoogleBusySlots((current) => current.filter((slot) => slot !== slotKey));
  }

  function sameAvailabilitySlots(a: string[] = [], b: string[] = []) {
    if (a.length !== b.length) return false;
    const other = new Set(b);
    return a.every((slot) => other.has(slot));
  }

  function applyProjectLocally(next: Project) {
    projectRef.current = next;
    setProject(next);
    persistProjectSelection(next.id || null);
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  /** Optimistic availability commit — writes only this member's hours. */
  function commitAvailabilitySlots(next: string[], opts?: { force?: boolean }) {
    if (!requireProject()) return;
    if (!opts?.force && pendingAvailability !== null) {
      setPendingAvailability(next);
      setAvailabilityPaintPreview(null);
      return;
    }

    const userId = me;
    const base = projectRef.current;
    if (availabilityAckRef.current === null) {
      availabilityAckRef.current = [...(base.availability[userId] || [])];
    }
    applyProjectLocally({
      ...base,
      availability: { ...base.availability, [userId]: next },
    });
    setAvailabilityPaintPreview(null);

    if (localOnly) {
      availabilityAckRef.current = next;
      return;
    }

    availabilitySaveTailRef.current = availabilitySaveTailRef.current
      .catch(() => undefined)
      .then(async () => {
        for (;;) {
          const payload = projectRef.current;
          const slotsBefore = payload.availability[userId] || [];
          try {
            const result = await postAvailabilitySlots(payload.id, slotsBefore);
            const slotsNow = projectRef.current.availability[userId] || [];
            availabilityAckRef.current = (result.availability?.[userId] as string[]) || slotsBefore;
            applyProjectLocally({
              ...projectRef.current,
              availability: {
                ...(result.availability || {}),
                [userId]: sameAvailabilitySlots(slotsBefore, slotsNow) ? availabilityAckRef.current : slotsNow,
              },
            });
            if (sameAvailabilitySlots(slotsBefore, slotsNow)) return;
          } catch (error) {
            const message = (error as Error).message || 'Could not save availability.';
            const slotsNow = projectRef.current.availability[userId] || [];
            const rejected = /future availability|project details/i.test(message);
            if (!rejected && !sameAvailabilitySlots(slotsBefore, slotsNow)) continue;
            const ack = availabilityAckRef.current;
            if (ack && (rejected || sameAvailabilitySlots(slotsBefore, slotsNow))) {
              applyProjectLocally({
                ...projectRef.current,
                availability: { ...projectRef.current.availability, [userId]: ack },
              });
            }
            setError(message);
            toast.error(message);
            return;
          }
        }
      });
  }

  async function postAvailabilitySlots(projectId: string, slots: string[]) {
    const send = () =>
      api('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, slots }),
      });
    try {
      return await send();
    } catch (error) {
      const message = (error as Error).message || '';
      if (!/updated this project|reload before saving/i.test(message)) throw error;
      try {
        const data = await api('/api/workspace');
        const fresh = (data.projects as Project[]).find((item) => item.id === projectId);
        if (fresh) {
          const userId = me;
          applyProjectLocally({
            ...projectRef.current,
            version: fresh.version,
            availability: { ...fresh.availability, [userId]: slots },
          });
        }
      } catch {
        // The retry below still writes this member's hours on their own.
      }
      return await send();
    }
  }

  function paintAvailabilityKey(slotKey: string) {
    const session = availabilityPaintRef.current;
    if (!session) return;
    if (session.visited.has(slotKey)) return;
    session.visited.add(slotKey);
    setGoogleBusySlots((current) =>
      current.includes(slotKey) ? current.filter((slot) => slot !== slotKey) : current,
    );
    if (session.mode === 'add') session.working.add(slotKey);
    else session.working.delete(slotKey);
    setAvailabilityPaintPreview(Array.from(session.working));
  }

  availabilityPaintEndRef.current = () => {
    const session = availabilityPaintRef.current;
    if (!session) return;
    availabilityPaintRef.current = null;
    window.removeEventListener('pointermove', availabilityPaintMoveListenerRef.current);
    window.removeEventListener('pointerup', availabilityPaintEndListenerRef.current);
    window.removeEventListener('pointercancel', availabilityPaintEndListenerRef.current);

    if (session.busyDismissOnly && !session.moved) {
      dismissBusySlot(session.startKey);
      setAvailabilityPaintPreview(null);
      return;
    }

    commitAvailabilitySlots(Array.from(session.working));
  };

  availabilityPaintMoveRef.current = (event: PointerEvent) => {
    const session = availabilityPaintRef.current;
    if (!session) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const slot = target instanceof Element ? target.closest('[data-availability-slot]') : null;
    if (!(slot instanceof HTMLElement)) return;
    const slotKey = slot.dataset.availabilitySlot;
    // The rendered past flag can be stale if a slot boundary passes while the
    // calendar is open. Compare the slot timestamp at interaction time too.
    if (!slotKey || Date.parse(slotKey) <= Date.now()) return;
    if (slotKey !== session.startKey) session.moved = true;
    if (session.busyDismissOnly && session.moved) {
      session.busyDismissOnly = false;
      session.mode = 'add';
      session.working.add(session.startKey);
      setGoogleBusySlots((current) => current.filter((slot) => slot !== session.startKey));
    }
    paintAvailabilityKey(slotKey);
  };

  function startAvailabilityPaint(opts: {
    slotKey: string;
    selected: boolean;
    past: boolean;
    googleBusy: boolean;
    event: ReactPointerEvent<HTMLButtonElement>;
  }) {
    if (
      opts.past ||
      Date.parse(opts.slotKey) <= Date.now() ||
      opts.event.button !== 0 ||
      !requireProject()
    ) {
      return;
    }
    opts.event.preventDefault();
    const working = new Set(savedAvailabilitySlots);
    const busyDismissOnly = opts.googleBusy && !opts.selected;
    const mode: 'add' | 'remove' = opts.selected ? 'remove' : 'add';
    if (!busyDismissOnly) {
      if (opts.googleBusy) dismissBusySlot(opts.slotKey);
      if (mode === 'add') working.add(opts.slotKey);
      else working.delete(opts.slotKey);
    }
    availabilityPaintRef.current = {
      mode,
      working,
      startKey: opts.slotKey,
      visited: new Set([opts.slotKey]),
      moved: false,
      busyDismissOnly,
    };
    setAvailabilityPaintPreview(Array.from(working));
    window.addEventListener('pointermove', availabilityPaintMoveListenerRef.current);
    window.addEventListener('pointerup', availabilityPaintEndListenerRef.current);
    window.addEventListener('pointercancel', availabilityPaintEndListenerRef.current);
  }

  useEffect(() => {
    return () => {
      availabilityPaintRef.current = null;
      window.removeEventListener('pointermove', availabilityPaintMoveListenerRef.current);
      window.removeEventListener('pointerup', availabilityPaintEndListenerRef.current);
      window.removeEventListener('pointercancel', availabilityPaintEndListenerRef.current);
    };
  }, []);

  useEffect(() => {
    if (view !== 'Availability' || demoMode || localOnly || !project.id) return;
    let cancelled = false;
    const projectId = project.id;
    async function refreshTeammateHours() {
      if (availabilityPaintRef.current) return;
      try {
        const data = await api('/api/workspace');
        if (cancelled || availabilityPaintRef.current) return;
        if (projectRef.current.id !== projectId) return;
        const fresh = (data.projects as Project[]).find((item) => item.id === projectId);
        if (!fresh) return;
        const userId = user?.id || '';
        const mine = projectRef.current.availability[userId] || [];
        applyProjectLocally({
          ...projectRef.current,
          availability: { ...fresh.availability, [userId]: mine },
        });
      } catch {
        // Teammate hours refresh is best-effort.
      }
    }
    void refreshTeammateHours();
    const timer = window.setInterval(() => void refreshTeammateHours(), 20000);
    const onFocus = () => void refreshTeammateHours();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [view, demoMode, localOnly, project.id, user?.id]);
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
      if (draft.id) {
        const target =
          projects.find((entry) => entry.id === draft.id) ||
          (project.id === draft.id ? project : null);
        if (!target) {
          setError('Project not found.');
          return;
        }
        ok = await save({
          ...target,
          name: draft.name,
          course: draft.course || '',
          description: draft.description || '',
          due: draft.due,
        });
      } else {
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
      if (draft.id) {
        ok = await save({
          ...project,
          milestones: project.milestones.map((entry) =>
            entry.id === draft.id
              ? {
                  ...entry,
                  title: draft.title,
                  description: draft.description || '',
                  due: draft.due,
                }
              : entry,
          ),
        });
      } else {
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
    }
    if (modal === 'member') {
      if (project.members.some((m) => m.email.toLowerCase() === draft.email.toLowerCase())) {
        setError('This email is already on the team.');
        return;
      }
      const memberEmail = draft.email.toLowerCase();
      ok = await save({
        ...project,
        members: [
          ...project.members,
          { id: uid(), name: draft.name, email: memberEmail },
        ],
      });
    }
    if (modal === 'rename-file') {
      const nextName =
        typeof draft.name === 'string' ? draft.name.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      if (!draft.id || !nextName) {
        setError('Enter a file name.');
        return;
      }
      if (localOnly) {
        setError('File renames need the live workspace.');
        return;
      }
      setBusy(true);
      try {
        await api('/api/files', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: project.id, id: draft.id, name: nextName }),
        });
        setFiles((current) =>
          current.map((entry) => (entry.id === draft.id ? { ...entry, name: nextName } : entry)),
        );
        ok = true;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
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
        const { avatarUrl: _avatarUrl, nudgeMessage: _nudgeMessage, ...profileFields } = draft;
        await api('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'profile', ...profileFields }),
        });
        setUser((u) =>
          u
            ? {
                ...u,
                ...profileFields,
                avatarUrl: u.avatarUrl,
              }
            : u,
        );
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
          <PersonAvatar
            name={project.members.find((m) => m.id === t.assignee)?.name || '–'}
            email={project.members.find((m) => m.id === t.assignee)?.email}
            avatarUrl={project.members.find((m) => m.id === t.assignee)?.avatarUrl}
            showInfo
          />
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
        {m.photoUrl ? (
          <span className='milestone-photo'>
            <img src={m.photoUrl} alt='' />
          </span>
        ) : null}
        <div className='milestone-copy'>
          <p>{m.title}</p>
          <small>
            {fmt(m.due)}
            {m.done ? ' · Completed' : ''}
          </small>
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='milestone-row-menu'
              aria-label={`Options for ${m.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={18} color='#9ca4b3' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='milestone-dropdown'>
            <DropdownMenuItem
              onSelect={() => {
                if (requireProject()) open('milestone', m);
              }}
            >
              Edit milestone
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              <div
                key={p.id}
                className={'project-option-row ' + (p.id === project.id ? 'active' : '')}
              >
                <button
                  type='button'
                  title={p.name}
                  className='project-option'
                  onClick={() => {
                    selectProject(p);
                    setError('');
                  }}
                >
                  {p.photoUrl ? (
                    <span className='project-option-thumb'>
                      <img src={p.photoUrl} alt='' />
                    </span>
                  ) : (
                    <span className='project-option-glyph' aria-hidden>
                      ▧
                    </span>
                  )}
                  <span className='project-option-name'>{p.name}</span>
                </button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type='button'
                      className='project-option-menu'
                      aria-label={`Options for ${p.name}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal size={16} color='#9ca4b3' />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='milestone-dropdown'>
                    <DropdownMenuItem
                      onSelect={() => {
                        selectProject(p);
                        open('project', {
                          id: p.id,
                          name: p.name,
                          course: p.course,
                          description: p.description,
                          due: p.due,
                          photoUrl: p.photoUrl,
                        });
                      }}
                    >
                      Edit project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
            <PersonAvatar
              className='avatar'
              name={isLocalAdmin ? 'admin' : user?.username || user?.name || 'Guest'}
              avatarUrl={user?.avatarUrl}
            />
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
            {/* Sidebar toggle for mobile, tablet, and desktop layouts. */}
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
            <Popover
              open={notifOpen}
              onOpenChange={(open) => {
                setNotifOpen(open);
                if (open) void loadNotifications();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type='button'
                  className='bell'
                  aria-label='Notifications'
                  aria-haspopup='dialog'
                >
                  <Bell size={19} />
                  {notifications.some((n) => !n.read) ? (
                    <span className='bell-badge' aria-hidden>
                      {Math.min(
                        9,
                        notifications.filter((n) => !n.read).length,
                      )}
                      {notifications.filter((n) => !n.read).length > 9 ? '+' : ''}
                    </span>
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent align='end' className='notification-popover w-[340px] p-0'>
                <div className='notification-popover-head'>
                  <strong>Notifications</strong>
                  {notifications.some((n) => !n.read) ? (
                    <button
                      type='button'
                      className='btn subtle'
                      onClick={() => void markNotifications('readAll')}
                    >
                      Mark all read
                    </button>
                  ) : null}
                </div>
                <div className='notification-list'>
                  {!notifications.length ? (
                    <p className='notification-empty'>No updates yet.</p>
                  ) : (
                    notifications.map((n) => {
                      const pendingInvite =
                        n.type === 'project_invite' && n.meta.inviteId && n.meta.state !== 'accepted' && n.meta.state !== 'rejected';
                      return (
                      <div
                        key={n.id}
                        className={`notification-item${n.read ? '' : ' unread'}`}
                        onClick={() => {
                          if (!n.read) void markNotifications('read', [n.id]);
                          if (pendingInvite) return;
                          if (n.projectId && n.projectId !== project.id) {
                            const target = projects.find((p) => p.id === n.projectId);
                            if (target) selectProject(target);
                          }
                          setNotifOpen(false);
                        }}
                      >
                        <span className='notification-item-title'>{n.title}</span>
                        <span className='notification-item-body'>{n.body}</span>
                        <span className='notification-item-time'>
                          {new Date(n.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {pendingInvite ? (
                          <span className='notification-actions'>
                            <button
                              type='button'
                              className='btn primary'
                              onClick={(event) => {
                                event.stopPropagation();
                                void respondToInvite(n, 'accept');
                              }}
                            >
                              Accept
                            </button>
                            <button
                              type='button'
                              className='btn subtle'
                              onClick={(event) => {
                                event.stopPropagation();
                                void respondToInvite(n, 'reject');
                              }}
                            >
                              Decline
                            </button>
                          </span>
                        ) : null}
                      </div>
                      );
                    })
                  )}
                </div>
                <div className='notification-popover-foot'>
                  <button
                    type='button'
                    className='btn subtle'
                    onClick={() => {
                      setNotifOpen(false);
                      if (requireProject()) open('reminders', { hours: project.reminderHours });
                    }}
                  >
                    Reminder preferences
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              type='button'
              className='profile-avatar-button'
              aria-label='Open profile settings'
              title='Profile settings'
              onClick={() =>
                open('profile', {
                  ...user,
                  timeZone: user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            >
              <PersonAvatar
                name={user?.username || user?.name || 'You'}
                avatarUrl={user?.avatarUrl}
              />
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
                    projects and tasks here for testing. Changes stay on this device.
                  </>
                ) : (
                  <>
                    <strong>{demoMode ? 'Demo workspace' : 'Practice workspace'}</strong> · Explore
                    tasks, milestones, chat, and AI planning. Changes stay on this device and reset
                    when you reload.
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
          <div
            className={`page-heading${view === 'Overview' ? ' overview-page-heading' : ''}`}
            data-tutorial-step='0'
          >
            <div>
              <h1>
                {view === 'Overview' ? (
                  user ? (
                      <>
                        <span className='overview-greeting-lead'>Let’s make progress,</span>{' '}
                        <span className='overview-greeting-name'>{user.name.split(' ')[0]}.</span>
                      </>
                    ) : (
                      'Let’s make progress.'
                    )
                ) : (
                  view
                )}
              </h1>
              <p className='subtext'>
                {view === 'Overview'
                  ? 'Your team, your tasks, and the next step forward.'
                  : project.name}
              </p>
            </div>
            {view !== 'Project settings' &&
              view !== 'Availability' &&
              view !== 'Files' && (
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
                    if (isOwner) document.getElementById('invite-search')?.focus();
                    else toast.info('The project creator can invite teammates.');
                  } else if (requireProject()) open('task', { due: future(1), status: 'todo' });
                }}
              >
                <Plus size={16} />
                {view === 'Assignment chat'
                  ? 'AI planner'
                  : view === 'Milestones'
                    ? 'Add milestone'
                      : view === 'Team'
                        ? 'Invite'
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
                <a
                  className='btn'
                  href='/demo/overview'
                  onClick={(e) => {
                    e.preventDefault();
                    try {
                      window.sessionStorage.removeItem(DEMO_SESSION_KEY);
                      window.sessionStorage.removeItem(startupNoticeKey);
                      window.sessionStorage.removeItem(WORKSPACE_VIEW_KEY);
                    } catch {
                      // Ignore unavailable browser storage.
                    }
                    window.location.assign('/demo/overview');
                  }}
                >
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
                <a className='underline ml-3' href='/signin?return_to=%2Fworkspace%2Foverview'>
                  Sign in
                </a>
              )}
            </div>
          )}
          {canConfigureAI && !aiReady && (
            <div className='notice flex justify-between gap-3 items-center'>
              <span>Connect AI to turn on assignment chat and planning.</span>
              <button className='btn primary' onClick={() => open('ai-settings')}>
                Connect AI
              </button>
            </div>
          )}
          {!isDemo && view === 'Overview' && (
            <>
              <section className='project-banner'>
                <div className='project-banner-main'>
                  {project.photoUrl ? (
                    <span className='project-banner-photo'>
                      <img src={project.photoUrl} alt='' />
                    </span>
                  ) : null}
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
                          <PersonAvatar
                            key={m.id}
                            name={m.name}
                            email={m.email}
                            avatarUrl={m.avatarUrl}
                            showInfo
                          />
                        ))}
                      </span>
                    </span>
                  </div>
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
                          <PersonAvatar
                            name={m.name}
                            email={m.email}
                            avatarUrl={m.avatarUrl}
                            showInfo
                          />
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
                persistProjectSelection(next.id || null);
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
            <section className='panel availability-panel'>
              <div className='panel-heading availability-heading'>
                <div>
                  <h2>Find time together</h2>
                  <p className='subtext availability-heading-note'>
                    Paint the hours you’re free. Darker cells mean more of the team is free then.
                  </p>
                </div>
                <span className='subtext'>
                  {submittedSchedules} / {project.members.length} schedules
                </span>
              </div>

              <div className='availability-toolbar'>
                <button
                  type='button'
                  className='btn availability-sync-button'
                  disabled={busy || googleCalendarSyncBusy || !googleCalendarConfigLoaded}
                  title='Check busy times on your primary Google Calendar, then confirm how to apply them.'
                  onClick={syncGoogleCalendar}
                >
                  <CalendarDays size={16} />
                  {googleCalendarSyncBusy ? 'Syncing…' : 'Sync Google Calendar'}
                </button>
              </div>

              <div className='availability-people' role='list'>
                <button
                  type='button'
                  className={
                    'availability-person' + (availabilityFocusId ? '' : ' selected')
                  }
                  aria-pressed={!availabilityFocusId}
                  onClick={() => setAvailabilityFocusId(null)}
                >
                  Everyone
                </button>
                {memberAvailability.map(({ member, slots, color }) => {
                  const submitted = slots.size > 0;
                  const selected = availabilityFocusId === member.id;
                  const firstName = member.name.trim().split(/\s+/)[0] || member.name;
                  return (
                    <button
                      key={member.id}
                      type='button'
                      role='listitem'
                      className={
                        'availability-person' +
                        (selected ? ' selected' : '') +
                        (submitted ? ' submitted' : '')
                      }
                      style={{ '--person-color': color } as CSSProperties}
                      aria-pressed={selected}
                      title={
                        submitted
                          ? `${member.name} has shared hours`
                          : `${member.name} hasn’t shared hours yet`
                      }
                      onClick={() =>
                        setAvailabilityFocusId((current) =>
                          current === member.id ? null : member.id,
                        )
                      }
                    >
                      <AvatarFace name={member.name} avatarUrl={member.avatarUrl} />
                      <span className='availability-person-name'>{firstName}</span>
                      <i className='availability-person-status' aria-hidden='true' />
                    </button>
                  );
                })}
              </div>

              <div className='availability-best-times'>
                <h3>Best times this week</h3>
                {overlapBestTimes.length > 0 ? (
                  <ul>
                    {overlapBestTimes.map((range) => (
                      <li key={`${range.date}-${range.startHour}`}>{range.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {submittedSchedules < 2
                      ? 'When a teammate adds hours, the best overlaps show up here.'
                      : 'No shared hours in this week yet.'}
                  </p>
                )}
              </div>

              <div className='availability-legend' aria-label='Calendar legend'>
                <span>
                  <i className='availability-legend-swatch available' aria-hidden='true' />
                  Your hours
                </span>
                <span>
                  <i className='availability-legend-swatch teammates' aria-hidden='true' />
                  Teammate hours
                </span>
                {googleBusySlots.length > 0 ? (
                  <span className='availability-legend-busy'>
                    <i className='availability-legend-swatch busy' aria-hidden='true' />
                    Busy
                    <button
                      type='button'
                      className='availability-clear-busy'
                      onClick={clearBusyMarks}
                    >
                      Clear
                    </button>
                  </span>
                ) : null}
                <span>
                  <i className='availability-legend-swatch past' aria-hidden='true' />
                  Past
                </span>
              </div>

              {pendingAvailability !== null && (
                <div className='availability-pending-bar' role='status'>
                  <p>Suggested open hours are ready to review. Edit the grid, then apply.</p>
                  <div className='availability-pending-actions'>
                    <button
                      type='button'
                      className='btn subtle'
                      disabled={busy}
                      onClick={discardPendingAvailability}
                    >
                      Discard
                    </button>
                    <button
                      type='button'
                      className='btn primary'
                      disabled={busy}
                      onClick={applyPendingAvailability}
                    >
                      Apply suggestions
                    </button>
                  </div>
                </div>
              )}

              {availabilityNarrow && (
                <div className='availability-day-chips' role='tablist' aria-label='Choose a day'>
                  {availabilityDates.map((dateValue, index) => {
                    const date = new Date(dateValue + 'T12:00:00');
                    const selected = availabilityDayIndex === index;
                    return (
                      <button
                        key={dateValue}
                        type='button'
                        role='tab'
                        aria-selected={selected}
                        className={'availability-day-chip' + (selected ? ' selected' : '')}
                        onClick={() => setAvailabilityDayIndex(index)}
                      >
                        <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <strong>{date.getDate()}</strong>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className='availability-hour-controls'>
                {!availabilityFullHours && outsideRelevantSlots.total > 0 ? (
                  <button
                    type='button'
                    className='availability-outside-chip'
                    onClick={() => setAvailabilityFullHours(true)}
                  >
                    {outsideRelevantSlots.after > 0 && outsideRelevantSlots.before > 0
                      ? `${outsideRelevantSlots.total} ${
                          pendingAvailability !== null ? 'suggested times' : 'shared times'
                        } outside 9am–6pm — show all`
                      : outsideRelevantSlots.after > 0
                        ? `${outsideRelevantSlots.after} ${
                            pendingAvailability !== null ? 'suggested time' : 'shared time'
                          }${outsideRelevantSlots.after === 1 ? '' : 's'} after 6pm — show all`
                        : `${outsideRelevantSlots.before} ${
                            pendingAvailability !== null ? 'suggested time' : 'shared time'
                          }${outsideRelevantSlots.before === 1 ? '' : 's'} before 9am — show all`}
                  </button>
                ) : null}
                <button
                  type='button'
                  className='btn subtle availability-hour-toggle'
                  onClick={() => setAvailabilityFullHours((current) => !current)}
                >
                  {availabilityFullHours ? 'Show 9am–6pm' : 'Show 7am–10pm'}
                </button>
              </div>

              <div className='schedule-viewport'>
                <div
                  className={
                    'schedule' +
                    (availabilityNarrow ? ' schedule-single-day' : '') +
                    (availabilityFullHours ? ' schedule-full-hours' : ' schedule-default-hours')
                  }
                  style={
                    {
                      '--schedule-day-count': String(availabilityDayIndexes.length),
                      '--schedule-hour-count': String(availabilityHours.length),
                    } as CSSProperties
                  }
                >
                  <span className='schedule-corner' />
                  {availabilityDayIndexes.map((dayIndex, summaryIndex) => {
                    const dateValue = availabilityDates[dayIndex];
                    const date = new Date(dateValue + 'T12:00:00');
                    const weekdayAndMonth = date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                    });
                    const isToday = dateValue === today;
                    const summary = daySummaries[summaryIndex];
                    return (
                      <div className='day' key={`date-${dayIndex}`}>
                        <span className='day-name'>{weekdayAndMonth}</span>
                        <span className={`day-number${isToday ? ' today' : ''}`}>
                          {date.getDate()}
                        </span>
                        {summary.length > 0 ? (
                          <span className='day-summary' title={summary.join(', ')}>
                            {summary.join(' · ')}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {availabilityHours.map((hour) => (
                    <div className='contents' key={hour}>
                      <span className='time'>{hourLabel(hour)}</span>
                      {availabilityDayIndexes.map((dayIndex) => {
                        const dateValue = availabilityDates[dayIndex];
                        const key = slotKeyFor(dateValue, hour);
                        const past = new Date(key) < new Date();
                        const selected = myAvailabilitySet.has(key);
                        const googleBusy = googleBusySet.has(key);
                        const freeHere = memberAvailability.filter((entry) => entry.slots.has(key));
                        const teammatesHere = freeHere.filter((entry) => !entry.self);
                        const focusedEntry = availabilityFocusId
                          ? memberAvailability.find((entry) => entry.member.id === availabilityFocusId)
                          : undefined;
                        const focusedFree = focusedEntry ? focusedEntry.slots.has(key) : false;
                        const showSelf = availabilityFocusId
                          ? Boolean(focusedEntry?.self && focusedFree)
                          : selected;
                        const visibleTeamColors = availabilityFocusId
                          ? focusedEntry && !focusedEntry.self && focusedFree
                            ? [focusedEntry.color]
                            : []
                          : teammatesHere.map((entry) => entry.color);
                        const teamBackground =
                          !past && visibleTeamColors.length > 0
                            ? teammateSlotBackground(visibleTeamColors, Boolean(availabilityFocusId))
                            : undefined;
                        const showBusy = googleBusy && !showSelf && visibleTeamColors.length === 0;
                        const freeLabel = freeHere.length
                          ? `${freeHere.map((entry) => entry.member.name).join(', ')} free`
                          : 'No one free';
                        return (
                          <button
                            key={key}
                            type='button'
                            data-availability-slot={key}
                            data-availability-past={past ? '1' : '0'}
                            aria-label={`${fmt(dateValue)} at ${hourLabel(hour)}, ${freeLabel}${
                              selected ? ', your available hour' : ''
                            }${showBusy ? ', busy on Google Calendar' : ''}${
                              past ? ', time has passed' : ''
                            }`}
                            aria-pressed={selected}
                            disabled={past}
                            title={past ? 'Time has passed' : showBusy ? 'Busy' : freeLabel}
                            style={!showSelf && teamBackground ? { background: teamBackground } : undefined}
                            className={
                              'slot' +
                              (showSelf ? ' selected' : '') +
                              (showBusy ? ' google-busy' : '') +
                              (teamBackground && !showSelf ? ' team-marked' : '') +
                              (showSelf && teammatesHere.length > 0 && !availabilityFocusId
                                ? ' team-overlap'
                                : '') +
                              (availabilityFocusId && focusedFree && !focusedEntry?.self
                                ? ' slot-focus'
                                : '') +
                              (availabilityFocusId && !focusedFree ? ' slot-muted' : '') +
                              (past ? ' past' : ' slot-paintable')
                            }
                            onPointerDown={(event) =>
                              startAvailabilityPaint({
                                slotKey: key,
                                selected,
                                past,
                                googleBusy,
                                event,
                              })
                            }
                          >
                            {past ? (
                              <LockKeyhole
                                size={14}
                                className='availability-lock'
                                aria-hidden='true'
                              />
                            ) : showSelf ? (
                              <Check size={14} aria-hidden='true' />
                            ) : showBusy ? (
                              <span className='slot-busy-label' aria-hidden='true'>
                                Busy
                              </span>
                            ) : null}
                            {!past && showSelf && !availabilityFocusId && teammatesHere.length > 0 ? (
                              <span className='slot-marks' aria-hidden='true'>
                                {teammatesHere.map((entry) => (
                                  <i
                                    key={entry.member.id}
                                    className='slot-mark'
                                    style={{ background: entry.color }}
                                  />
                                ))}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

            </section>
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
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type='button'
                          className='file-row-menu'
                          aria-label={`Options for ${f.name}`}
                          disabled={busy || localOnly}
                        >
                          <MoreHorizontal size={18} color='#9ca4b3' />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='milestone-dropdown'>
                        <DropdownMenuItem
                          onSelect={() => open('rename-file', { id: f.id, name: f.name })}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void (async () => {
                              if (
                                !window.confirm(
                                  `Delete “${f.name}”? This removes it for everyone on the project.`,
                                )
                              )
                                return;
                              setBusy(true);
                              try {
                                await api('/api/files', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ project: project.id, id: f.id }),
                                });
                                setFiles((current) => current.filter((entry) => entry.id !== f.id));
                                toast.success('File deleted.');
                              } catch (error) {
                                toast.error((error as Error).message || 'Could not delete the file.');
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <span>Manage your teammates here. Invites show up in their notifications.</span>
                <button className='btn demo-banner-action' onClick={() => setView('Project settings')}>
                  <Settings size={16} />
                  Project settings
                </button>
              </div>
              {isOwner && !localOnly ? <InviteLink key={project.id} project={project.id} /> : null}
              <section className='panel team-list-panel'>
                <div className='panel-heading'>
                  <h2>Your project team</h2>
                </div>
                <p className='form-note team-list-hint'>
                  Click a teammate to see their tasks and reassign work.
                </p>
                {project.members.map((m) => {
                  const taskCount = project.tasks.filter((t) => t.assignee === m.id).length;
                  return (
                    <button
                      type='button'
                      className='member-row member-row-button'
                      key={m.id}
                      onClick={() => open('teammate', m)}
                    >
                      <PersonAvatar
                        name={m.name}
                        email={m.email}
                        avatarUrl={m.avatarUrl}
                        showInfo
                      />
                      <div className='member-name'>
                        {m.name}
                        <small className='block'>{m.email}</small>
                      </div>
                      <small>
                        {taskCount} task{taskCount === 1 ? '' : 's'}
                      </small>
                    </button>
                  );
                })}
              </section>
            </>
          )}
          {!isDemo && view === 'Project settings' && (
            <div className='stack project-settings' data-tutorial-step='4'>
              <section className='panel'>
                <div className='panel-heading'>
                  <div>
                    <h2>Project details</h2>
                    <p className='subtext'>
                      Update the basics and a shared project photo everyone can see.
                    </p>
                  </div>
                  <button
                    type='button'
                    className='btn subtle'
                    onClick={() =>
                      open('project', {
                        id: project.id,
                        name: project.name,
                        course: project.course,
                        description: project.description,
                        due: project.due,
                        photoUrl: project.photoUrl,
                      })
                    }
                  >
                    Edit details
                  </button>
                </div>
                <div className='profile-photo-row'>
                  <span className={'project-settings-photo' + (project.photoUrl ? '' : ' empty')}>
                    {project.photoUrl ? (
                      <img src={project.photoUrl} alt='' />
                    ) : (
                      <span>No photo</span>
                    )}
                  </span>
                  <div className='profile-photo-actions'>
                    <button
                      type='button'
                      className='btn'
                      disabled={avatarBusy || !project.id}
                      onClick={() => projectPhotoInputRef.current?.click()}
                    >
                      {avatarBusy
                        ? 'Updating…'
                        : project.photoUrl
                          ? 'Change photo'
                          : 'Upload photo'}
                    </button>
                    {project.photoUrl ? (
                      <button
                        type='button'
                        className='btn subtle'
                        disabled={avatarBusy}
                        onClick={() => void removeProjectPhoto(project.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className='form-note'>
                  JPEG, PNG, WebP, or GIF. Drag and zoom after you choose a photo.
                </p>
                <div className='project-settings-summary'>
                  <div>
                    <strong>{project.name}</strong>
                    <small className='block'>{project.course || 'No course listed'}</small>
                  </div>
                  <small>Due {fmt(project.due)}</small>
                </div>
              </section>
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
        open={!!googleSyncPreview}
        onOpenChange={(open) => {
          if (!open) setGoogleSyncPreview(null);
        }}
      >
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>Apply Google Calendar?</DialogTitle>
            <DialogDescription>
              {googleSyncPreview
                ? `Google shows ${googleSyncPreview.busyKeys.length} busy hour${
                    googleSyncPreview.busyKeys.length === 1 ? '' : 's'
                  } and ${googleSyncPreview.freeKeys.length} open hour${
                    googleSyncPreview.freeKeys.length === 1 ? '' : 's'
                  } in the next 7 days (7am–10pm). Nothing is saved until you choose.`
                : 'Review how to apply your Google Calendar.'}
            </DialogDescription>
          </DialogHeader>
          <div className='availability-sync-choices'>
            <p>
              <strong>Block busy hours</strong> clears any of your selected slots that overlap
              busy times from your calendar. It does not mark open hours as available.
            </p>
            <p>
              <strong>Suggest open hours</strong> previews free hours on your calendar so you can
              edit, then apply.
            </p>
          </div>
          <DialogFooter className='availability-sync-footer gap-2 sm:justify-between'>
            <button type='button' className='btn subtle' onClick={() => setGoogleSyncPreview(null)}>
              Cancel
            </button>
            <div className='availability-sync-footer-actions'>
              <button
                type='button'
                className='btn'
                disabled={busy}
                onClick={startGoogleSuggestOpen}
              >
                Suggest open hours
              </button>
              <button
                type='button'
                className='btn primary'
                disabled={busy}
                onClick={applyGoogleBlockBusy}
              >
                Block busy hours
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                  'ai-settings': 'Connect AI',
                  brief: 'Assignment brief',
                  project: draft.id ? 'Edit project' : 'Create a project',
                  task: draft.id ? 'Edit task' : 'Add a task',
                  milestone: draft.id ? 'Edit milestone' : 'Add a milestone',
                  member: 'Add a team member',
                  teammate: draft.name || 'Teammate',
                  planner: plan ? 'Review suggested plan' : 'Plan your project',
                  reminders: 'Reminder preferences',
                  profile: 'Your account',
                  remove: 'Remove team member',
                  'rename-file': 'Rename file',
                }[modal]
              }
            </DialogTitle>
            <DialogDescription>
              {modal === 'planner'
                ? planFromCreateId
                  ? 'Customize the plan, then Accept to keep the project — or Cancel to remove it.'
                  : 'Review the suggested plan before adding it to your project.'
                : modal === 'teammate'
                  ? 'Review their assigned work and move tasks to someone else if needed.'
                  : modal === 'project'
                    ? draft.id
                      ? 'Update the project details teammates see.'
                      : 'Give your group a place to make progress.'
                    : modal === 'milestone'
                      ? draft.id
                        ? 'Update this milestone for the whole team.'
                        : 'Add a milestone to mark progress.'
                      : modal === 'rename-file'
                        ? 'Choose a clearer name for this shared file.'
                        : 'Keep your team on the same page.'}
            </DialogDescription>
          </DialogHeader>
          {error && <div className='error'>{error}</div>}
          {modal === 'ai-settings' && (
            <ConnectAI
              onConnected={() => {
                setAiReady(true);
                setModal('');
                toast.success('AI is connected. Ask a question or plan your project.');
              }}
            />
          )}
          {[
            'project',
            'task',
            'milestone',
            'member',
            'reminders',
            'profile',
            'brief',
            'rename-file',
          ].includes(modal) && (
            <form className='form' onSubmit={submit}>
              {['project', 'member', 'profile', 'rename-file'].includes(modal) && (
                <label>
                  {modal === 'project'
                    ? 'Project name'
                    : modal === 'member'
                      ? 'Teammate name'
                      : modal === 'rename-file'
                        ? 'File name'
                        : 'Name'}
                  <input
                    required
                    maxLength={modal === 'rename-file' ? 200 : 100}
                    value={draft.name || ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder={
                      modal === 'project'
                        ? 'e.g. Marketing research project'
                        : modal === 'member'
                          ? 'e.g. Alex'
                          : modal === 'rename-file'
                            ? 'e.g. Assignment brief.pdf'
                            : 'Your name'
                    }
                  />
                </label>
              )}
              {modal === 'profile' && (
                <>
                  <div className='profile-photo-row'>
                    <PersonAvatar
                      className='avatar avatar-lg'
                      name={draft.name || user?.name || 'You'}
                      avatarUrl={draft.avatarUrl || user?.avatarUrl}
                    />
                    <div className='profile-photo-actions'>
                      <input
                        ref={avatarInputRef}
                        type='file'
                        accept='image/jpeg,image/png,image/webp,image/gif'
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) beginPhotoCrop(file, 'avatar');
                        }}
                      />
                      <button
                        type='button'
                        className='btn'
                        disabled={avatarBusy}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {avatarBusy ? 'Updating…' : draft.avatarUrl || user?.avatarUrl ? 'Change photo' : 'Upload photo'}
                      </button>
                      {(draft.avatarUrl || user?.avatarUrl) && (
                        <button
                          type='button'
                          className='btn subtle'
                          disabled={avatarBusy}
                          onClick={() => void removeProfilePhoto()}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <p className='form-note'>
                    JPEG, PNG, WebP, or GIF. After you choose a photo, drag and zoom to frame it.
                  </p>
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
                  {draft.id ? (
                    <>
                      <div className='profile-photo-row'>
                        <span
                          className={
                            'project-settings-photo' + (draft.photoUrl ? '' : ' empty')
                          }
                        >
                          {draft.photoUrl ? (
                            <img src={draft.photoUrl} alt='' />
                          ) : (
                            <span>No photo</span>
                          )}
                        </span>
                        <div className='profile-photo-actions'>
                          <button
                            type='button'
                            className='btn'
                            disabled={avatarBusy}
                            onClick={() => projectPhotoInputRef.current?.click()}
                          >
                            {avatarBusy
                              ? 'Updating…'
                              : draft.photoUrl
                                ? 'Change photo'
                                : 'Upload photo'}
                          </button>
                          {draft.photoUrl ? (
                            <button
                              type='button'
                              className='btn subtle'
                              disabled={avatarBusy}
                              onClick={() => void removeProjectPhoto(draft.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className='form-note'>
                        Shared with everyone on this project. Drag and zoom after choosing a photo.
                      </p>
                    </>
                  ) : (
                    <>
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
                        PDF, DOCX, images, or text — up to 3 files, 5 MB each. If AI is connected,
                        we’ll suggest tasks after create for you to review. You can add a project
                        photo after creating it.
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
              {modal === 'milestone' && draft.id && (
                <>
                  <div className='profile-photo-row'>
                    <span
                      className={'project-settings-photo' + (draft.photoUrl ? '' : ' empty')}
                    >
                      {draft.photoUrl ? (
                        <img src={draft.photoUrl} alt='' />
                      ) : (
                        <span>No photo</span>
                      )}
                    </span>
                    <div className='profile-photo-actions'>
                      <button
                        type='button'
                        className='btn'
                        disabled={avatarBusy}
                        onClick={() => milestonePhotoInputRef.current?.click()}
                      >
                        {avatarBusy
                          ? 'Updating…'
                          : draft.photoUrl
                            ? 'Change photo'
                            : 'Upload photo'}
                      </button>
                      {draft.photoUrl ? (
                        <button
                          type='button'
                          className='btn subtle'
                          disabled={avatarBusy}
                          onClick={() => void removeMilestonePhoto(project.id, draft.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className='form-note'>
                    Shared with everyone on this project. Drag and zoom after choosing a photo.
                  </p>
                </>
              )}
              {modal === 'milestone' && !draft.id && (
                <p className='form-note'>You can add a milestone photo after you save it.</p>
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
                    This adds them to the roster. To let them join the project, search their email
                    or username and send an invite they can accept.
                  </p>
                </>
              )}
              {modal === 'reminders' && (
                <>
                  <div className='notice'>
                    Save when you want a reminder before a deadline. Deadlines stay visible in the
                    workspace, and you can still nudge teammates from the Team page.
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
                {busy
                  ? modal === 'member'
                    ? 'Sending…'
                    : 'Saving…'
                  : modal === 'project'
                    ? draft.id
                      ? 'Save project'
                      : 'Create project'
                    : modal === 'member'
                      ? 'Add teammate'
                      : 'Save changes'}
              </button>
              {modal === 'profile' && canConfigureAI && (
                <button type='button' className='btn' onClick={() => open('ai-settings')}>
                  {aiReady ? 'Update AI connection' : 'Connect AI'}
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
          {modal === 'teammate' && draft.id && (
            <div className='form teammate-detail'>
              <div className='teammate-detail-header'>
                <PersonAvatar name={draft.name || ''} avatarUrl={draft.avatarUrl} />
                <div>
                  <strong>{draft.name}</strong>
                  <small className='block'>{draft.email}</small>
                </div>
              </div>
              {draft.id !== user?.id && (
                <div className='nudge-compose'>
                  <label>
                    Optional message
                    <textarea
                      value={draft.nudgeMessage || ''}
                      maxLength={500}
                      rows={3}
                      placeholder={`Quick reminder for ${draft.name || 'your teammate'}…`}
                      onChange={(e) => setDraft({ ...draft, nudgeMessage: e.target.value })}
                    />
                  </label>
                  <div className='flex flex-wrap gap-2'>
                    <button
                      type='button'
                      className='btn'
                      disabled={busy}
                      onClick={() => nudgeTeammate(draft.id, draft.nudgeMessage || '')}
                    >
                      <Send size={14} /> Nudge
                    </button>
                    {isOwner && (
                      <button
                        type='button'
                        className='btn subtle'
                        disabled={busy}
                        onClick={() => open('remove', draft)}
                      >
                        Remove from project
                      </button>
                    )}
                  </div>
                  <p className='form-note'>Shows up in their TeamUP notifications.</p>
                </div>
              )}
              <h3 className='teammate-tasks-heading'>
                Assigned tasks (
                {project.tasks.filter((t) => t.assignee === draft.id).length})
              </h3>
              {project.tasks.filter((t) => t.assignee === draft.id).length === 0 ? (
                <p className='form-note'>No tasks assigned to {draft.name} yet.</p>
              ) : (
                <div className='teammate-task-list'>
                  {project.tasks
                    .filter((t) => t.assignee === draft.id)
                    .map((t) => (
                      <div className='teammate-task-row' key={t.id}>
                        <div className='teammate-task-main'>
                          <strong>{t.title}</strong>
                          <small>
                            Due{' '}
                            {new Date(t.due + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            ·{' '}
                            {t.status === 'done'
                              ? 'Completed'
                              : t.status === 'progress'
                                ? 'In progress'
                                : 'To do'}
                          </small>
                        </div>
                        <label className='teammate-reassign'>
                          <span className='sr-only'>Move {t.title}</span>
                          <Picker
                            value={t.assignee || 'none'}
                            onChange={async (v) => {
                              const nextAssignee = v === 'none' ? '' : v;
                              if (nextAssignee === t.assignee) return;
                              const ok = await save({
                                ...project,
                                tasks: project.tasks.map((x) =>
                                  x.id === t.id ? { ...x, assignee: nextAssignee } : x,
                                ),
                              });
                              if (ok) {
                                const name =
                                  nextAssignee === ''
                                    ? 'Unassigned'
                                    : project.members.find((m) => m.id === nextAssignee)?.name ||
                                      'teammate';
                                toast.success(`Moved “${t.title}” to ${name}.`);
                              }
                            }}
                            options={[
                              { value: 'none', label: 'Unassigned' },
                              ...project.members.map((m) => ({ value: m.id, label: m.name })),
                            ]}
                          />
                        </label>
                        <button
                          type='button'
                          className='btn subtle'
                          disabled={busy}
                          onClick={() => open('task', t)}
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <button type='button' className='btn' onClick={() => setModal('')}>
                Close
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
                  AI planning isn’t available right now. You can still add tasks manually.
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
      <input
        ref={projectPhotoInputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp,image/gif'
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const projectId =
            modal === 'project' && draft.id ? draft.id : project.id;
          if (file && projectId) beginPhotoCrop(file, 'project', { projectId });
        }}
      />
      <input
        ref={milestonePhotoInputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp,image/gif'
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && project.id && draft.id && modal === 'milestone')
            beginPhotoCrop(file, 'milestone', {
              projectId: project.id,
              milestoneId: draft.id,
            });
        }}
      />
      <AvatarCropDialog
        open={!!photoCrop}
        imageUrl={photoCrop?.url || ''}
        busy={avatarBusy}
        onCancel={closePhotoCrop}
        onConfirm={async (file) => {
          if (!photoCrop) return;
          if (photoCrop.kind === 'avatar') await uploadProfilePhoto(file);
          else if (photoCrop.kind === 'project' && photoCrop.projectId)
            await uploadProjectPhoto(file, photoCrop.projectId);
          else if (
            photoCrop.kind === 'milestone' &&
            photoCrop.projectId &&
            photoCrop.milestoneId
          )
            await uploadMilestonePhoto(file, photoCrop.projectId, photoCrop.milestoneId);
          closePhotoCrop();
        }}
      />
      <Toaster position='top-center' richColors closeButton />
    </SidebarProvider>
  );
}
