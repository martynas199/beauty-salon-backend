import dayjs from "dayjs"; import utc from "dayjs/plugin/utc.js"; import tz from "dayjs/plugin/timezone.js"; dayjs.extend(utc); dayjs.extend(tz);
export function hhmmToMinutes(hhmm){ const [h,m] = hhmm.split(":").map(Number); return h*60 + m; }
function minutesToISO(baseDate, minutes, zone){ const d = dayjs.tz(baseDate, zone).startOf("day").add(minutes, "minute"); return d.toDate(); }
function overlaps(a,b){ return a.start < b.end && b.start < a.end; }
export function computeSlots({ beautician, variant, date, appointments, salonTz="Europe/London", stepMin=15 }){
  const dayName = ["sun","mon","tue","wed","thu","fri","sat"][dayjs(date).day()];
  const hours = beautician.workingHours?.[dayName]; if(!hours || !hours.start || !hours.end) return [];
  const duration = (variant.durationMin||0) + (variant.bufferBeforeMin||0) + (variant.bufferAfterMin||0);
  const startMin = hhmmToMinutes(hours.start), endMin = hhmmToMinutes(hours.end);
  const breakWindows = (hours.breaks||[]).map(b=>({ start: hhmmToMinutes(b.start), end: hhmmToMinutes(b.end) }));
  const taken = (appointments||[]).map(a=>({ start: +new Date(a.start), end: +new Date(a.end) }));
  const out = [];
  for(let m = startMin; m + duration <= endMin; m += stepMin){
    const slotStart = minutesToISO(date, m, salonTz), slotEnd = minutesToISO(date, m+duration, salonTz);
    const slotWin = { start:+slotStart, end:+slotEnd };
    if(breakWindows.some(bw => m < bw.end && (m+duration) > bw.start)) continue;
    if((beautician.timeOff||[]).some(off => slotStart < new Date(off.end) && new Date(off.start) < slotEnd)) continue;
    if(taken.some(t => overlaps(slotWin, t))) continue;
    out.push({ startISO: slotStart.toISOString(), endISO: slotEnd.toISOString() });
  }
  return out;
}
