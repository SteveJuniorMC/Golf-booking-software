/* ==========================================================================
   Pure tee-time helpers: dates, times, money, and the shape of a day.
   Extracted from the demo's data layer; no Firebase, no DOM, no globals —
   every function takes the course it needs as a parameter.
   ========================================================================== */

export function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** 'YYYY-MM-DD' for a Date, in the machine's own timezone. */
export function toKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function fromKey(key) {
  const p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** Today's 'YYYY-MM-DD' at the COURSE, not at the browser. */
export function todayKey(timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function isWeekend(key) {
  const day = fromKey(key).getDay();
  return day === 0 || day === 6;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

/** "Monday, August 17, 2026" */
export function formatLong(key) {
  const d = fromKey(key);
  return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/** "Mon" / "Aug 17" pieces for the date picker button. */
export function formatShort(key) {
  const d = fromKey(key);
  return {
    weekday: DAYS[d.getDay()].slice(0, 3),
    date: MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate()
  };
}

export function minutesOf(hhmm) {
  const p = hhmm.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

export function hhmmOf(minutes) {
  return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
}

/** "06:30" -> "6:30 AM" */
export function formatTime(hhmm) {
  const p = hhmm.split(':');
  const h = Number(p[0]);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + p[1] + ' ' + suffix;
}

/** Every tee time the course sells in a day, e.g. ["06:30","06:40",...]. */
export function slotTimes(course) {
  const out = [];
  const end = minutesOf(course.lastTee);
  for (let m = minutesOf(course.firstTee); m <= end; m += course.intervalMinutes) {
    out.push(hhmmOf(m));
  }
  return out;
}

/** Morning / midday / afternoon buckets. */
export function partOfDay(hhmm) {
  const m = minutesOf(hhmm);
  if (m < 11 * 60) return 'morning';
  if (m < 15 * 60) return 'midday';
  return 'afternoon';
}

/* ---------- Slot keys: tee letter + start time ---------- */

/** ('F'|'B', "09:40") -> "F09:40" */
export function slotKey(tee, time) { return tee + time; }

export function parseSlotKey(key) {
  return { tee: key.slice(0, 1), time: key.slice(1) };
}

/* ---------- Pricing: direct dollar rates, walk/ride built in ---------- */

export function isTwilight(course, time) {
  const tw = course.rates.twilight;
  return !!tw.enabled && minutesOf(time) >= minutesOf(tw.after);
}

/**
 * Green fee per player. After the twilight hour everyone pays the twilight
 * rate; otherwise the 18 or 9 hole row. Riding is priced into the rate.
 */
export function greenFee(course, dateKey, time, holes, cart) {
  const r = course.rates;
  const row = isTwilight(course, time) ? r.twilight
            : Number(holes) === 9 ? r.nine
            : r.eighteen;
  const weekend = isWeekend(dateKey);
  if (weekend) return cart ? row.weekendRide : row.weekendWalk;
  return cart ? row.weekdayRide : row.weekdayWalk;
}

/** Full cost of one group. */
export function groupTotal(course, dateKey, time, group) {
  return greenFee(course, dateKey, time, group.holes, group.cart) * group.size;
}

export function money(n) {
  return '$' + Number(n).toFixed(2).replace(/\.00$/, '');
}

/* ---------- Day shape ---------- */

/**
 * The rows the sheet renders for one tee on one day: same shape the demo's
 * day() produced. dayData is the day doc's data ({ slots: {...} }) or
 * null/undefined for a day nobody has touched.
 */
export function dayRows(course, dateKey, dayData, tee) {
  const slots = (dayData && dayData.slots) || {};
  return slotTimes(course).map(function (time) {
    const slot = slots[slotKey(tee, time)] || { blocked: false, note: '', groups: [] };
    const groups = slot.groups || [];
    const booked = groups.reduce(function (sum, g) { return sum + g.size; }, 0);
    return {
      time: time,
      label: formatTime(time),
      part: partOfDay(time),
      blocked: !!slot.blocked,
      note: slot.note || '',
      groups: groups,
      players: booked,
      open: slot.blocked ? 0 : Math.max(0, course.slotSize - booked),
      revenue: groups.reduce(function (sum, g) {
        return sum + groupTotal(course, dateKey, time, g);
      }, 0)
    };
  });
}

/* ---------- Small shared helpers ---------- */

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Short human-friendly confirmation code, e.g. "YT-7KQ2MB". */
export function confCode(seedText) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let h = hashString(seedText);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length) + 7919 * (i + 1);
  }
  return 'YT-' + out;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
