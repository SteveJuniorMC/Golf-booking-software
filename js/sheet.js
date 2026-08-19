/* ==========================================================================
   The tee sheet page. Ported from the demo's sheet controller, rebuilt on
   TeeStore: reads arrive through live listeners (no manual re-render after a
   successful write — the snapshot does it), writes are transactions with
   friendly errors surfaced in whichever dialog is open.
   ========================================================================== */

import { auth } from './firebase-init.js';
import { requireAuth } from './guard.js';
import * as store from './store.js';
import * as T from './lib/teetime.js';
import { startTour } from './tour.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

const state = {
  course: null,
  dateKey: null,
  dayData: null,
  filter: 'all',
  tee: 'F',            // which tee the narrow layout shows
  target: null,        // context for whichever dialog is open
  printingBoth: false, // force the two-strip layout while printing
  fromCache: false
};

let unsubDay = null;
let cacheTimer = null;
let tourShown = false;

const wide = window.matchMedia('(min-width: 1100px)');

const el = {};
for (const id of ['course-name', 'user-email', 'course-phone', 'course-phone-wrap', 'offline',
  'date-text', 'date-input', 'today', 'tee-toggle', 'filter', 'sheet-heading', 'thead', 'rows',
  'printed-at', 'booking-dialog', 'booking-form', 'booking-title', 'booking-error', 'booking-sub',
  'booking-save', 'd-name', 'd-size-choices', 'd-phone', 'd-note',
  'group-dialog', 'g-title', 'g-error', 'g-sub', 'g-lines', 'g-cancel-booking', 'g-edit', 'g-move', 'g-checkin',
  'move-dialog', 'move-form', 'move-error', 'move-sub', 'm-date', 'm-tee-field', 'm-find',
  'm-times-field', 'm-times', 'move-save',
  'booking-block', 'block-dialog', 'block-error', 'block-sub', 'block-note', 'block-unblock',
  'block-range-dialog', 'br-form', 'br-error', 'br-sub', 'br-tee-field', 'br-from', 'br-to',
  'br-reason', 'br-consequence', 'br-confirm-wrap', 'br-confirm', 'br-confirm-text', 'br-save']) {
  el[id] = document.getElementById(id);
}

const esc = T.escapeHtml;

function isPast() { return state.dateKey < T.todayKey(state.course.timezone); }
function twoTeeLayout() {
  return state.course.backNine && (wide.matches || state.printingBoth);
}
function teeName(tee) { return tee === 'B' ? 'Back nine' : 'Front nine'; }

/* ---------- Boot ---------- */

requireAuth(function (user) {
  el['user-email'].textContent = user.email || '';
  store.init(user.uid);
  store.listenCourse(function (course) {
    if (!course || course.setupComplete !== true) {
      window.location.replace('setup.html');
      return;
    }
    const firstLoad = !state.course;
    state.course = course;
    if (firstLoad) {
      state.dateKey = T.todayKey(course.timezone);
      subscribeDay();
    }
    el['course-name'].textContent = course.name;
    el['course-phone'].textContent = course.phone;
    el['course-phone-wrap'].hidden = !course.phone;
    document.title = 'Tee Sheet — ' + course.name + ' — YourTeeSheet';
    render();
    if (firstLoad && course.tourDone !== true && !tourShown) {
      tourShown = true;
      startTour({ backNine: course.backNine, onDone: function () {
        store.markTourDone().catch(function () { /* retried on next visit */ });
      } });
    }
  });
});

function subscribeDay() {
  if (unsubDay) unsubDay();
  state.dayData = null;
  unsubDay = store.listenDay(state.dateKey, function (data, fromCache) {
    state.dayData = data;
    state.fromCache = fromCache;
    updateOffline();
    render();
  });
}

function setDate(dateKey) {
  state.dateKey = dateKey;
  subscribeDay();
  render();
}

/* ---------- Offline banner ---------- */

function updateOffline() {
  clearTimeout(cacheTimer);
  if (!navigator.onLine) { el.offline.hidden = false; return; }
  if (state.fromCache) {
    // A cached snapshot right after (re)subscribing is normal; only a stale
    // one that never gets confirmed by the server means trouble.
    cacheTimer = setTimeout(function () {
      el.offline.hidden = !(state.fromCache || !navigator.onLine);
    }, 3000);
  } else {
    el.offline.hidden = true;
  }
}
window.addEventListener('online', updateOffline);
window.addEventListener('offline', updateOffline);

/* ---------- Rendering ---------- */

function render() {
  if (!state.course || !state.dateKey) return;
  const course = state.course;
  const today = T.todayKey(course.timezone);

  const name = state.dateKey === today ? 'Today'
             : state.dateKey === T.addDays(today, 1) ? 'Tomorrow'
             : T.formatLong(state.dateKey).split(',')[0];
  el['date-text'].innerHTML =
    '<b>' + name + '</b><small>' + T.formatShort(state.dateKey).date + ', ' +
    state.dateKey.slice(0, 4) + ' &#9662;</small>';
  el['date-input'].value = state.dateKey;
  el.today.hidden = state.dateKey === today;
  el['tee-toggle'].hidden = !(course.backNine && !wide.matches);

  el['sheet-heading'].textContent =
    T.formatLong(state.dateKey) + ' · ' +
    (T.isWeekend(state.dateKey) ? 'Weekend rates' : 'Weekday rates') + ' · ' +
    'First tee ' + T.formatTime(course.firstTee) + ', last tee ' + T.formatTime(course.lastTee);

  el['printed-at'].textContent = new Date().toLocaleString();

  const past = isPast();
  if (twoTeeLayout()) renderTwoTees(past);
  else renderOneTee(course.backNine ? state.tee : 'F', past);
}

function rowPassesFilter(row) {
  if (state.filter === 'booked') return row.players > 0 || row.blocked;
  if (state.filter === 'open') return !row.blocked && row.open > 0;
  return true;
}

function noMatchRow(cols) {
  return '<tr><td colspan="' + cols + '" style="padding:1.5rem;font-weight:700">' +
    'No tee times match that filter.</td></tr>';
}

function renderOneTee(tee, past) {
  const rows = T.dayRows(state.course, state.dateKey, state.dayData, tee);
  el.thead.innerHTML = '<tr>' +
    '<th scope="col" style="width:6.5rem">Time</th>' +
    '<th scope="col">' + (state.course.backNine ? esc(teeName(tee)) : 'Players') +
      ' — ' + state.course.slotSize + ' spots per tee time</th>' +
    '<th scope="col" style="width:6.5rem">Fees</th></tr>';

  const visible = rows.filter(rowPassesFilter);
  let lastHour = null;
  el.rows.innerHTML = visible.map(function (row) {
    const hour = row.time.slice(0, 2);
    const newHour = hour !== lastHour;
    lastHour = hour;
    return renderRow(row, tee, newHour, past);
  }).join('') || noMatchRow(3);
}

function rowClasses(row, newHour) {
  const classes = ['row'];
  if (newHour) classes.push('row--hour');
  if (row.blocked && row.players === 0) classes.push('row--blocked');
  else if (row.open === 0 && row.players > 0) classes.push('row--full');
  else if (!row.blocked && row.players === 0) classes.push('row--open');
  return classes.join(' ');
}

function renderRow(row, tee, newHour, past) {
  // With back nine on, the toggled single-tee view names the tee right under
  // the time, where the eyes go first.
  const teeLabel = state.course.backNine
    ? '<span class="col-time__tee">' + (tee === 'B' ? 'Back nine' : 'Front nine') + '</span>'
    : '';

  return '<tr class="' + rowClasses(row, newHour) + '">' +
    '<td class="col-time">' + row.label + teeLabel + '</td>' +
    '<td><div class="spots">' + spotsHtml(row, tee, past) + '</div></td>' +
    '<td>' + feesHtml(row) + '</td>' +
  '</tr>';
}

function renderTwoTees(past) {
  const course = state.course;
  const frontRows = T.dayRows(course, state.dateKey, state.dayData, 'F');
  const backRows = T.dayRows(course, state.dateKey, state.dayData, 'B');

  // The front nine keeps the bigger share on purpose; pinning the back
  // nine's share stops the table from squeezing it to almost nothing.
  el.thead.innerHTML = '<tr>' +
    '<th scope="col" style="width:6.5rem">Time</th>' +
    '<th scope="col" style="width:46%">Front nine — 1st tee</th>' +
    '<th scope="col" style="width:6.5rem">Fees</th>' +
    '<th scope="col" style="width:34%">Back nine — 10th tee</th>' +
    '<th scope="col" style="width:6.5rem">Fees</th></tr>';

  let lastHour = null;
  const html = frontRows.map(function (front, i) {
    const back = backRows[i];
    if (!rowPassesFilter(front) && !rowPassesFilter(back)) return '';
    const hour = front.time.slice(0, 2);
    const newHour = hour !== lastHour;
    lastHour = hour;
    return '<tr class="row' + (newHour ? ' row--hour' : '') + '">' +
      '<td class="col-time">' + front.label + '</td>' +
      '<td class="tee-cell"><div class="spots">' + spotsHtml(front, 'F', past) + '</div></td>' +
      '<td>' + feesHtml(front) + '</td>' +
      '<td class="tee-cell"><div class="spots">' + spotsHtml(back, 'B', past) + '</div></td>' +
      '<td>' + feesHtml(back) + '</td>' +
    '</tr>';
  }).join('');
  el.rows.innerHTML = html || noMatchRow(5);
}

function feesHtml(row) {
  return row.groups.length
    ? '<strong>' + T.money(row.revenue) + '</strong>'
    : '<span class="muted">—</span>';
}

function spotsHtml(row, tee, past) {
  const spots = [];
  const span = ' style="grid-column:span ';

  for (const g of row.groups) {
    const checkedIn = g.status === 'checked-in';
    const meta = (checkedIn ? '<b class="spot__in">IN</b> · ' : '') +
      g.size + ' player' + (g.size === 1 ? '' : 's') + ' · ' + g.holes + ' holes · ' +
      (g.cart ? 'Riding' : 'Walking') + (g.note ? ' · ' + esc(g.note) : '');
    spots.push('<button type="button" class="spot spot--group' + (checkedIn ? ' spot--checked' : '') + '"' +
      span + g.size + '" data-action="details" data-tee="' + tee + '" data-time="' + row.time + '" data-group="' + g.id + '">' +
      '<span class="spot__name">' + esc(g.name) + '</span>' +
      '<span class="spot__meta">' + meta + '</span></button>');
  }

  if (row.blocked) {
    // The blocked chip covers only the unbooked space; groups keep theirs.
    const remaining = state.course.slotSize - row.players;
    if (remaining > 0) {
      const meta = esc(row.note ||
        (row.groups.length ? 'No more bookings on this time' : 'Blocked by the pro shop'));
      spots.push(past
        ? '<span class="spot spot--blocked"' + span + remaining + '">' +
            '<span class="spot__name">Blocked</span>' +
            '<span class="spot__meta">' + meta + '</span></span>'
        : '<button type="button" class="spot spot--blocked"' + span + remaining + '" ' +
            'data-action="blocked" data-tee="' + tee + '" data-time="' + row.time + '">' +
            '<span class="spot__name">Blocked</span>' +
            '<span class="spot__meta">' + meta + '</span></button>');
    }
  } else if (row.open > 0) {
    const word = row.open + ' spot' + (row.open === 1 ? '' : 's');
    spots.push(past
      ? '<span class="spot spot--open spot--past"' + span + row.open + '">' +
          '<span class="spot__name">Open</span>' +
          '<span class="spot__meta">' + word + ' — went unbooked</span></span>'
      : '<button type="button" class="spot spot--open"' + span + row.open + '" ' +
          'data-action="add" data-tee="' + tee + '" data-time="' + row.time + '">' +
          '<span class="spot__name">Open</span>' +
          '<span class="spot__meta">' + word + ' — add booking</span></button>');
  }
  return spots.join('');
}

/* ---------- Toolbar ---------- */

document.getElementById('prev-day').addEventListener('click', function () {
  setDate(T.addDays(state.dateKey, -1));
});
document.getElementById('next-day').addEventListener('click', function () {
  setDate(T.addDays(state.dateKey, 1));
});
el.today.addEventListener('click', function () {
  setDate(T.todayKey(state.course.timezone));
});
el['date-input'].addEventListener('click', function () {
  if (el['date-input'].showPicker) {
    try { el['date-input'].showPicker(); } catch (e) { /* native behaviour */ }
  }
});
el['date-input'].addEventListener('change', function () {
  if (el['date-input'].value) setDate(el['date-input'].value);
});
el.filter.addEventListener('change', function () {
  state.filter = el.filter.value;
  render();
});
document.querySelectorAll('input[name="tee"]').forEach(function (input) {
  input.addEventListener('change', function () {
    state.tee = input.value;
    render();
  });
});
document.getElementById('print').addEventListener('click', function () { window.print(); });
document.getElementById('help').addEventListener('click', function () {
  startTour({ backNine: state.course.backNine, onDone: function () {
    store.markTourDone().catch(function () {});
  } });
});
document.getElementById('signout').addEventListener('click', async function () {
  await signOut(auth);
  window.location.replace('login.html');
});
document.getElementById('block-range').addEventListener('click', openBlockRangeDialog);

wide.addEventListener('change', render);

window.addEventListener('beforeprint', function () {
  if (state.course && state.course.backNine) { state.printingBoth = true; render(); }
});
window.addEventListener('afterprint', function () {
  if (state.printingBoth) { state.printingBoth = false; render(); }
});

/* A screen left on overnight flips to the new day's rules at midnight. */
setInterval(function () {
  if (state.course) render();
}, 60000);

/* ---------- Row actions ---------- */

el.rows.addEventListener('click', function (e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const action = button.getAttribute('data-action');
  const tee = button.getAttribute('data-tee');
  const time = button.getAttribute('data-time');
  const groupId = button.getAttribute('data-group');

  if (action === 'add') return openBookingDialog('add', tee, time);
  if (action === 'details') return openGroupDialog(tee, time, groupId);
  if (action === 'blocked') return openBlockedDialog(tee, time);
});

function rowFor(tee, time) {
  const rows = T.dayRows(state.course, state.dateKey, state.dayData, tee);
  return rows.find(function (r) { return r.time === time; });
}

function groupAt(tee, time, groupId) {
  const row = rowFor(tee, time);
  return row && row.groups.find(function (g) { return g.id === groupId; });
}

function whereLabel(tee, time) {
  return T.formatTime(time) +
    (state.course.backNine ? ' · ' + teeName(tee) : '') +
    ' · ' + T.formatLong(state.dateKey);
}

function priceLine(time) {
  const c = state.course;
  const d = state.dateKey;
  if (T.isTwilight(c, time)) {
    return 'Twilight: ' + T.money(T.greenFee(c, d, time, 18, false)) + ' walking / ' +
      T.money(T.greenFee(c, d, time, 18, true)) + ' riding per player';
  }
  return '18 holes: ' + T.money(T.greenFee(c, d, time, 18, false)) + ' walking / ' +
    T.money(T.greenFee(c, d, time, 18, true)) + ' riding per player';
}

/* ---------- Add / edit booking dialog ---------- */

function sizeChoices(max, checked) {
  let html = '';
  for (let n = 1; n <= max; n++) {
    html += '<label class="choice"><input type="radio" name="d-size" value="' + n + '"' +
      (n === checked ? ' checked' : '') + '><span>' + n + '</span></label>';
  }
  el['d-size-choices'].innerHTML = html;
}

function setRadioValue(name, value) {
  const input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (input) input.checked = true;
}

function openBookingDialog(mode, tee, time, groupId) {
  if (isPast()) return;
  const row = rowFor(tee, time);
  if (!row || row.blocked) return;

  el['booking-error'].hidden = true;
  el['booking-form'].reset();

  el['booking-block'].hidden = mode === 'edit';

  if (mode === 'edit') {
    const group = groupAt(tee, time, groupId);
    if (!group) return;
    state.target = { mode: 'edit', tee: tee, time: time, groupId: groupId };
    el['booking-title'].textContent = 'Edit booking';
    el['booking-save'].textContent = 'Save changes';
    el['booking-sub'].textContent = whereLabel(tee, time);
    sizeChoices(group.size + row.open, group.size);
    el['d-name'].value = group.name;
    el['d-phone'].value = group.phone || '';
    el['d-note'].value = group.note || '';
    setRadioValue('d-holes', String(group.holes));
    setRadioValue('d-cart', group.cart ? 'yes' : 'no');
  } else {
    state.target = { mode: 'add', tee: tee, time: time };
    el['booking-title'].textContent = 'Add booking';
    el['booking-save'].textContent = 'Save booking';
    el['booking-sub'].innerHTML =
      esc(whereLabel(tee, time) + ' · ' + row.open + ' spot' + (row.open === 1 ? '' : 's') + ' open') +
      '<br>' + esc(priceLine(time));
    sizeChoices(row.open, Math.min(2, row.open));
    el['d-name'].value = '';
  }
  el['booking-dialog'].showModal();
  el['d-name'].focus();
}

document.getElementById('booking-cancel').addEventListener('click', function () {
  el['booking-dialog'].close();
});

/* "Block this time" closes only the open space — groups on the time stay. */
el['booking-block'].addEventListener('click', function () {
  const t = state.target;
  el['booking-block'].disabled = true;
  store.setBlocked(state.dateKey, t.tee, t.time, true, '')
    .then(function () {
      el['booking-block'].disabled = false;
      el['booking-dialog'].close();
    })
    .catch(function (err) {
      el['booking-block'].disabled = false;
      el['booking-error'].textContent = err.message || "Couldn't block that time — try again.";
      el['booking-error'].hidden = false;
    });
});

el['booking-form'].addEventListener('submit', function (e) {
  e.preventDefault();
  const name = el['d-name'].value.trim();
  if (!name) {
    el['booking-error'].textContent = 'Add a name for the booking.';
    el['booking-error'].hidden = false;
    return;
  }
  const details = {
    name: name,
    size: Number((document.querySelector('input[name="d-size"]:checked') || {}).value || 1),
    holes: Number(document.querySelector('input[name="d-holes"]:checked').value),
    cart: document.querySelector('input[name="d-cart"]:checked').value === 'yes',
    phone: el['d-phone'].value.trim(),
    note: el['d-note'].value.trim()
  };
  const t = state.target;
  const task = t.mode === 'edit'
    ? store.editGroup(state.course, state.dateKey, t.tee, t.time, t.groupId, details)
    : store.bookGroup(state.course, state.dateKey, t.tee, t.time, details);

  el['booking-save'].disabled = true;
  task.then(function () {
    el['booking-save'].disabled = false;
    el['booking-dialog'].close();
  }).catch(function (err) {
    el['booking-save'].disabled = false;
    el['booking-error'].textContent = err.message || "Couldn't save — try again.";
    el['booking-error'].hidden = false;
  });
});

/* ---------- Group details dialog ---------- */

function openGroupDialog(tee, time, groupId) {
  const group = groupAt(tee, time, groupId);
  if (!group) return;
  state.target = { tee: tee, time: time, groupId: groupId };

  el['g-error'].hidden = true;
  el['g-title'].textContent = group.name;
  el['g-sub'].textContent = whereLabel(tee, time);

  const lines = [
    ['Status', group.status === 'checked-in' ? 'Checked in' : 'Booked'],
    ['Players', String(group.size)],
    ['Holes', group.holes + ' holes'],
    ['Cart', group.cart ? 'Riding' : 'Walking'],
    ['Confirmation', group.conf]
  ];
  if (group.phone) lines.push(['Phone', group.phone]);
  if (group.note) lines.push(['Note', group.note]);

  el['g-lines'].innerHTML = lines.map(function (l) {
    return '<div class="line"><span class="muted">' + l[0] + '</span><span><strong>' +
      esc(l[1]) + '</strong></span></div>';
  }).join('') +
  '<div class="line line--total"><span>Due at the course</span><span>' +
    T.money(T.groupTotal(state.course, state.dateKey, time, group)) + '</span></div>';

  const past = isPast();
  el['g-checkin'].hidden = past || group.status === 'checked-in';
  el['g-cancel-booking'].hidden = past;
  el['g-edit'].hidden = past;
  el['g-move'].hidden = past;
  el['group-dialog'].showModal();
}

document.getElementById('g-close').addEventListener('click', function () {
  el['group-dialog'].close();
});

el['g-checkin'].addEventListener('click', function () {
  const t = state.target;
  store.setGroupStatus(state.dateKey, t.tee, t.time, t.groupId, 'checked-in')
    .then(function () { el['group-dialog'].close(); })
    .catch(function (err) {
      el['g-error'].textContent = err.message || "Couldn't check them in — try again.";
      el['g-error'].hidden = false;
    });
});

el['g-cancel-booking'].addEventListener('click', function () {
  const t = state.target;
  const group = groupAt(t.tee, t.time, t.groupId);
  if (!group) return el['group-dialog'].close();
  if (!window.confirm('Cancel ' + group.name + ' at ' + T.formatTime(t.time) + '?')) return;
  store.cancelGroup(state.dateKey, t.tee, t.time, t.groupId)
    .then(function () { el['group-dialog'].close(); })
    .catch(function (err) {
      el['g-error'].textContent = err.message || "Couldn't cancel — try again.";
      el['g-error'].hidden = false;
    });
});

el['g-edit'].addEventListener('click', function () {
  const t = state.target;
  el['group-dialog'].close();
  openBookingDialog('edit', t.tee, t.time, t.groupId);
});

el['g-move'].addEventListener('click', function () {
  const t = state.target;
  el['group-dialog'].close();
  openMoveDialog(t.tee, t.time, t.groupId);
});

/* ---------- Move dialog ---------- */

function openMoveDialog(tee, time, groupId) {
  const group = groupAt(tee, time, groupId);
  if (!group) return;
  state.target = { tee: tee, time: time, groupId: groupId, group: group, to: null };

  el['move-error'].hidden = true;
  el['move-sub'].textContent = group.name + ' · ' + group.size + ' player' +
    (group.size === 1 ? '' : 's') + ' · now at ' + whereLabel(tee, time);
  el['m-date'].value = state.dateKey;
  el['m-date'].min = T.todayKey(state.course.timezone);
  el['m-tee-field'].hidden = !state.course.backNine;
  setRadioValue('m-tee', tee);
  el['m-times-field'].hidden = true;
  el['m-times'].innerHTML = '';
  el['move-save'].disabled = true;
  el['move-save'].textContent = 'Move booking';
  el['move-dialog'].showModal();
}

el['m-find'].addEventListener('click', async function () {
  const t = state.target;
  const toDate = el['m-date'].value;
  const toTee = state.course.backNine
    ? (document.querySelector('input[name="m-tee"]:checked') || { value: 'F' }).value : 'F';
  el['move-error'].hidden = true;
  if (!toDate || toDate < T.todayKey(state.course.timezone)) {
    el['move-error'].textContent = "Pick today or a day that's still ahead.";
    el['move-error'].hidden = false;
    return;
  }
  el['m-find'].disabled = true;
  try {
    const dayData = toDate === state.dateKey ? state.dayData : await store.getDay(toDate);
    const rows = T.dayRows(state.course, toDate, dayData, toTee).filter(function (r) {
      if (toDate === state.dateKey && toTee === t.tee && r.time === t.time) return false;
      return !r.blocked && r.open >= t.group.size;
    });
    state.target.toDate = toDate;
    state.target.toTee = toTee;
    renderMoveTimes(rows);
  } catch (err) {
    el['move-error'].textContent = "Couldn't look that day up — check your connection and try again.";
    el['move-error'].hidden = false;
  }
  el['m-find'].disabled = false;
});

function renderMoveTimes(rows) {
  const parts = [['morning', 'Morning'], ['midday', 'Midday'], ['afternoon', 'Afternoon']];
  let html = '';
  for (const p of parts) {
    const inPart = rows.filter(function (r) { return r.part === p[0]; });
    if (!inPart.length) continue;
    html += '<p class="small muted" style="margin:.6rem 0 .5rem">' + p[1] + '</p>' +
      '<div class="choices">' + inPart.map(function (r) {
        return '<label class="choice"><input type="radio" name="m-time" value="' + r.time + '">' +
          '<span>' + r.label + '</span></label>';
      }).join('') + '</div>';
  }
  if (!html) {
    html = '<p style="font-weight:700">No open times that fit ' + state.target.group.size +
      ' player' + (state.target.group.size === 1 ? '' : 's') + ' on that day.</p>';
  }
  el['m-times'].innerHTML = html;
  el['m-times-field'].hidden = false;
  el['move-save'].disabled = true;
  document.querySelectorAll('input[name="m-time"]').forEach(function (input) {
    input.addEventListener('change', function () {
      el['move-save'].disabled = false;
      el['move-save'].textContent = 'Move to ' + T.formatTime(input.value);
      state.target.toTime = input.value;
    });
  });
}

document.getElementById('move-cancel').addEventListener('click', function () {
  el['move-dialog'].close();
});

el['move-form'].addEventListener('submit', function (e) {
  e.preventDefault();
  const t = state.target;
  if (!t.toTime) return;
  el['move-save'].disabled = true;
  store.moveGroup(state.course,
    { dateKey: state.dateKey, tee: t.tee, time: t.time, groupId: t.groupId },
    { dateKey: t.toDate, tee: t.toTee, time: t.toTime })
    .then(function () { el['move-dialog'].close(); })
    .catch(function (err) {
      el['move-save'].disabled = false;
      el['move-error'].textContent = err.message || "Couldn't move that booking — try again.";
      el['move-error'].hidden = false;
    });
});

/* ---------- Blocked time (unblock) dialog ---------- */

function openBlockedDialog(tee, time) {
  if (isPast()) return;
  const row = rowFor(tee, time);
  if (!row || !row.blocked) return;
  state.target = { tee: tee, time: time };
  el['block-error'].hidden = true;
  el['block-sub'].textContent = whereLabel(tee, time);
  el['block-note'].textContent = row.note || '';
  el['block-note'].hidden = !row.note;
  el['block-dialog'].showModal();
}

document.getElementById('block-cancel').addEventListener('click', function () {
  el['block-dialog'].close();
});

el['block-unblock'].addEventListener('click', function () {
  const t = state.target;
  el['block-unblock'].disabled = true;
  store.setBlocked(state.dateKey, t.tee, t.time, false)
    .then(function () {
      el['block-unblock'].disabled = false;
      el['block-dialog'].close();
    })
    .catch(function (err) {
      el['block-unblock'].disabled = false;
      el['block-error'].textContent = err.message || "Couldn't unblock that time — try again.";
      el['block-error'].hidden = false;
    });
});

/* ---------- Block a range ---------- */

function openBlockRangeDialog() {
  if (isPast()) return;
  el['br-error'].hidden = true;
  el['br-sub'].textContent = T.formatLong(state.dateKey);
  el['br-tee-field'].hidden = !state.course.backNine;

  const times = T.slotTimes(state.course);
  const options = times.map(function (t) {
    return '<option value="' + t + '">' + T.formatTime(t) + '</option>';
  }).join('');
  el['br-from'].innerHTML = options;
  el['br-to'].innerHTML = options;
  el['br-to'].value = times[Math.min(5, times.length - 1)];
  updateBlockRangeConsequence();
  el['block-range-dialog'].showModal();
}

function blockRangeTimes() {
  const times = T.slotTimes(state.course);
  const from = times.indexOf(el['br-from'].value);
  const to = times.indexOf(el['br-to'].value);
  if (from < 0 || to < 0 || to < from) return [];
  return times.slice(from, to + 1);
}

function updateBlockRangeConsequence() {
  const tee = state.course.backNine
    ? (document.querySelector('input[name="br-tee"]:checked') || { value: 'F' }).value : 'F';
  const times = blockRangeTimes();
  const rows = T.dayRows(state.course, state.dateKey, state.dayData, tee);
  let groups = 0;
  for (const row of rows) {
    if (times.includes(row.time)) groups += row.groups.length;
  }
  if (!times.length) {
    el['br-consequence'].textContent = 'The "through" time has to come after the "from" time.';
    el['br-consequence'].hidden = false;
    el['br-confirm-wrap'].hidden = true;
    el['br-save'].disabled = true;
    return;
  }
  el['br-save'].disabled = false;
  el['br-save'].textContent = 'Block ' + times.length + ' time' + (times.length === 1 ? '' : 's');
  if (groups > 0) {
    el['br-consequence'].innerHTML = 'This blocks <strong>' + times.length + ' tee time' +
      (times.length === 1 ? '' : 's') + '</strong>, and <strong>' + groups + ' booked group' +
      (groups === 1 ? '' : 's') + '</strong> on them will be removed.';
    el['br-consequence'].hidden = false;
    el['br-confirm-text'].textContent = 'I understand ' +
      (groups === 1 ? 'that group comes' : 'those ' + groups + ' groups come') + ' off the sheet';
    el['br-confirm'].checked = false;
    el['br-confirm-wrap'].hidden = false;
  } else {
    el['br-consequence'].hidden = true;
    el['br-confirm-wrap'].hidden = true;
  }
}

el['br-from'].addEventListener('change', updateBlockRangeConsequence);
el['br-to'].addEventListener('change', updateBlockRangeConsequence);
document.querySelectorAll('input[name="br-tee"]').forEach(function (input) {
  input.addEventListener('change', updateBlockRangeConsequence);
});

document.getElementById('br-cancel').addEventListener('click', function () {
  el['block-range-dialog'].close();
});

el['br-form'].addEventListener('submit', function (e) {
  e.preventDefault();
  if (!el['br-confirm-wrap'].hidden && !el['br-confirm'].checked) {
    el['br-error'].textContent = 'Tick the box to confirm removing those groups.';
    el['br-error'].hidden = false;
    return;
  }
  const tee = state.course.backNine
    ? (document.querySelector('input[name="br-tee"]:checked') || { value: 'F' }).value : 'F';
  const times = blockRangeTimes();
  el['br-save'].disabled = true;
  store.blockRange(state.dateKey, tee, times, el['br-reason'].value.trim())
    .then(function () {
      el['br-save'].disabled = false;
      el['block-range-dialog'].close();
    })
    .catch(function (err) {
      el['br-save'].disabled = false;
      el['br-error'].textContent = err.message || "Couldn't block those times — try again.";
      el['br-error'].hidden = false;
    });
});
