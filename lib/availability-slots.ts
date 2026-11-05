import { future } from '@/lib/model';

export const AVAILABILITY_START_HOUR = 7;
export const AVAILABILITY_END_HOUR = 22; // last selectable start hour (10pm)
export const AVAILABILITY_DAY_COUNT = 7;

export type AvailabilityRange = {
  date?: string;
  weekday?: string;
  startHour: number;
  endHour: number;
};

export type AvailabilityProposal = {
  type: 'availability';
  id: string;
  summary: string;
  slots: string[];
  labels: string[];
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
}

/** Convert a wall-clock date+hour in `timeZone` to a UTC ISO string (matches browser Date local → toISOString). */
export function zonedHourToIso(dateYmd: string, hour: number, timeZone: string) {
  const [y, m, d] = dateYmd.split('-').map(Number);
  let utcMillis = Date.UTC(y, m - 1, d, hour, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(utcMillis), timeZone);
    const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = asIfUtc - utcMillis;
    utcMillis = Date.UTC(y, m - 1, d, hour, 0, 0) - offset;
  }
  return new Date(utcMillis).toISOString();
}

export function localDateYmd(daysFromToday: number, timeZone: string) {
  // Approximate "today" in timezone, then add days on the calendar.
  const nowParts = zonedParts(new Date(), timeZone);
  const base = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + daysFromToday));
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

export function windowDates(timeZone: string) {
  return Array.from({ length: AVAILABILITY_DAY_COUNT }, (_, i) => localDateYmd(i, timeZone));
}

/** All valid ISO slots for the current 7-day × 7am–10pm grid in a timezone. */
export function gridSlots(timeZone: string) {
  const out: string[] = [];
  for (const date of windowDates(timeZone)) {
    for (let hour = AVAILABILITY_START_HOUR; hour <= AVAILABILITY_END_HOUR; hour++) {
      out.push(zonedHourToIso(date, hour, timeZone));
    }
  }
  return out;
}

export function resolveWeekdayDate(weekday: string, timeZone: string) {
  const target = WEEKDAYS[weekday.trim().toLowerCase()];
  if (target === undefined) return null;
  for (let i = 0; i < AVAILABILITY_DAY_COUNT; i++) {
    const ymd = localDateYmd(i, timeZone);
    const probe = zonedHourToIso(ymd, 12, timeZone);
    const parts = zonedParts(new Date(probe), timeZone);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    if (map[parts.weekday] === target) return ymd;
  }
  return null;
}

export function normalizeHour(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const hour = Math.floor(n);
  if (hour < 0 || hour > 24) return null;
  return hour;
}

/**
 * Expand a range into hour-start slots. `endHour` is exclusive (10→14 = 10,11,12,13).
 * Returns { slots, error } when the range can't be represented on the grid.
 */
export function rangeToSlots(range: AvailabilityRange, timeZone: string) {
  const startHour = normalizeHour(range.startHour);
  const endHour = normalizeHour(range.endHour);
  if (startHour === null || endHour === null) {
    return { slots: [] as string[], error: 'Could not understand that time range.' };
  }
  if (endHour <= startHour) {
    return {
      slots: [] as string[],
      error:
        'Overnight or inverted ranges aren’t supported yet. Availability covers 7am–10pm each day.',
    };
  }
  if (startHour < AVAILABILITY_START_HOUR || endHour - 1 > AVAILABILITY_END_HOUR) {
    return {
      slots: [] as string[],
      error: `Availability only covers ${formatClock(AVAILABILITY_START_HOUR)}–${formatClock(AVAILABILITY_END_HOUR + 1)} in one-hour slots.`,
    };
  }

  let date = typeof range.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(range.date) ? range.date : null;
  if (!date && range.weekday) date = resolveWeekdayDate(range.weekday, timeZone);
  if (!date) {
    return {
      slots: [] as string[],
      error: 'Say which day you’re free (for example, Tuesday or 2026-11-05).',
    };
  }
  const allowed = new Set(windowDates(timeZone));
  if (!allowed.has(date)) {
    return {
      slots: [] as string[],
      error: 'Availability can only be set for the next 7 days.',
    };
  }

  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    if (hour < AVAILABILITY_START_HOUR || hour > AVAILABILITY_END_HOUR) continue;
    const iso = zonedHourToIso(date, hour, timeZone);
    if (Date.parse(iso) < Date.now()) continue;
    slots.push(iso);
  }
  if (!slots.length) {
    return { slots, error: 'Those times are already in the past or outside the grid.' };
  }
  return { slots, error: null as string | null };
}

export function rangesToProposal(
  ranges: AvailabilityRange[],
  timeZone: string,
  summary: string,
): { proposal: AvailabilityProposal | null; error: string | null } {
  const slotSet = new Set<string>();
  const errors: string[] = [];
  for (const range of ranges) {
    const { slots, error } = rangeToSlots(range, timeZone);
    if (error) errors.push(error);
    for (const slot of slots) slotSet.add(slot);
  }
  const slots = [...slotSet].sort();
  if (!slots.length) {
    return {
      proposal: null,
      error: errors[0] || 'I couldn’t map that to availability slots on the next-7-days grid.',
    };
  }
  const labels = slots.map((slot) => formatSlotLabel(slot, timeZone));
  return {
    proposal: {
      type: 'availability',
      id: crypto.randomUUID(),
      summary: summary.trim() || 'Update your availability',
      slots,
      labels,
    },
    error: null,
  };
}

export function mergeSlots(existing: string[], incoming: string[]) {
  return [...new Set([...(existing || []), ...incoming])].sort();
}

export function isValidGridSlot(slot: string, timeZone: string) {
  if (!Number.isFinite(Date.parse(slot))) return false;
  if (Date.parse(slot) < Date.now()) return false;
  return gridSlots(timeZone).includes(slot);
}

export function validateProposalSlots(slots: unknown, timeZone: string) {
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > 100) return null;
  if (new Set(slots).size !== slots.length) return null;
  if (slots.some((s) => typeof s !== 'string' || !isValidGridSlot(s, timeZone))) return null;
  return slots as string[];
}

export function formatClock(hour24: number) {
  const hour = ((hour24 % 24) + 24) % 24;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

export function formatSlotLabel(iso: string, timeZone: string) {
  const start = new Date(iso);
  const end = new Date(Date.parse(iso) + 3600000);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);
  const startLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(end);
  return `${day}, ${startLabel}–${endLabel}`;
}

/** Browser-compatible slot key used by the Availability grid (local Date parsing). */
export function browserStyleSlotKey(daysFromToday: number, hour: number) {
  return new Date(future(daysFromToday) + 'T' + pad(hour) + ':00').toISOString();
}
