/** Shared helpers for the Availability week grid and Google free/busy sync. */

export const AVAILABILITY_HOUR_MIN = 7;
export const AVAILABILITY_HOUR_MAX = 22;
/** Default visible band: 9am–6pm (hour blocks 9…17). */
export const AVAILABILITY_DEFAULT_START = 9;
export const AVAILABILITY_DEFAULT_END = 17;
/** A full week of hour blocks, plus room for hours already saved. */
export const AVAILABILITY_SLOT_LIMIT = 7 * 24;

/** Reject duplicate, unparseable, or newly chosen past slots. */
export function availabilitySlotsError(slots: unknown, previous: string[] = []) {
  if (!Array.isArray(slots) || slots.length > AVAILABILITY_SLOT_LIMIT) {
    return 'Choose future availability times.';
  }
  if (new Set(slots).size !== slots.length) return 'Choose future availability times.';
  const known = new Set(previous);
  for (const slot of slots) {
    if (typeof slot !== 'string' || !Number.isFinite(Date.parse(slot))) {
      return 'Choose future availability times.';
    }
    if (!known.has(slot) && Date.parse(slot) < Date.now()) {
      return 'Choose future availability times.';
    }
  }
  return null;
}

/** 0 = no team overlap. 1–4 = more teammates free in that hour. */
export function availabilityHeat(count: number) {
  if (count <= 1) return 0;
  if (count === 2) return 1;
  if (count === 3) return 2;
  if (count === 4) return 3;
  return 4;
}

/** First colors given to people on a project. Later members get further distinct hues. */
export const AVAILABILITY_MEMBER_COLORS = [
  '#0f766e',
  '#c2410c',
  '#be185d',
  '#1d4ed8',
  '#15803d',
  '#a16207',
  '#0e7490',
  '#7c3aed',
];

export function canonicalMemberColor(value: unknown) {
  if (typeof value !== 'string') return '';
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : '';
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const match = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) [red, green, blue] = [chroma, x, 0];
  else if (section < 2) [red, green, blue] = [x, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, x];
  else if (section < 4) [red, green, blue] = [0, x, chroma];
  else if (section < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** A distinct color for member index. Indexes past the palette do not reuse earlier colors. */
export function availabilityMemberColor(index: number) {
  if (index < AVAILABILITY_MEMBER_COLORS.length) return AVAILABILITY_MEMBER_COLORS[index];
  return hslToHex((index * 47) % 360, 62, 34);
}

export function nextMemberColor(used: Iterable<string | null | undefined>) {
  const taken = new Set([...used].map((color) => canonicalMemberColor(color)).filter(Boolean));
  for (let index = 0; index < 64; index++) {
    const color = availabilityMemberColor(index);
    if (!taken.has(color)) return color;
  }
  return '#334155';
}

/** Keep saved colors and fill gaps so each person on the project has a different one. */
export function assignMemberColors<T extends { id: string; color?: string | null }>(members: T[]) {
  const used = new Set<string>();
  return members.map((member) => {
    const current = canonicalMemberColor(member.color);
    if (current && !used.has(current)) {
      used.add(current);
      return current === member.color ? member : { ...member, color: current };
    }
    const color = nextMemberColor(used);
    used.add(color);
    return { ...member, color };
  });
}

/** One teammate fills the hour. Several teammates split it so each color stays visible. */
export function teammateSlotBackground(colors: string[], solid = false) {
  if (colors.length === 0) return undefined;
  const paint = (color: string) => (solid ? color : `color-mix(in srgb, ${color} 36%, #fff)`);
  if (colors.length === 1) return paint(colors[0]);
  const slice = 100 / colors.length;
  const stops = colors.map((color, index) => {
    const start = (index * slice).toFixed(2);
    const end = ((index + 1) * slice).toFixed(2);
    return `${paint(color)} ${start}% ${end}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export type BusyInterval = { start: number; end: number };

export function slotKeyFor(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString();
}

export function hourLabel(hour: number) {
  const h = hour % 12 || 12;
  return `${h} ${hour >= 12 ? 'pm' : 'am'}`;
}

export function formatHourRange(startHour: number, endHourExclusive: number) {
  const startPeriod = startHour >= 12 ? 'PM' : 'AM';
  const endHour = endHourExclusive;
  const endPeriod = endHour >= 12 ? 'PM' : 'AM';
  const startNum = startHour % 12 || 12;
  const endNum = endHour % 12 || 12;
  return startPeriod === endPeriod
    ? `${startNum}–${endNum} ${startPeriod}`
    : `${startNum} ${startPeriod}–${endNum} ${endPeriod}`;
}

/** Classify each future hour slot in the displayed week as busy or free. */
export function classifyGoogleSlots(opts: {
  dates: string[];
  busyIntervals: BusyInterval[];
  now?: Date;
  hourMin?: number;
  hourMax?: number;
}) {
  const now = opts.now || new Date();
  const hourMin = opts.hourMin ?? AVAILABILITY_HOUR_MIN;
  const hourMax = opts.hourMax ?? AVAILABILITY_HOUR_MAX;
  const busyKeys: string[] = [];
  const freeKeys: string[] = [];
  const visibleKeys: string[] = [];

  for (const date of opts.dates) {
    for (let hour = hourMin; hour <= hourMax; hour++) {
      const localStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
      const localEnd = new Date(`${date}T${String(hour + 1).padStart(2, '0')}:00:00`);
      const key = localStart.toISOString();
      visibleKeys.push(key);
      if (localStart < now) continue;
      const slotIsBusy = opts.busyIntervals.some(
        (interval) => interval.start < localEnd.getTime() && interval.end > localStart.getTime(),
      );
      if (slotIsBusy) busyKeys.push(key);
      else freeKeys.push(key);
    }
  }

  return { busyKeys, freeKeys, visibleKeys };
}

/** Remove busy slots from the user's selected availability for the visible week. */
export function applyBlockBusyHours(opts: {
  existing: string[];
  visibleKeys: Set<string>;
  busyKeys: Set<string>;
}) {
  return opts.existing.filter(
    (slot) => !opts.visibleKeys.has(slot) || !opts.busyKeys.has(slot),
  );
}

/** Replace visible-week selections with suggested free hours; keep outside-week slots. */
export function applySuggestOpenHours(opts: {
  existing: string[];
  visibleKeys: Set<string>;
  freeKeys: string[];
}) {
  return [
    ...opts.existing.filter((slot) => !opts.visibleKeys.has(slot)),
    ...opts.freeKeys,
  ];
}

export type BestTimeRange = {
  date: string;
  startHour: number;
  endHour: number;
  label: string;
};

export type TeamTimeRange = BestTimeRange & {
  people: number;
  total: number;
};

/** Longest blocks where the most teammates are free. */
export function bestTeamRanges(opts: {
  dates: string[];
  countAt: (slotKey: string) => number;
  total: number;
  minPeople?: number;
  limit?: number;
  hourMin?: number;
  hourMax?: number;
  now?: Date;
}) {
  const hourMin = opts.hourMin ?? AVAILABILITY_HOUR_MIN;
  const hourMax = opts.hourMax ?? AVAILABILITY_HOUR_MAX;
  const minPeople = opts.minPeople ?? 2;
  const now = opts.now || new Date();
  const ranges: TeamTimeRange[] = [];
  if (opts.total < minPeople) return ranges;

  for (const date of opts.dates) {
    let hour = hourMin;
    while (hour <= hourMax) {
      const key = slotKeyFor(date, hour);
      const count = new Date(key) < now ? 0 : opts.countAt(key);
      if (count < minPeople) {
        hour++;
        continue;
      }
      const startHour = hour;
      const people = count;
      hour++;
      while (hour <= hourMax) {
        const nextKey = slotKeyFor(date, hour);
        if (new Date(nextKey) < now || opts.countAt(nextKey) !== people) break;
        hour++;
      }
      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      ranges.push({
        date,
        startHour,
        endHour: hour,
        people,
        total: opts.total,
        label: `${dayLabel} · ${formatHourRange(startHour, hour)} · ${people} of ${opts.total} free`,
      });
    }
  }

  ranges.sort(
    (a, b) =>
      b.people - a.people ||
      b.endHour - b.startHour - (a.endHour - a.startHour) ||
      a.date.localeCompare(b.date) ||
      a.startHour - b.startHour,
  );
  return ranges.slice(0, opts.limit ?? 3);
}

/** Merge contiguous shared (overlap) hour slots into readable ranges. */
export function bestOverlapRanges(opts: {
  dates: string[];
  isCommon: (slotKey: string) => boolean;
  hourMin?: number;
  hourMax?: number;
}) {
  const hourMin = opts.hourMin ?? AVAILABILITY_HOUR_MIN;
  const hourMax = opts.hourMax ?? AVAILABILITY_HOUR_MAX;
  const ranges: BestTimeRange[] = [];

  for (const date of opts.dates) {
    let hour = hourMin;
    while (hour <= hourMax) {
      const key = slotKeyFor(date, hour);
      if (!opts.isCommon(key)) {
        hour++;
        continue;
      }
      const startHour = hour;
      while (hour <= hourMax && opts.isCommon(slotKeyFor(date, hour))) hour++;
      const endHour = hour;
      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      ranges.push({
        date,
        startHour,
        endHour,
        label: `${dayLabel} · ${formatHourRange(startHour, endHour)}`,
      });
    }
  }

  return ranges;
}

/** Count future slots outside the default 9am–6pm band. */
export function countSlotsOutsideDefaultBand(opts: {
  dates: string[];
  include: (slotKey: string) => boolean;
  now?: Date;
}) {
  const now = opts.now || new Date();
  let before = 0;
  let after = 0;
  for (const date of opts.dates) {
    for (let hour = AVAILABILITY_HOUR_MIN; hour <= AVAILABILITY_HOUR_MAX; hour++) {
      if (hour >= AVAILABILITY_DEFAULT_START && hour <= AVAILABILITY_DEFAULT_END) continue;
      const key = slotKeyFor(date, hour);
      if (new Date(key) < now) continue;
      if (!opts.include(key)) continue;
      if (hour < AVAILABILITY_DEFAULT_START) before += 1;
      else after += 1;
    }
  }
  return { before, after, total: before + after };
}

/** Contiguous selected ranges for a single day (for day-header summaries). */
export function dayAvailabilitySummaries(opts: {
  date: string;
  selected: Set<string>;
  now?: Date;
  hourMin?: number;
  hourMax?: number;
}) {
  const now = opts.now || new Date();
  const hourMin = opts.hourMin ?? AVAILABILITY_HOUR_MIN;
  const hourMax = opts.hourMax ?? AVAILABILITY_HOUR_MAX;
  const labels: string[] = [];
  let hour = hourMin;
  while (hour <= hourMax) {
    const key = slotKeyFor(opts.date, hour);
    if (!opts.selected.has(key) || new Date(key) < now) {
      hour++;
      continue;
    }
    const startHour = hour;
    while (
      hour <= hourMax &&
      opts.selected.has(slotKeyFor(opts.date, hour)) &&
      new Date(slotKeyFor(opts.date, hour)) >= now
    ) {
      hour++;
    }
    labels.push(formatHourRange(startHour, hour));
  }
  return labels;
}
