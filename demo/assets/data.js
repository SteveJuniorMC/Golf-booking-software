/* ==========================================================================
   Cedar Ridge tee time demo — shared data layer
   --------------------------------------------------------------------------
   Both halves of the demo (the public booking page and the pro shop tee
   sheet) read and write through this file, so a tee time booked online shows
   up on the tee sheet on the next refresh.

   Demo bookings are generated deterministically from the date, which means
   the sheet looks the same every time you open it — but anything you change
   is saved to localStorage on top, so a live walkthrough behaves like a real
   system. TeeDemo.reset() puts it back to the starting state.
   ========================================================================== */

window.TeeDemo = (function () {
  'use strict';

  /* ---------- Course setup ------------------------------------------------ */

  var COURSE = {
    name: 'Cedar Ridge Golf Club',
    tagline: '18 holes · Public · Asheville, NC',
    phone: '(828) 555-0147',
    firstTee: '06:30',
    lastTee: '18:00',
    intervalMinutes: 10,
    slotSize: 4,
    // Same shape as the product's rate grid: direct dollars per player,
    // walking/riding priced separately. After the twilight hour everyone
    // pays the twilight rate.
    rates: {
      eighteen: { weekdayWalk: 45, weekdayRide: 60, weekendWalk: 65, weekendRide: 80 },
      nine:     { weekdayWalk: 25, weekdayRide: 35, weekendWalk: 35, weekendRide: 45 },
      twilight: { enabled: true, after: '15:00',
                  weekdayWalk: 30, weekdayRide: 40, weekendWalk: 40, weekendRide: 50 }
    },
    policy: 'Free cancellation up to 24 hours before your tee time. ' +
            'Please check in at the pro shop 20 minutes before you play.'
  };

  var STORAGE_KEY = 'cedarridge.teedemo.v1';

  /* ---------- Dates and times -------------------------------------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 'YYYY-MM-DD' for a Date, in the browser's own timezone. */
  function toKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function fromKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function todayKey() { return toKey(new Date()); }

  function addDays(key, n) {
    var d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function isWeekend(key) {
    var day = fromKey(key).getDay();
    return day === 0 || day === 6;
  }

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  /** "Monday, August 17, 2026" */
  function formatLong(key) {
    var d = fromKey(key);
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /** "Mon" / "Aug 17" pieces for the date picker buttons. */
  function formatShort(key) {
    var d = fromKey(key);
    return {
      weekday: DAYS[d.getDay()].slice(0, 3),
      date: MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate()
    };
  }

  function minutesOf(hhmm) {
    var p = hhmm.split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function hhmmOf(minutes) {
    return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
  }

  /** "06:30" -> "6:30 AM" */
  function formatTime(hhmm) {
    var p = hhmm.split(':');
    var h = Number(p[0]);
    var suffix = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + p[1] + ' ' + suffix;
  }

  /** Every tee time the course sells in a day, e.g. ["06:30","06:40",...]. */
  function slotTimes() {
    var out = [];
    var end = minutesOf(COURSE.lastTee);
    for (var m = minutesOf(COURSE.firstTee); m <= end; m += COURSE.intervalMinutes) {
      out.push(hhmmOf(m));
    }
    return out;
  }

  /** Morning / midday / afternoon buckets, used to filter the booking page. */
  function partOfDay(hhmm) {
    var m = minutesOf(hhmm);
    if (m < 11 * 60) return 'morning';
    if (m < 15 * 60) return 'midday';
    return 'afternoon';
  }

  /* ---------- Pricing (matches the product's rate model) ------------------ */

  function isTwilight(time) {
    var tw = COURSE.rates.twilight;
    return !!tw.enabled && minutesOf(time) >= minutesOf(tw.after);
  }

  /** Green fee per player: twilight row after the hour, else 18/9 row;
      weekday/weekend column by date; walking or riding by cart. */
  function greenFee(dateKey, time, holes, cart) {
    var r = COURSE.rates;
    var row = isTwilight(time) ? r.twilight : (Number(holes) === 9 ? r.nine : r.eighteen);
    if (isWeekend(dateKey)) return cart ? row.weekendRide : row.weekendWalk;
    return cart ? row.weekdayRide : row.weekdayWalk;
  }

  /** Full cost of one group — riding is priced into the rate. */
  function groupTotal(dateKey, time, group) {
    return greenFee(dateKey, time, group.holes, group.cart) * group.size;
  }

  function money(n) {
    return '$' + Number(n).toFixed(2).replace(/\.00$/, '');
  }

  /* ---------- Seeded demo bookings ---------------------------------------- */

  /* A tiny deterministic PRNG so the same date always produces the same
     starting tee sheet — important when you are demoing to a lead twice. */

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rngFrom(seed) {
    var x = seed || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;  x >>>= 0;
      return x / 4294967296;
    };
  }

  var LAST_NAMES = [
    'Alvarez', 'Bennett', 'Caldwell', 'Doyle', 'Ellison', 'Foster', 'Garrity',
    'Hollis', 'Ingram', 'Jarrett', 'Keane', 'Lindqvist', 'Mercer', 'Novak',
    "O'Shea", 'Pruitt', 'Quinn', 'Rasmussen', 'Sandoval', 'Tillman', 'Underwood',
    'Vance', 'Whitfield', 'Yates', 'Zeller', 'Barlow', 'Chandler', 'Dunbar'
  ];

  var FIRST_NAMES = [
    'Alan', 'Beth', 'Carlos', 'Dana', 'Ed', 'Fran', 'Greg', 'Hannah', 'Ian',
    'Jill', 'Kevin', 'Lena', 'Marcus', 'Nora', 'Omar', 'Paula', 'Rick', 'Sara',
    'Tom', 'Vince', 'Wes', 'Yuki'
  ];

  var STANDING_NOTES = [
    'Member — charge to account',
    'League play',
    'Senior rate applied',
    'Requested cart with GPS',
    'Corporate outing deposit paid',
    'Junior clinic group'
  ];

  /** How busy a given tee time tends to be — prime morning times fill first. */
  function demandFor(dateKey, time) {
    var m = minutesOf(time);
    var weekend = isWeekend(dateKey);
    if (m < 7 * 60) return weekend ? 0.55 : 0.30;
    if (m < 10 * 60 + 30) return weekend ? 0.92 : 0.62;
    if (m < 14 * 60) return weekend ? 0.62 : 0.38;
    if (m < 16 * 60 + 30) return weekend ? 0.48 : 0.30;
    return weekend ? 0.28 : 0.18;
  }

  /**
   * The starting state of a day's tee sheet, before any changes made in the
   * demo. Returns { "06:30": slot, ... } where a slot looks like:
   *   { blocked: false, note: '', groups: [ group, ... ] }
   * and a group looks like:
   *   { id, name, size, holes, cart, phone, email, source, status, conf }
   */
  function seedDay(dateKey) {
    var rnd = rngFrom(hashString('cedar-' + dateKey));
    var times = slotTimes();
    var day = {};
    var todaysKey = todayKey();
    var nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    times.forEach(function (time, index) {
      var slot = { blocked: false, note: '', groups: [] };
      day[time] = slot;

      // One maintenance block a day, mid-morning, so the demo shows the feature.
      if (index === 24 && rnd() < 0.9) {
        slot.blocked = true;
        slot.note = 'Course maintenance — greens mowing';
        return;
      }

      var demand = demandFor(dateKey, time);
      if (rnd() > demand) return;                 // nobody on this time

      var seats = COURSE.slotSize;
      var first = 1 + Math.floor(rnd() * 4);      // party of 1–4
      var size = Math.min(first, seats);
      slot.groups.push(makeSeedGroup(rnd, dateKey, time, size));
      seats -= size;

      // Singles and pairs often get paired up with another group.
      if (seats > 0 && rnd() < 0.45) {
        var second = Math.min(1 + Math.floor(rnd() * seats), seats);
        slot.groups.push(makeSeedGroup(rnd, dateKey, time, second));
      }

      // On today's sheet, groups that already teed off are checked in.
      if (dateKey === todaysKey && minutesOf(time) < nowMinutes) {
        slot.groups.forEach(function (g) { g.status = 'checked-in'; });
      }
    });

    return day;
  }

  function makeSeedGroup(rnd, dateKey, time, size) {
    var last = LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)];
    var first = FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)];
    var online = rnd() < 0.6;
    var m = minutesOf(time);
    var nine = m >= 15 * 60 && rnd() < 0.5;       // late rounds are often 9

    return {
      id: 'seed-' + dateKey + '-' + time + '-' + Math.floor(rnd() * 100000),
      name: first + ' ' + last,
      size: size,
      holes: nine ? 9 : 18,
      cart: rnd() < 0.72,
      phone: '(828) 555-0' + (100 + Math.floor(rnd() * 899)),
      email: (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
      source: online ? 'online' : 'proshop',
      status: 'booked',
      note: rnd() < 0.15 ? STANDING_NOTES[Math.floor(rnd() * STANDING_NOTES.length)] : '',
      conf: confCode(dateKey + time + last)
    };
  }

  function confCode(seedText) {
    var alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var h = hashString(seedText);
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += alphabet[h % alphabet.length];
      h = Math.floor(h / alphabet.length) + 7919 * (i + 1);
    }
    return 'CR-' + out;
  }

  /* ---------- Saved changes (localStorage, with a memory fallback) --------- */

  var memoryStore = null;

  function readStore() {
    if (memoryStore) return memoryStore;
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      // Opening the files straight off disk can block localStorage in some
      // browsers. The demo still works, it just forgets on reload.
      memoryStore = {};
      return memoryStore;
    }
  }

  function writeStore(store) {
    if (memoryStore) { memoryStore = store; return; }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      memoryStore = store;
    }
  }

  /** Is browser storage actually working? Used to warn during a demo. */
  function storageWorks() {
    try {
      window.localStorage.setItem(STORAGE_KEY + '.test', '1');
      window.localStorage.removeItem(STORAGE_KEY + '.test');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * The current tee sheet for a day: seeded bookings with any saved changes
   * layered on top. Returns an array in tee time order.
   */
  function day(dateKey) {
    var seeded = seedDay(dateKey);
    var saved = readStore()[dateKey] || {};

    return slotTimes().map(function (time) {
      var slot = Object.prototype.hasOwnProperty.call(saved, time)
        ? saved[time]
        : seeded[time];

      slot = slot || { blocked: false, note: '', groups: [] };
      var groups = slot.groups || [];
      var booked = groups.reduce(function (sum, g) { return sum + g.size; }, 0);

      return {
        time: time,
        label: formatTime(time),
        part: partOfDay(time),
        blocked: !!slot.blocked,
        note: slot.note || '',
        groups: groups,
        players: booked,
        open: slot.blocked ? 0 : Math.max(0, COURSE.slotSize - booked),
        revenue: groups.reduce(function (sum, g) {
          return sum + groupTotal(dateKey, time, g);
        }, 0)
      };
    });
  }

  function slotAt(dateKey, time) {
    var found = null;
    day(dateKey).forEach(function (s) { if (s.time === time) found = s; });
    return found;
  }

  /** Persist one tee time's contents, overriding whatever was seeded. */
  function saveSlot(dateKey, time, slot) {
    var store = readStore();
    if (!store[dateKey]) store[dateKey] = {};
    store[dateKey][time] = {
      blocked: !!slot.blocked,
      note: slot.note || '',
      groups: slot.groups || []
    };
    writeStore(store);
  }

  /* ---------- Actions shared by both pages -------------------------------- */

  /**
   * Add a group to a tee time. Used by the public booking page and by the
   * pro shop's "add booking" form. Returns the saved group.
   */
  function book(dateKey, time, details) {
    var slot = slotAt(dateKey, time);
    if (!slot) throw new Error('That tee time is not on the sheet.');
    if (slot.blocked) throw new Error('That tee time is blocked.');
    if (details.size > slot.open) {
      throw new Error('Only ' + slot.open + ' spot' + (slot.open === 1 ? '' : 's') + ' left on that tee time.');
    }

    var group = {
      id: 'b' + hashString(dateKey + time + details.name + String(Object.keys(readStore()).length)) + '-' + slot.groups.length,
      name: details.name,
      size: Number(details.size),
      holes: Number(details.holes),
      cart: !!details.cart,
      phone: details.phone || '',
      email: details.email || '',
      source: details.source || 'online',
      status: details.status || 'booked',
      note: details.note || '',
      conf: confCode(dateKey + time + details.name + slot.groups.length + String(Math.floor(Math.random() * 9999)))
    };

    saveSlot(dateKey, time, {
      blocked: false,
      note: slot.note,
      groups: slot.groups.concat([group])
    });

    return group;
  }

  function cancelGroup(dateKey, time, groupId) {
    var slot = slotAt(dateKey, time);
    if (!slot) return;
    saveSlot(dateKey, time, {
      blocked: slot.blocked,
      note: slot.note,
      groups: slot.groups.filter(function (g) { return g.id !== groupId; })
    });
  }

  function setGroupStatus(dateKey, time, groupId, status) {
    var slot = slotAt(dateKey, time);
    if (!slot) return;
    saveSlot(dateKey, time, {
      blocked: slot.blocked,
      note: slot.note,
      groups: slot.groups.map(function (g) {
        return g.id === groupId ? Object.assign({}, g, { status: status }) : g;
      })
    });
  }

  /** Close (or reopen) the unbooked space. Groups on the time always stay —
      only blockRange removes groups, behind the sheet's confirmation. */
  function setBlocked(dateKey, time, blocked, note) {
    var slot = slotAt(dateKey, time);
    if (!slot) return;
    saveSlot(dateKey, time, {
      blocked: blocked,
      note: blocked ? (note || '') : '',
      groups: slot.groups
    });
  }

  /** Block every listed time on the day, clearing anything on them. */
  function blockRange(dateKey, times, note) {
    times.forEach(function (time) {
      saveSlot(dateKey, time, { blocked: true, note: note || '', groups: [] });
    });
  }

  /** Change a group's details in place; refuses if a bigger party won't fit. */
  function editGroup(dateKey, time, groupId, changes) {
    var slot = slotAt(dateKey, time);
    if (!slot) throw new Error('That booking is no longer on this tee time.');
    var group = null;
    slot.groups.forEach(function (g) { if (g.id === groupId) group = g; });
    if (!group) throw new Error('That booking is no longer on this tee time.');
    var othersTaken = slot.players - group.size;
    var newSize = Number(changes.size);
    if (newSize > COURSE.slotSize - othersTaken) {
      var room = COURSE.slotSize - othersTaken;
      throw new Error('Only ' + room + ' spot' + (room === 1 ? '' : 's') +
        ' on that tee time — a party of ' + newSize + " won't fit.");
    }
    saveSlot(dateKey, time, {
      blocked: slot.blocked,
      note: slot.note,
      groups: slot.groups.map(function (g) {
        return g.id !== groupId ? g : Object.assign({}, g, {
          name: changes.name,
          size: newSize,
          holes: Number(changes.holes),
          cart: !!changes.cart,
          phone: changes.phone || '',
          note: changes.note || ''
        });
      })
    });
  }

  /** Move a group to another time, possibly on another day. */
  function moveGroup(from, to) {
    var fromSlot = slotAt(from.dateKey, from.time);
    var group = null;
    if (fromSlot) fromSlot.groups.forEach(function (g) { if (g.id === from.groupId) group = g; });
    if (!group) throw new Error('That booking is no longer where it was.');

    var toSlot = slotAt(to.dateKey, to.time);
    if (!toSlot) throw new Error('That tee time is not on the sheet.');
    if (toSlot.blocked) throw new Error('That tee time is blocked.');
    if (group.size > toSlot.open) {
      throw new Error('Only ' + toSlot.open + ' spot' + (toSlot.open === 1 ? '' : 's') +
        ' left on that tee time.');
    }

    saveSlot(from.dateKey, from.time, {
      blocked: fromSlot.blocked,
      note: fromSlot.note,
      groups: fromSlot.groups.filter(function (g) { return g.id !== from.groupId; })
    });
    // Re-read in case the move stays on the same day (store just changed).
    var freshTo = slotAt(to.dateKey, to.time);
    saveSlot(to.dateKey, to.time, {
      blocked: false,
      note: freshTo.note,
      groups: freshTo.groups.concat([group])
    });
  }

  /** Day totals for the tee sheet header. */
  function totals(dateKey) {
    var rows = day(dateKey);
    var t = { slots: rows.length, booked: 0, openSlots: 0, blocked: 0, players: 0, revenue: 0, online: 0 };
    rows.forEach(function (row) {
      t.players += row.players;
      t.revenue += row.revenue;
      if (row.blocked) t.blocked++;
      else if (row.players > 0) t.booked++;
      else t.openSlots++;
      row.groups.forEach(function (g) { if (g.source === 'online') t.online += g.size; });
    });
    t.fillRate = t.slots ? Math.round((t.players / ((t.slots - t.blocked) * COURSE.slotSize)) * 100) : 0;
    return t;
  }

  function reset() {
    memoryStore = null;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nothing to clear */ }
  }

  /* ---------- Small shared UI helpers ------------------------------------- */

  /** Fill in the demo bar + course name that both pages share. */
  function paintChrome() {
    document.querySelectorAll('[data-course-name]').forEach(function (el) {
      el.textContent = COURSE.name;
    });
    document.querySelectorAll('[data-course-tagline]').forEach(function (el) {
      el.textContent = COURSE.tagline;
    });
    document.querySelectorAll('[data-course-phone]').forEach(function (el) {
      el.textContent = COURSE.phone;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  return {
    COURSE: COURSE,
    toKey: toKey,
    fromKey: fromKey,
    todayKey: todayKey,
    addDays: addDays,
    isWeekend: isWeekend,
    formatLong: formatLong,
    formatShort: formatShort,
    formatTime: formatTime,
    minutesOf: minutesOf,
    slotTimes: slotTimes,
    partOfDay: partOfDay,
    greenFee: greenFee,
    isTwilight: isTwilight,
    groupTotal: groupTotal,
    money: money,
    day: day,
    slotAt: slotAt,
    book: book,
    cancelGroup: cancelGroup,
    setGroupStatus: setGroupStatus,
    setBlocked: setBlocked,
    blockRange: blockRange,
    editGroup: editGroup,
    moveGroup: moveGroup,
    totals: totals,
    reset: reset,
    storageWorks: storageWorks,
    paintChrome: paintChrome,
    escapeHtml: escapeHtml
  };
})();
