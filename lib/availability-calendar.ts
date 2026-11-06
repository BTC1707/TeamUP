/** Shared helpers for the Availability week grid and Google free/busy sync. */

export const AVAILABILITY_HOUR_MIN = 7;
export const AVAILABILITY_HOUR_MAX = 22;
/** Default visible band: 9am–6pm (hour blocks 9…17). */
export const AVAILABILITY_DEFAULT_START = 9;
export const AVAILABILITY_DEFAULT_END = 17;

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
