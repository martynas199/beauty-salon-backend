/**
 * Assumptions
 * - Timezone-aware scheduling using dayjs.tz; all ISO outputs are real instants.
 * - Inputs are immutable; functions perform no I/O and no mutation.
 * - Step alignment is to salon-local minutes from 00:00 (e.g., :00, :15, :30, :45 for stepMin=15).
 * - Appointments that end exactly at slot start do NOT block (end-exclusive), but any strict overlap blocks.
 * - Breaks and time-off block if any part of the slot (including buffers) intersects their window.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

// -------------------------- Schemas --------------------------

const HHMM = z.string().regex(/^\d{2}:\d{2}$/u, "Expected HH:mm string");

const BreakSchema = z.object({ start: HHMM, end: HHMM });

const WorkingDaySchema = z.object({
  start: HHMM.optional(),
  end: HHMM.optional(),
  breaks: z.array(BreakSchema).optional().default([]),
});

const WorkingHoursSchema = z.object({
  mon: WorkingDaySchema.optional(),
  tue: WorkingDaySchema.optional(),
  wed: WorkingDaySchema.optional(),
  thu: WorkingDaySchema.optional(),
  fri: WorkingDaySchema.optional(),
  sat: WorkingDaySchema.optional(),
  sun: WorkingDaySchema.optional(),
});

// New array-based working hours format
const WorkingHoursArraySchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6), // 0=Sunday, 6=Saturday
    start: HHMM,
    end: HHMM,
  })
);

const TimeOffSchema = z.object({ start: z.string(), end: z.string() });

const BeauticianSchema = z.object({
  _id: z.any(),
  active: z.boolean().optional().default(true),
  workingHours: z.union([WorkingHoursSchema, WorkingHoursArraySchema]), // Accept both formats
  timeOff: z.array(TimeOffSchema).optional().default([]),
});

const ServiceSchema = z.object({
  durationMin: z.number().int().nonnegative(),
  bufferBeforeMin: z.number().int().nonnegative().optional().default(0),
  bufferAfterMin: z.number().int().nonnegative().optional().default(0),
});

const AppointmentSchema = z.object({
  start: z.string(),
  end: z.string(),
  status: z
    .enum([
      "reserved_unpaid",
      "confirmed",
      "cancelled_no_refund",
      "cancelled_partial_refund",
      "cancelled_full_refund",
      "no_show",
    ])
    .optional(),
});

const CommonParamsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be YYYY-MM-DD"),
  salonTz: z.string().default("Europe/London"),
  stepMin: z.number().int().positive().default(15),
  service: ServiceSchema,
});

const ForBeauticianParamsSchema = CommonParamsSchema.and(
  z.object({
    beautician: BeauticianSchema,
    appointments: z.array(AppointmentSchema).default([]),
    extraBlackouts: z
      .array(z.object({ startISO: z.string(), endISO: z.string() }))
      .optional()
      .default([]),
    dayStartOverride: HHMM.optional(),
    dayEndOverride: HHMM.optional(),
  })
);

const AnyStaffParamsSchema = CommonParamsSchema.and(
  z.object({
    beauticians: z.array(BeauticianSchema),
    appointmentsByBeautician: z.record(z.array(AppointmentSchema)).default({}),
    extraBlackoutsByBeautician: z
      .record(z.array(z.object({ startISO: z.string(), endISO: z.string() })))
      .optional()
      .default({}),
  })
);

const NextParamsSchema = CommonParamsSchema.and(
  z
    .object({
      horizonDays: z.number().int().positive().max(90).default(30),
      // Either single beautician or any-staff mode
      beautician: BeauticianSchema.optional(),
      appointments: z.array(AppointmentSchema).optional(),
      beauticians: z.array(BeauticianSchema).optional(),
      appointmentsByBeautician: z.record(z.array(AppointmentSchema)).optional(),
      extraBlackouts: z
        .array(z.object({ startISO: z.string(), endISO: z.string() }))
        .optional(),
      extraBlackoutsByBeautician: z
        .record(z.array(z.object({ startISO: z.string(), endISO: z.string() })))
        .optional(),
    })
    .refine(
      (v) =>
        (v.beautician && v.appointments) ||
        (Array.isArray(v.beauticians) && v.appointmentsByBeautician),
      {
        message:
          "Provide either { beautician, appointments } or { beauticians, appointmentsByBeautician }",
      }
    )
);

// -------------------------- Helpers --------------------------

/**
 * @param {string} hhmm
 * @returns {number} minutes from 00:00
 */
export function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert salon-local day minutes to a real Date in tz.
 * @param {string} date YYYY-MM-DD (salon local)
 * @param {number} minutes minutes since 00:00 local
 * @param {string} tz timezone id
 * @returns {Date}
 */
export function dayMinutesToZonedDate(date, minutes, tz) {
  return dayjs.tz(date, tz).startOf("day").add(minutes, "minute").toDate();
}

/**
 * @typedef {{ start: number, end: number }} NumInterval // epoch ms
 * @typedef {{ start: Date, end: Date }} DateInterval
 */

/**
 * @param {NumInterval|DateInterval} a
 * @param {NumInterval|DateInterval} b
 * @returns {boolean} true if [a.start,a.end) intersects [b.start,b.end)
 */
export function intervalsOverlap(a, b) {
  const as = +("getTime" in a.start ? a.start.getTime() : a.start);
  const ae = +("getTime" in a.end ? a.end.getTime() : a.end);
  const bs = +("getTime" in b.start ? b.start.getTime() : b.start);
  const be = +("getTime" in b.end ? b.end.getTime() : b.end);
  return as < be && bs < ae;
}

/**
 * Clamp an interval to the local day [00:00,24:00) in tz, returning null if no intersection.
 * @param {DateInterval} interval
 * @param {string} date YYYY-MM-DD
 * @param {string} tz
 * @returns {DateInterval|null}
 */
export function clampToDay(interval, date, tz) {
  const dayStart = dayjs.tz(date, tz).startOf("day").toDate();
  const dayEnd = dayjs.tz(date, tz).endOf("day").add(1, "millisecond").toDate(); // practically 24:00
  const start = new Date(
    Math.max(interval.start.getTime(), dayStart.getTime())
  );
  const end = new Date(Math.min(interval.end.getTime(), dayEnd.getTime()));
  if (start >= end) return null;
  return { start, end };
}

/**
 * Build working windows after applying optional overrides and excluding missing days.
 * Returned as minute offsets from day start.
 * @param {any} workingHours
 * @param {string} date YYYY-MM-DD
 * @param {{ dayStartOverride?: string, dayEndOverride?: string }} overrides
 * @returns {{ startMin:number, endMin:number, breaks:{startMin:number,endMin:number}[] } | null}
 */
export function buildWorkingWindows(workingHours, date, overrides = {}) {
  const dayOfWeek = dayjs(date).day(); // 0=Sunday, 6=Saturday
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayOfWeek];

  let day = null;

  // Handle new array format: [{dayOfWeek: 1, start: "09:00", end: "17:00"}, ...]
  if (Array.isArray(workingHours)) {
    const dayEntry = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);
    if (dayEntry && dayEntry.start && dayEntry.end) {
      day = { start: dayEntry.start, end: dayEntry.end, breaks: [] };
    }
  }
  // Handle legacy object format: {mon: {start, end, breaks}, tue: ...}
  else if (workingHours && typeof workingHours === "object") {
    day = workingHours[weekday];
  }

  if (!day || !day.start || !day.end) return null;

  const startMin = hhmmToMinutes(overrides.dayStartOverride || day.start);
  const endMin = hhmmToMinutes(overrides.dayEndOverride || day.end);
  if (!(startMin < endMin)) return null;
  const breaks = (day.breaks || []).map((b) => ({
    startMin: hhmmToMinutes(b.start),
    endMin: hhmmToMinutes(b.end),
  }));
  return { startMin, endMin, breaks };
}

/**
 * Merge overlapping or touching intervals (Date-based) into a sorted, non-overlapping list.
 * @param {DateInterval[]} intervals
 * @returns {DateInterval[]}
 */
export function mergeOverlaps(intervals) {
  const arr = intervals
    .map((iv) => ({ start: new Date(iv.start), end: new Date(iv.end) }))
    .filter((iv) => iv.start < iv.end)
    .sort((a, b) => +a.start - +b.start);
  const out = [];
  for (const iv of arr) {
    const last = out[out.length - 1];
    if (!last || +iv.start > +last.end) out.push(iv);
    else if (+iv.end > +last.end) last.end = iv.end;
  }
  return out;
}

// -------------------------- Core computations --------------------------

function totalBlockMin(service) {
  return (
    service.durationMin +
    (service.bufferBeforeMin || 0) +
    (service.bufferAfterMin || 0)
  );
}

function roundUpToStep(minute, step) {
  const r = minute % step;
  return r === 0 ? minute : minute + (step - r);
}

function toDateInterval(date, tz, startMin, endMin) {
  return {
    start: dayMinutesToZonedDate(date, startMin, tz),
    end: dayMinutesToZonedDate(date, endMin, tz),
  };
}

function buildBlockingIntervals({
  date,
  tz,
  appointments,
  timeOff,
  extraBlackouts,
}) {
  const blocks = [];
  for (const a of appointments || []) {
    if (a.status === "cancelled") continue;
    blocks.push({ start: new Date(a.start), end: new Date(a.end) });
  }
  for (const off of timeOff || []) {
    blocks.push({ start: new Date(off.start), end: new Date(off.end) });
  }
  for (const bl of extraBlackouts || []) {
    blocks.push({ start: new Date(bl.startISO), end: new Date(bl.endISO) });
  }
  // clamp to date
  const clamped = blocks.map((iv) => clampToDay(iv, date, tz)).filter(Boolean);
  return mergeOverlaps(clamped);
}

/**
 * Compute slots for a specific beautician.
 * @param {object} params
 * @returns {{ startISO:string, endISO:string, beauticianId?:string }[]}
 */
export function computeSlotsForBeautician(params) {
  const p = ForBeauticianParamsSchema.parse(params);
  const {
    date,
    salonTz: tz,
    stepMin,
    service,
    beautician,
    appointments,
    extraBlackouts,
    dayStartOverride,
    dayEndOverride,
  } = p;
  if (beautician.active === false) return [];

  const window = buildWorkingWindows(beautician.workingHours, date, {
    dayStartOverride,
    dayEndOverride,
  });
  if (!window) return [];

  const totalMin = totalBlockMin(service);
  const blocks = buildBlockingIntervals({
    date,
    tz,
    appointments,
    timeOff: beautician.timeOff || [],
    extraBlackouts,
  });

  const out = [];
  let startMin = roundUpToStep(window.startMin, stepMin);
  const latestStart = window.endMin - totalMin;

  // Get current time in the salon timezone to filter past slots
  const now = dayjs().tz(tz);
  const isToday = now.format("YYYY-MM-DD") === date;

  for (let m = startMin; m <= latestStart; m += stepMin) {
    // Skip if slot overlaps any break
    const overlapsBreak = (window.breaks || []).some(
      (br) => m < br.endMin && m + totalMin > br.startMin
    );
    if (overlapsBreak) continue;

    const slotIv = toDateInterval(date, tz, m, m + totalMin);

    // Skip past slots for today
    if (isToday && slotIv.start <= now.toDate()) continue;

    // Check against blocking intervals (appointments + time off + extra)
    if (blocks.some((b) => intervalsOverlap(slotIv, b))) continue;

    out.push({
      startISO: slotIv.start.toISOString(),
      endISO: slotIv.end.toISOString(),
      beauticianId: beautician._id ? String(beautician._id) : undefined,
    });
  }
  return out;
}

/**
 * Compute slots for "any staff". Dedupe start times across beauticians.
 * Adds an extension field beauticianIds (array) to indicate which beauticians are available for that time.
 * @param {object} params
 * @returns {{ startISO:string, endISO:string, beauticianId?:string, beauticianIds?:string[] }[]}
 */
export function computeSlotsAnyStaff(params) {
  const p = AnyStaffParamsSchema.parse(params);
  const {
    date,
    salonTz: tz,
    stepMin,
    service,
    beauticians,
    appointmentsByBeautician,
    extraBlackoutsByBeautician,
  } = p;

  const map = new Map(); // startISO -> { endISO, beauticianIds:Set }
  for (const b of beauticians) {
    if (b.active === false) continue;
    const slots = computeSlotsForBeautician({
      date,
      salonTz: tz,
      stepMin,
      service,
      beautician: b,
      appointments: appointmentsByBeautician[String(b._id)] || [],
      extraBlackouts: (extraBlackoutsByBeautician || {})[String(b._id)] || [],
    });
    for (const s of slots) {
      const key = s.startISO;
      if (!map.has(key))
        map.set(key, { endISO: s.endISO, beauticianIds: new Set() });
      map.get(key).beauticianIds.add(String(b._id));
    }
  }

  const out = Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([startISO, v]) => ({
      startISO,
      endISO: v.endISO,
      beauticianIds: Array.from(v.beauticianIds),
    }));
  return out;
}

/**
 * Find the earliest next available slot within the horizon.
 * Accepts either single-beautician or any-staff params (union), same rules as compute functions.
 * @param {object} params
 * @returns {{ startISO:string, endISO:string, beauticianId?:string, beauticianIds?:string[] } | null}
 */
export function nextAvailableSlot(params) {
  const p = NextParamsSchema.parse(params);
  const { date, salonTz: tz, stepMin, service, horizonDays } = p;
  let cur = dayjs.tz(date, tz);

  for (let i = 0; i < horizonDays; i++) {
    const dStr = cur.format("YYYY-MM-DD");
    if (p.beautician) {
      const slots = computeSlotsForBeautician({
        date: dStr,
        salonTz: tz,
        stepMin,
        service,
        beautician: p.beautician,
        appointments: p.appointments || [],
        extraBlackouts: p.extraBlackouts || [],
      });
      if (slots.length) return slots[0];
    } else if (p.beauticians) {
      const slots = computeSlotsAnyStaff({
        date: dStr,
        salonTz: tz,
        stepMin,
        service,
        beauticians: p.beauticians,
        appointmentsByBeautician: p.appointmentsByBeautician || {},
        extraBlackoutsByBeautician: p.extraBlackoutsByBeautician || {},
      });
      if (slots.length) return slots[0];
    }
    cur = cur.add(1, "day");
  }
  return null;
}

// -------------------------- Usage examples --------------------------

/**
Example (single beautician):

import { computeSlotsForBeautician } from "./slotPlanner.js";

const slots = computeSlotsForBeautician({
  date: "2025-03-30",
  salonTz: "Europe/London",
  stepMin: 15,
  service: { durationMin: 60, bufferBeforeMin: 5, bufferAfterMin: 10 },
  beautician: {
    _id: "b1",
    active: true,
    workingHours: { sun: { start: "10:00", end: "18:00", breaks:[{ start:"13:00", end:"13:30" }] } },
    timeOff: [ { start: "2025-03-30T14:00:00.000Z", end: "2025-03-30T15:00:00.000Z" } ],
  },
  appointments: [ { start: "2025-03-30T10:30:00.000Z", end: "2025-03-30T11:30:00.000Z", status: "confirmed" } ],
});

Example (any staff):

import { computeSlotsAnyStaff } from "./slotPlanner.js";

const anySlots = computeSlotsAnyStaff({
  date: "2025-03-30",
  salonTz: "Europe/London",
  stepMin: 15,
  service: { durationMin: 45 },
  beauticians: [b1, b2, b3],
  appointmentsByBeautician: {
    [b1._id]: b1Appts,
    [b2._id]: b2Appts,
  },
});
*/

export default {
  computeSlotsForBeautician,
  computeSlotsAnyStaff,
  nextAvailableSlot,
  mergeOverlaps,
  hhmmToMinutes,
  dayMinutesToZonedDate,
  intervalsOverlap,
  clampToDay,
  buildWorkingWindows,
};
